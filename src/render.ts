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

  constructor() {
    this.width = config.width;
    this.height = config.height;
    this.canvas = createCanvas(this.width, this.height);
    this.ctx = this.canvas.getContext('2d');
  }

  async loadAssets(coins: { id: string; image: string }[]) {
    console.log('Loading coin images...');
    for (const coin of coins) {
      try {
        const img = await loadImage(coin.image);
        this.coinImages.set(coin.id, img);
      } catch (err) {
        console.error(`Failed to load image for ${coin.id}:`, err);
        // Fallback or skip?
      }
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

    // 2. Date Slider & Header
    this.drawDateSlider(ctx, currentDate, startDate, endDate, 280);

    // 3. Draw Explicit Box
    // Physics: boxMargin = 60, boxTop = 400
    const boxMargin = 60;
    const boxTop = 400;
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
    const chartY = 1420;
    const chartHeight = 400; 
    const chartWidth = this.width - 2 * margin;

    // Window config (48 hours)
    const windowMs = 48 * 60 * 60 * 1000;
    const endTime = currentDate.getTime();
    const startTime = endTime - windowMs;

    // 1. Prepare Data
    const chartData = new Map<string, { x: number, y: number }[]>();
    let minVal = 0;
    let maxVal = 0;
    
    // Store valid coins for legend/colors
    const activeCoins: string[] = [];

    coinMetrics.forEach((series, id) => {
        // Filter in window
        const inWindow = series.filter(s => s.timestamp >= startTime && s.timestamp <= endTime);
        if (inWindow.length < 2) return;

        // Base price is the price at START of WINDOW (or first available point in window)
        const basePrice = inWindow[0].price;
        if (!basePrice) return;

        const points = inWindow.map(s => {
            const timePct = (s.timestamp - startTime) / windowMs;
            const valPct = (s.price - basePrice) / basePrice;
            return { x: timePct, y: valPct };
        });

        points.forEach(p => {
           if (p.y < minVal) minVal = p.y;
           if (p.y > maxVal) maxVal = p.y;
        });

        chartData.set(id, points);
        activeCoins.push(id);
    });
    
    // Add padding to Y range
    const yRange = maxVal - minVal;
    if (yRange < 0.04) {
        const center = (minVal + maxVal) / 2;
        minVal = center - 0.02;
        maxVal = center + 0.02;
    } else {
        minVal -= yRange * 0.1;
        maxVal += yRange * 0.1;
    }
    
    // 2. Draw Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(margin, chartY, chartWidth, chartHeight);
    
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

  drawDateSlider(
    ctx: any, 
    currentDate: Date, 
    startDate: Date, 
    endDate: Date,
    boxTop: number
  ) {
    const width = this.width;
    const height = 160; 
    const pad = 40;
    const barY = 150; // Lowered from 60
    const barWidth = width - 2 * pad;
    const barHeight = 6;

    // Axis line
    ctx.fillStyle = '#555';
    ctx.fillRect(pad, barY, barWidth, barHeight);

    // Calculate progression 0..1
    const totalMs = endDate.getTime() - startDate.getTime();
    const currentMs = currentDate.getTime() - startDate.getTime();
    const progress = Math.max(0, Math.min(1, currentMs / totalMs));
    
    // Window width (48h relative to 30d)
    const windowMs = 48 * 60 * 60 * 1000;
    const windowRatio = windowMs / totalMs;
    const winWidthPx = Math.max(2, windowRatio * barWidth);
    
    const winX = pad + progress * (barWidth - winWidthPx);
    
    // Draw window
    ctx.fillStyle = 'rgba(100, 200, 255, 0.3)';
    ctx.fillRect(winX, barY - 20, winWidthPx, 46);
    ctx.strokeStyle = 'rgba(100, 200, 255, 0.8)';
    ctx.lineWidth = 2;
    ctx.strokeRect(winX, barY - 20, winWidthPx, 46);

    // Current Timestamp Text
    ctx.fillStyle = '#fff';
    ctx.font = '32px monospace';
    ctx.textAlign = 'right';
    const timeStr = currentDate.toISOString().replace('T', ' ').substring(0, 16);
    ctx.fillText(timeStr, width - pad, barY + 60);

    // Start/End Dates Labels
    ctx.font = '20px sans-serif';
    ctx.fillStyle = '#888';
    ctx.textAlign = 'left';
    ctx.fillText(startDate.toISOString().substring(0, 10), pad, barY + 30);
    ctx.textAlign = 'right';
    ctx.fillText(endDate.toISOString().substring(0, 10), width - pad, barY + 30);
  }

  getBuffer() {
    return this.canvas.toBuffer('image/png');
  }
}
