import { createCanvas, Canvas, CanvasRenderingContext2D, Image, loadImage } from 'canvas';
import { config } from './config';
import { PhysicsWorld } from './physics';
import { MetricSeries } from './metrics';

export class Renderer {
  canvas: Canvas;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  coinImages: Map<string, Image> = new Map();
  coinSymbols: Map<string, string> = new Map();
  medalImages: Map<string, Image> = new Map();

  // Smoothing state for Chart Y-axis
  private smoothMinVal: number | null = null;
  private smoothMaxVal: number | null = null;

  constructor() {
    this.width = config.width;
    this.height = config.height;
    this.canvas = createCanvas(this.width, this.height);
    this.ctx = this.canvas.getContext('2d');
  }

  async loadAssets(coins: { id: string; image: string; symbol: string }[]) {
    console.log('Loading coin images...');
    for (const coin of coins) {
      try {
        const img = await loadImage(coin.image);
        this.coinImages.set(coin.id, img);
        this.coinSymbols.set(coin.id, coin.symbol.toUpperCase());
      } catch (err) {
        console.error(`Failed to load image for ${coin.id}:`, err);
        // Fallback or skip?
      }
    }

    // Load Medals
    try {
        this.medalImages.set('gold', await loadImage('assets/images/medals/gold_medal.png'));
        this.medalImages.set('silver', await loadImage('assets/images/medals/silver_medal.png'));
    } catch (err) {
        console.error('Failed to load medal images:', err);
    }
  }

