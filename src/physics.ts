import Matter from 'matter-js';
import { config } from './config';

export interface CoinBody {
  id: string; // Coin ID
  body: Matter.Body;
  radius: number;
  smoothedVol: number; // For smooth transition of hop behavior
  timeUntilNextHop: number; // Ms until next hop
  isHopping: boolean;
  hopFrameCount: number;
  hopForceMagnitude: number;
  hopAngle: number;
  isStunned: boolean;
}

export class PhysicsWorld {
  engine: Matter.Engine;
  runner?: Matter.Runner; // Optional if we step manually
  width: number;
  height: number;
  coinBodies: Map<string, CoinBody> = new Map();
  
  // Date slider margin
  topMargin = 200; // UI area
  
  // Explicit box definition
  readonly boxMargin = 60; // Side/Bottom margin
  readonly boxTop = 400;   // Top of the box (Lowered for time bar)
  // Box dimensions:
  // x: boxMargin ... width - boxMargin
  // y: boxTop ... boxTop + (width - 2*boxMargin) [Square]

  // Physics tuning
  readonly HOP_INTERVAL_MS = 4000; 
  readonly FRICTION_AIR = 0.01; 
  readonly DENSITY_PER_RADIUS = 0.00005; // Density x Radius = Constant => Mass ~ r^3

  constructor() {
    this.width = config.width;
    this.height = config.height;

    this.engine = Matter.Engine.create();
    this.engine.gravity.y = 0; 
    
    // Walls
    const wallOptions = { isStatic: true, friction: 0.0, restitution: 0.0 }; 
    const wallThickness = 100;
    
    // Square Box Logic
    const boxInnerWidth = this.width - 2 * this.boxMargin;
    const boxInnerHeight = boxInnerWidth; // Apply Square Constraint

    // Explicit box walls
    // Top Wall
    const topWall = Matter.Bodies.rectangle(
        this.width / 2, 
        this.boxTop - wallThickness/2, 
        this.width - 2 * this.boxMargin + wallThickness * 2, 
        wallThickness, 
        wallOptions
    );
    
    // Bottom Wall (at boxTop + height)
    const bottomWall = Matter.Bodies.rectangle(
        this.width / 2, 
        this.boxTop + boxInnerHeight + wallThickness/2, 
        this.width - 2 * this.boxMargin + wallThickness * 2, 
        wallThickness, 
        wallOptions
    );
    
    // Left Wall
    const leftWall = Matter.Bodies.rectangle(
        this.boxMargin - wallThickness/2, 
        this.boxTop + boxInnerHeight / 2, 
        wallThickness, 
        boxInnerHeight + wallThickness * 2, 
        wallOptions
    );
    
    // Right Wall
    const rightWall = Matter.Bodies.rectangle(
        this.width - this.boxMargin + wallThickness/2, 
        this.boxTop + boxInnerHeight / 2, 
        wallThickness, 
        boxInnerHeight + wallThickness * 2, 
        wallOptions
    );

    Matter.World.add(this.engine.world, [topWall, bottomWall, leftWall, rightWall]);
  }

  setupCoins(ids: string[]) {
    // Initial radius
    const r0 = 42; 
    
    ids.forEach(id => {
      // Rejection sampling for non-overlapping
      let x = 0, y = 0;
      let safe = false;
      const buffer = r0 + 10;
      const boxW = this.width - 2 * this.boxMargin;
      const boxH = boxW; // Square

      let attempts = 0;
      
      while (!safe && attempts < 100) {
        // Spawn inside the box
        x = this.boxMargin + buffer + Math.random() * (boxW - 2 * buffer);
        y = this.boxTop + buffer + Math.random() * (boxH - 2 * buffer);
        
        // Check overlap with existing
        safe = true;
        for (const cb of this.coinBodies.values()) {
          const dx = x - cb.body.position.x;
          const dy = y - cb.body.position.y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          if (dist < (r0 + cb.radius)) {
            safe = false;
            break;
          }
        }
        attempts++;
      }

      const body = Matter.Bodies.circle(x, y, r0, {
        restitution: 1.1, // Super-elastic for explosive rebounds
        friction: 0.0,    
        frictionAir: this.FRICTION_AIR, 
        density: this.DENSITY_PER_RADIUS * r0, // Mass ~ Volume (r^3)
        label: id
      });

      // Randomized initial phase so they don't all jump at once
      const initialTimer = Math.random() * this.HOP_INTERVAL_MS;

      this.coinBodies.set(id, { 
          id, 
          body, 
          radius: r0, 
          smoothedVol: 0,
          timeUntilNextHop: initialTimer,
          isHopping: false,
          hopFrameCount: 0,
          hopForceMagnitude: 0,
          hopAngle: 0,
          isStunned: false
      });
      Matter.World.add(this.engine.world, body);
    });
  }

