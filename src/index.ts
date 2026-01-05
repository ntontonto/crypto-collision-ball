import { config } from './config';
import { fetchTopCoins, fetchMarketChart, CoinData } from './coingecko';
import { computeMetricSeries, normalizeAllSeries, MetricSeries } from './metrics';
import { PhysicsWorld } from './physics';
import { Renderer } from './render';
import { VideoEncoder } from './video';

async function main() {
  console.log('Starting Crypto Mood Video Generator...');
  console.log(config);

  // 1. Fetch Data
  const coins = await fetchTopCoins();
  console.log(`Fetched ${coins.length} coins.`);
  
  if (coins.length === 0) {
    console.error('No coins found. Exiting.');
    return;
  }

  // 2. Metrics for each coin
  const coinMetrics = new Map<string, MetricSeries[]>();
  let referenceTimestamps: number[] = [];
  
  for (const coin of coins) {
    console.log(`Fetching data for ${coin.name}...`);
    try {
      const data = await fetchMarketChart(coin.id);
      if (data.prices.length === 0) continue;
      
      const series = computeMetricSeries(data, config.windowHours);
      // Store raw series first
      coinMetrics.set(coin.id, series);
      
      if (referenceTimestamps.length === 0 && series.length > 0) {
        referenceTimestamps = series.map(s => s.timestamp);
      }
      
      // Delay to respect rate limit (Demo key: 30 req/min => ~2s delay to be safe)
      await new Promise(r => setTimeout(r, 2000));
    } catch (err) {
      console.error(`Failed to fetch/process ${coin.name}:`, err);
    }
  }

  if (referenceTimestamps.length === 0) {
    console.error('No metric data available. Exiting.');
    return;
  }

  // Apply Global Normalization
  console.log('Normalizing metrics globally across all coins...');
  normalizeAllSeries(coinMetrics);

  const startDate = new Date(referenceTimestamps[0]);
  const endDate = new Date(referenceTimestamps[referenceTimestamps.length - 1]);
  console.log(`Time range: ${startDate.toISOString()} -> ${endDate.toISOString()}`);

  // 3. Setup Physics & Render
  const world = new PhysicsWorld();
  const renderer = new Renderer();
  const videoEncoder = new VideoEncoder();

  // Load images
  await renderer.loadAssets(coins);

  // Add coins to world
  // Only add coins that we have metrics for
  const validCoinIds = coins.map(c => c.id).filter(id => coinMetrics.has(id));
  world.setupCoins(validCoinIds);

  // 4. Simulation Loop
  const totalFrames = config.durationSec * config.fps;
  const totalTimeMs = endDate.getTime() - startDate.getTime();
  
  console.log(`Generating ${totalFrames} frames...`);

  // Helper to get metrics at a specific time (linear interpolation)
  const getMetricsAt = (coinId: string, time: number) => {
    const series = coinMetrics.get(coinId);
    if (!series) return { trend: 0, vol: 0 };
    
    // Find index
    // Optimization: remember last index?
    // Series is sorted by timestamp.
    for (let i = 0; i < series.length - 1; i++) {
        if (time >= series[i].timestamp && time <= series[i+1].timestamp) {
            const t0 = series[i].timestamp;
            const t1 = series[i+1].timestamp;
            const ratio = (time - t0) / (t1 - t0);
            
            return {
                trend: series[i].trend + (series[i+1].trend - series[i].trend) * ratio,
                vol: series[i].volatility + (series[i+1].volatility - series[i].volatility) * ratio
            };
        }
    }
    // Out of bounds? Clamp.
    if (time < series[0].timestamp) return { trend: series[0].trend, vol: series[0].volatility };
    if (time > series[series.length-1].timestamp) return { trend: series[series.length-1].trend, vol: series[series.length-1].volatility };
    
    return { trend: 0, vol: 0 };
  };

  const dtMs = 1000 / config.fps; // Physics step size matches frame rate? 
  // It's better to step physics with fixed time step, but for video generation we can just sync them.
  // 30fps video means each frame advances video-time by 1/30s.
  // BUT the simulation itself represents 30 days of data in 30 seconds.
  // The physics simulation should run in "real-time" speed visually (bouncing, hopping) 
  // OR should it be sped up?
  // "Generate a vertical short video... icons behave like 'living' particles"
  // Usually this means the physics runs at normal speed (1 sec physics = 1 sec video),
  // but the DATA driving the parameters (trend/vol) is sped up (30 days -> 30 sec).
  // So:
  // Physics dt = 1/30 sec (real time)
  // Data time dt = (30 days) / (30 * 30 frames) = ~1 days / 30 frames = 24h/30 = 0.8 hours = 48 mins per frame.
  
  for (let f = 0; f < totalFrames; f++) {
    const progress = f / totalFrames;
    const currentDataTime = startDate.getTime() + progress * totalTimeMs;
    
    // Get current metrics for all coins
    const currentMetrics = new Map<string, { trend: number, vol: number }>();
    validCoinIds.forEach(id => {
        currentMetrics.set(id, getMetricsAt(id, currentDataTime));
    });

    // Update Physics
    // We step the physics world by 1000/30 ms (approx 33ms)
    world.update(dtMs, currentMetrics);

    // Render
    renderer.renderFrame(
        world, 
        new Date(currentDataTime), 
        startDate, 
        endDate, 
        f,
        coinMetrics
    );
    
    // Encode
    videoEncoder.writeFrame(renderer.getBuffer());
    
    if (f % 30 === 0) {
        console.log(`Frame ${f}/${totalFrames} (${Math.round(progress*100)}%)`);
    }
  }

  // Finish
  await videoEncoder.finish();
  console.log('Done.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