  renderFrame(
    world: PhysicsWorld,
    currentDate: Date,
    startDate: Date,
    endDate: Date,
    frameIndex: number,
    coinMetrics?: Map<string, MetricSeries[]>
  ) {
    const { ctx, width, height } = this;
    
    // 1. Background
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#1a1a2e');
    gradient.addColorStop(1, '#16213e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // 2. Header
    if (coinMetrics) {
        this.drawHeader(ctx, coinMetrics, currentDate);
    }

    // 2. Date Slider & Header (Removed)
    // this.drawDateSlider(ctx, currentDate, startDate, endDate, 280);

    // 3. Draw Explicit Box
    // Physics: boxMargin = 60, boxTop = 400
    // Physics: boxMargin = 60, boxTop = 280
    const boxMargin = 60;
    const boxTop = 380;
    const boxInnerWidth = width - 2 * boxMargin;
    const boxHeight = boxInnerWidth; // Square
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 4;
    ctx.strokeRect(boxMargin, boxTop, boxInnerWidth, boxHeight);

    // 4. Coins
    world.coinBodies.forEach(cb => {
      const { position } = cb.body;
      const r = cb.radius;
      const img = this.coinImages.get(cb.id);

      ctx.save();
      ctx.translate(position.x, position.y);
      
      // Shadow
      ctx.beginPath();
      ctx.arc(0, 5, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fill();

      // Coin Clip
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();

      // Draw Image
      if (img) {
        ctx.drawImage(img, -r, -r, r * 2, r * 2);
      } else {
        ctx.fillStyle = '#ccc';
        ctx.fill();
      }

      ctx.restore();
    });
    
    // 4. Japanese Overlay Text (Below Slider)
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = '24px sans-serif'; 
    
    // 5. Chart
    if (coinMetrics) {
        this.drawChart(ctx, coinMetrics, currentDate);
    }
  }

  drawChart(
    ctx: CanvasRenderingContext2D, 
    coinMetrics: Map<string, MetricSeries[]>, 
    currentDate: Date
  ) {
    const margin = 60; // Align with box margins
    const chartY = 1400;
    const chartHeight = 400; 
    const chartWidth = this.width - 2 * margin;

    // Window config (48 hours)
    const windowMs = 48 * 60 * 60 * 1000;
    const endTime = currentDate.getTime();
    const startTime = endTime - windowMs;

    // 1. Prepare Data
    const chartData = new Map<string, { x: number, y: number }[]>();
    let targetMin = 0;
    let targetMax = 0;
    let first = true;
    
    // Store valid coins for legend/colors
    const activeCoins: string[] = [];

    coinMetrics.forEach((series, id) => {
        // Filter in window (plus one point before to interpolate start if needed, but simple filter is ok for now)
        // We actually want points *within* the window, plus we need to know the 'current price' at endTime.
        
        // Find points in range [startTime, endTime]
        const inWindow = series.filter(s => s.timestamp >= startTime && s.timestamp <= endTime);
        
        // If no points in window, check if we have surround points to interpolate a straight line?
        // Simplification: if < 1 point in window, try to use last known point.
        // Actually, for smoothness, we need to interpolate the EXACT price at `endTime`.
        
        // Find indices around endTime
        let pNextIdx = series.findIndex(s => s.timestamp > endTime);
        let pPrevIdx = pNextIdx === -1 ? series.length - 1 : pNextIdx - 1;
        
        // Interpolate current price
        let currentPrice = 0;
        if (pPrevIdx >= 0 && series[pPrevIdx]) {
            const pPrev = series[pPrevIdx];
            if (pNextIdx !== -1 && series[pNextIdx]) {
                const pNext = series[pNextIdx];
                const ratio = (endTime - pPrev.timestamp) / (pNext.timestamp - pPrev.timestamp);
                currentPrice = pPrev.price + (pNext.price - pPrev.price) * ratio;
            } else {
                currentPrice = pPrev.price; // Flat line extended
            }
        } else {
            return; // No Data
        }
        
        // Determine Base Price (price at startTime).
        // Similar interpolation for startTime
        let basePrice = 0;
        let sNextIdx = series.findIndex(s => s.timestamp > startTime);
        let sPrevIdx = sNextIdx === -1 ? series.length - 1 : sNextIdx - 1;
        
        if (sPrevIdx >= 0 && series[sPrevIdx]) {
             const sPrev = series[sPrevIdx];
             if (sNextIdx !== -1 && series[sNextIdx]) {
                 const sNext = series[sNextIdx];
                 const ratio = (startTime - sPrev.timestamp) / (sNext.timestamp - sPrev.timestamp);
                 basePrice = sPrev.price + (sNext.price - sPrev.price) * ratio;
             } else {
                 basePrice = sPrev.price;
             }
        } else if (sNextIdx !== -1) {
            // Started after startTime
            basePrice = series[sNextIdx].price;
        } else {
            return;
        }

        if (basePrice === 0) return;

        // Construct points: Existing known points in window + Current Head
        const rawPoints = inWindow; 
        
        // Normalize
        const points = rawPoints.map(s => {
            const timePct = (s.timestamp - startTime) / windowMs;
            const valPct = (s.price - basePrice) / basePrice;
            return { x: timePct, y: valPct };
        });
        
        // Add Head Point
        points.push({ x: 1.0, y: (currentPrice - basePrice) / basePrice });

        // Update Min/Max
        points.forEach(p => {
           if (first) {
             targetMin = p.y;
             targetMax = p.y;
             first = false;
           } else {
             if (p.y < targetMin) targetMin = p.y;
             if (p.y > targetMax) targetMax = p.y;
           }
        });

        chartData.set(id, points);
        activeCoins.push(id);
    });
    
    // Add padding to Y range
    const yRange = targetMax - targetMin;
    if (yRange < 0.04) {
        const center = (targetMin + targetMax) / 2;
        targetMin = center - 0.02;
        targetMax = center + 0.02;
    } else {
        targetMin -= yRange * 0.1;
        targetMax += yRange * 0.1;
    }
    
    // Smoothing (Damping)
    if (this.smoothMinVal === null || this.smoothMaxVal === null) {
        this.smoothMinVal = targetMin;
        this.smoothMaxVal = targetMax;
    } else {
        const alpha = 0.1; // Smoothing factor
        this.smoothMinVal = this.smoothMinVal + (targetMin - this.smoothMinVal) * alpha;
        this.smoothMaxVal = this.smoothMaxVal + (targetMax - this.smoothMaxVal) * alpha;
    }
    
    const minVal = this.smoothMinVal;
    const maxVal = this.smoothMaxVal;
    
    // 2. Draw Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(margin, chartY, chartWidth, chartHeight);
    
    // Draw Date Label (Inside Chart, Top-Left)
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = 'bold 24px sans-serif'; 
    const dateStr = currentDate.toLocaleString('en-US', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', '');
    ctx.fillText(dateStr, margin + 20, chartY + 40);
    
    // Zero line
    if (minVal < 0 && maxVal > 0) {
        const zeroY = chartY + chartHeight - (0 - minVal) / (maxVal - minVal) * chartHeight;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(margin, zeroY);
        ctx.lineTo(margin + chartWidth, zeroY);
        ctx.stroke();
    }

    // 3. Draw Lines
    activeCoins.forEach((id, index) => {
        const points = chartData.get(id);
        if (!points) return;
        
        // Generate Color based on ID string hash to be consistent
        let hash = 0;
        for (let i = 0; i < id.length; i++) {
             hash = id.charCodeAt(i) + ((hash << 5) - hash);
        }
        const hue = Math.abs(hash % 360);
        const color = `hsl(${hue}, 70%, 60%)`;
        
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        
        let lastX = 0;
        let lastY = 0;
        
        points.forEach((p, i) => {
            const px = margin + p.x * chartWidth;
            const py = chartY + chartHeight - (p.y - minVal) / (maxVal - minVal) * chartHeight;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
            
            lastX = px;
            lastY = py;
        });
        ctx.stroke();
        
        // 4. Draw Icon at Tip
        const img = this.coinImages.get(id);
        if (img) {
            const iconSize = 40;
            ctx.save();
            ctx.beginPath();
            ctx.arc(lastX, lastY, iconSize/2 + 2, 0, Math.PI*2);
            ctx.fillStyle = '#fff'; // Border
            ctx.fill();
            
            ctx.beginPath();
            ctx.arc(lastX, lastY, iconSize/2, 0, Math.PI*2);
            ctx.clip();
            ctx.drawImage(img, lastX - iconSize/2, lastY - iconSize/2, iconSize, iconSize);
            ctx.restore();
        }
    });
    
    // Label Y-Axis (Min/Max)
    ctx.font = '24px monospace';
    ctx.fillStyle = '#aaa';
    ctx.textAlign = 'right';
    ctx.fillText(`${(maxVal*100).toFixed(0)}%`, margin - 10, chartY + 24);
    ctx.fillText(`${(minVal*100).toFixed(0)}%`, margin - 10, chartY + chartHeight);
  }


  drawHeader(
    ctx: CanvasRenderingContext2D,
    coinMetrics: Map<string, MetricSeries[]>,
    currentDate: Date
  ) {
      const headerH = 280;
      const width = this.width;

      // Title
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 64px sans-serif'; 
      ctx.fillText("Which coin is best in 7 days?", width / 2, 180);

      // --- Leaderboard ---
      // Determine Top 2 Gainers in current 48h window
      // We reuse logic from Chart to find relative performance.
      const windowMs = 48 * 60 * 60 * 1000;
      const endTime = currentDate.getTime();
      const startTime = endTime - windowMs;

      const performance: { id: string, gain: number }[] = [];

      coinMetrics.forEach((series, id) => {
          // Get End Price (interpolate)
          const pEnd = this.getInterpPrice(series, endTime);
          const pStart = this.getInterpPrice(series, startTime);
          
          if (pStart > 0 && pEnd > 0) {
              const gain = (pEnd - pStart) / pStart;
              performance.push({ id, gain });
          }
      });

      // Sort Descending
      performance.sort((a, b) => b.gain - a.gain);
      const top2 = performance.slice(0, 2);

      // Draw Top 2
      const rowY = 280;
      const gapX = 350; // Distance between Gold and Silver
      const centerX = width / 2;

      top2.forEach((item, index) => {
          const x = centerX + (index === 0 ? -gapX/2 : gapX/2);
          const rank = index + 1;
          const symbol = this.coinSymbols.get(item.id) || item.id;
          const img = this.coinImages.get(item.id);
          const medalImg = index === 0 ? this.medalImages.get('gold') : this.medalImages.get('silver');

          // Common Center Y for this item
          const itemCenterY = rowY;

          // 1. Draw Medal (Left)
          const medalX = x - 85; 
          if (medalImg) {
              const medalR = 32;
              const targetHeight = medalR * 2.4;
              const ratio = medalImg.width / medalImg.height;
              const targetWidth = targetHeight * ratio;
              
              ctx.drawImage(
                  medalImg, 
                  medalX - targetWidth / 2, 
                  itemCenterY - targetHeight / 2, 
                  targetWidth, 
                  targetHeight
              );
          }

          // 2. Draw Coin Icon (Center)
          const iconSize = 64;
          if (img) {
              ctx.save();
              ctx.beginPath();
              ctx.arc(x, itemCenterY, iconSize/2, 0, Math.PI*2);
              ctx.clip();
              ctx.drawImage(img, x - iconSize/2, itemCenterY - iconSize/2, iconSize, iconSize);
              ctx.restore();
          }

          // 3. Draw Ticker (Right)
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle'; 
          ctx.font = 'bold 48px sans-serif';
          ctx.fillStyle = '#fff';
          ctx.fillText(symbol, x + 50, itemCenterY + 2); // +2 for visual optical balancing
      });
  }

  // Helper for basic linear interpolation
  private getInterpPrice(series: MetricSeries[], time: number): number {
      if (series.length === 0) return 0;
      // Find index after time
      const idx = series.findIndex(s => s.timestamp > time);
      if (idx === -1) return series[series.length - 1].price; // After all data
      if (idx === 0) return series[0].price; // Before all data
      
      const pNext = series[idx];
      const pPrev = series[idx - 1];
      const ratio = (time - pPrev.timestamp) / (pNext.timestamp - pPrev.timestamp);
      return pPrev.price + (pNext.price - pPrev.price) * ratio;
  }
  getBuffer() {
    return this.canvas.toBuffer('image/png');
  }
}