  // Called every frame
  update(dtMs: number, coinMetrics: Map<string, { trend: number, vol: number }>) {
    // 1. Update physics
    Matter.Engine.update(this.engine, dtMs);

    // 2. Apply behaviors
    const r_min = 20;
    const r_max = 130;
    const r0 = 42;
    const k_trend = 2.5;
    const radius_follow_alpha = 0.05; 
    
    // Hop parameters
    const vol_follow_alpha = 0.02;

    this.coinBodies.forEach(cb => {
      const metrics = coinMetrics.get(cb.id);
      if (!metrics) return;

      const { trend, vol } = metrics; 

      // A. Target Radius
      const r_target = Math.max(r_min, Math.min(r_max, r0 * (1 + k_trend * trend)));
      const newR = cb.radius + (r_target - cb.radius) * radius_follow_alpha;
      
      if (Math.abs(newR - cb.radius) > 0.1) {
        const scaleFactor = newR / cb.radius;
        Matter.Body.scale(cb.body, scaleFactor, scaleFactor);
        cb.radius = newR;
        // Ensure density scales with radius so Mass ~ r^3
        Matter.Body.setDensity(cb.body, this.DENSITY_PER_RADIUS * newR);
      }

      // B. Smoothed Volatility
      cb.smoothedVol = cb.smoothedVol + (vol - cb.smoothedVol) * vol_follow_alpha;
      const effectiveVol = cb.smoothedVol;

      // C. Periodic Hop
      // Logic: Wait for interval -> Start hopping -> Apply force for N frames -> Stop applying -> Decelerate (friction)
      
      // Calculate speed for Stun mechanic
      const currentSpeed = Matter.Vector.magnitude(cb.body.velocity);
      const STUN_VELOCITY = 15.0; // If faster than this, get stunned
      const RECOVERY_VELOCITY = 1.0; // If slower than this, recover

      // Stun Logic
      if (cb.isStunned) {
          if (currentSpeed < RECOVERY_VELOCITY) {
              cb.isStunned = false; // Recovered
          } else {
              // Still stunned, skip hopping
              cb.isHopping = false;
              return; 
          }
      } else {
          // Check if we should be stunned
          if (currentSpeed > STUN_VELOCITY) {
              cb.isStunned = true;
              cb.isHopping = false;
              return;
          }
      }

      // Calculate Sharpe Ratio (Trend / Volatility)
      // High Sharpe = Stable Growth (Trend > 0, Vol Low) -> Strong Hop, Long Interval
      // Low Sharpe = Unstable/Decline (Trend < 0 or Trend~0, Vol High) -> Weak Hop, Short Interval
      // Vol is normalized [0,1], Trend is normalized [-1,1].
      // We add epsilon to Vol to avoid division by zero.
      const safeVol = effectiveVol + 0.1;
      const sharpeRatio = trend / safeVol; 
      
      // Map Sharpe to [0, 1] range for interpolation.
      // Range estimation: 
      // Max: 1 / 0.1 = 10.
      // Min: -1 / 0.1 = -10.
      // Clamp to [-5, 5] to avoid extremes.
      const clampedSharpe = Math.max(-5, Math.min(5, sharpeRatio));
      const normSharpe = (clampedSharpe + 5) / 10; // 0.0 to 1.0

      if (cb.isHopping) {
          // Continue applying force
          if (cb.hopFrameCount > 0) {
              const strength = cb.hopForceMagnitude;
              const force = { 
                  x: Math.cos(cb.hopAngle) * strength, 
                  y: Math.sin(cb.hopAngle) * strength 
              };
              Matter.Body.applyForce(cb.body, cb.body.position, force);
              cb.hopFrameCount--;
          } else {
              // Finished this hop
              cb.isHopping = false;
              // Determine next interval based on Sharpe
              // Sharpe High -> Long Interval (max 4000)
              // Sharpe Low -> Extremely Short Interval (min 150 - nervous twitching)
              cb.timeUntilNextHop = 150 + 3850 * normSharpe;
          }
      } else {
          // Countdown to next hop
          cb.timeUntilNextHop -= dtMs;
          
          if (cb.timeUntilNextHop <= 0) {
            // Start Hop
            cb.isHopping = true;
            cb.hopFrameCount = 5; 
            
            // Calculate Force based on Sharpe
            // Sharpe High -> Strong Hop (3.0x)
            // Sharpe Low -> Weak Hop (0.05x - barely moving)
            
            // Base scaling (3D Mass: Force ~ Area => Accel ~ 1/r)
            const force_per_area = 0.0002; 
            
            // Factor from Sharpe: 0.05x (Weak) to 3.0x (Strong)
            const sharpeForceFactor = 0.05 + 2.95 * normSharpe;

            const totalStrength = (cb.radius * cb.radius) * force_per_area * sharpeForceFactor;
            cb.hopForceMagnitude = totalStrength;
            
            // Random direction
            cb.hopAngle = Math.random() * 2 * Math.PI;
          }
      }
      
      // Cap velocity strictly
      const v_max = 12; // Reduced from 30
      const speed = Matter.Vector.magnitude(cb.body.velocity);
      if (speed > v_max) {
        Matter.Body.setVelocity(cb.body, Matter.Vector.mult(Matter.Vector.normalise(cb.body.velocity), v_max));
      }

      // STRICT BOUNDARY CHECK
      // If coin tunnels through wall, put it back.
      const buffer = cb.radius + 5;
      const minX = this.boxMargin + buffer;
      const maxX = this.width - this.boxMargin - buffer;
      const minY = this.boxTop + buffer;
      // Square box max Y
      const boxHeight = (this.width - 2 * this.boxMargin);
      const maxY = this.boxTop + boxHeight - buffer;
      
      const pos = cb.body.position;
      let clampedX = pos.x;
      let clampedY = pos.y;
      let clamped = false;

      if (pos.x < minX) { clampedX = minX; clamped = true; }
      else if (pos.x > maxX) { clampedX = maxX; clamped = true; }
      
      if (pos.y < minY) { clampedY = minY; clamped = true; }
      else if (pos.y > maxY) { clampedY = maxY; clamped = true; }

      if (clamped) {
          Matter.Body.setPosition(cb.body, { x: clampedX, y: clampedY });
          // Kill velocity if we hit hard wall to prevent glitching
          Matter.Body.setVelocity(cb.body, { x: cb.body.velocity.x * 0.5, y: cb.body.velocity.y * 0.5 });
      }
    });
  }
}
