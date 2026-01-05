import { MarketChartData } from './coingecko';

export interface Metrics {
  trend: number; // Slope of log price
  volatility: number; // Stddev of log returns
}

export interface MetricSeries {
  timestamp: number;
  trend: number;
  volatility: number;
  price: number;
}

// Calculates metrics for a single window ending at `endIndex`.
// prices is the full array of prices (or chunk).
function calculateWindowMetrics(values: number[], windowSize: number): Metrics {
  if (values.length < windowSize) {
    return { trend: 0, volatility: 0 };
  }

  // Use only the last `windowSize` elements
  const windowValues = values.slice(-windowSize);

  // 1. Trend: Slope of log prices.
  // We use simple linear regression of log(price) against indices [0, 1, ..., N-1]
  const logPrices = windowValues.map(p => Math.log(p));
  const n = windowValues.length;
  
  // Calculate slope
  // slope = (n*sum(xy) - sum(x)*sum(y)) / (n*sum(x^2) - (sum(x))^2)
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += logPrices[i];
    sumXY += i * logPrices[i];
    sumX2 += i * i;
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

  // 2. Volatility: Stddev of log returns
  // returns r_i = log(p_i) - log(p_{i-1})
  const returns: number[] = [];
  for (let i = 1; i < n; i++) {
    returns.push(logPrices[i] - logPrices[i - 1]);
  }

  // stddev = sqrt( variance )
  // variance = sum((r - mean)^2) / (n-1)
  // For small N, sample stddev is better.
  let sumReturns = 0;
  returns.forEach(r => sumReturns += r);
  const meanReturn = sumReturns / returns.length;

  let sumSqDiff = 0;
  returns.forEach(r => sumSqDiff += (r - meanReturn) ** 2);
  const volatility = Math.sqrt(sumSqDiff / (returns.length - 1 || 1));

  return { trend: slope, volatility };
}

export function computeMetricSeries(
  data: MarketChartData,
  windowHours: number
): MetricSeries[] {
  const { prices } = data;
  const series: MetricSeries[] = [];

  // We can compute metrics starting from index = windowHours
  for (let i = 0; i < prices.length; i++) {
    // Current timestamp at i
    const timestamp = prices[i][0];
    const price = prices[i][1];
    
    // We need 'windowHours' number of data points ending at i.
    // So slice from [i - windowHours + 1] to [i] (inclusive), total windowHours points.
    // If i < windowHours - 1, we don't have enough data.
    // But requirement says "processing last 30 days".
    // We strictly need 48 data points for calculation.
    
    // To ensure we have metrics for the "start" of the 30 days, we assume the input `data` 
    // might ideally strictly cover the 30 days requested. 
    // However, for the very first frame (t=0), we need the *previous* 48 hours.
    // CoinGecko `days=30` actually returns 30 * 24 = 720 points approx?
    // Usually it returns hourly points for the range requested.
    // If we only requested 30 days, indices 0..47 won't have enough history if we start strictly at i=0.
    // BUT the requirement is: "Use CoinGecko hourly price data for the last 30 days".
    // Computations are on "48-hour rolling window".
    // Simply: for the first usable hour, we need 48 prior hours.
    // We might accept "ramp-up" or just return 0, or careful handling.
    // Since we are "visualizing 30 days", maybe we visualize from t=0.
    // If we only fetched 30 days, we can't compute rolling 48h for the first 48 hours properly with full history.
    // We'll just clamp the window to what's available? Or just accept 0?
    // Let's assume we do best effort or start visualizing after window fills?
    // Requirement: "Video starts immediately... 30-day period".
    // So likely the first 2 days will have "incomplete" metrics or we can just treat the available history as the window.
    // Let's use `Math.min(i + 1, windowHours)` data points for the start.
    
    // Extract prices leading up to i
    const startIdx = Math.max(0, i - windowHours + 1);
    const windowSlice = prices.slice(startIdx, i + 1).map(p => p[1]);
    
    // Calculate
    const { trend, volatility } = calculateWindowMetrics(windowSlice, windowHours);
    
    series.push({ timestamp, trend, volatility, price });
  }

  return series;
}

export interface MetricRanges {
  minTrend: number;
  maxTrend: number;
  minVol: number;
  maxVol: number;
}

// Helper to normalize globally across all coins
export function normalizeAllSeries(allSeries: Map<string, MetricSeries[]>): void {
    let allTrends: number[] = [];
    let allVols: number[] = [];

    // 1. Collect all values
    for (const series of allSeries.values()) {
        for (const s of series) {
            allTrends.push(s.trend);
            allVols.push(s.volatility);
        }
    }

    if (allTrends.length === 0) return;

    const getPercentile = (arr: number[], q: number) => {
        const sorted = [...arr].sort((a, b) => a - b);
        const pos = (sorted.length - 1) * q;
        const base = Math.floor(pos);
        const rest = pos - base;
        if (sorted[base + 1] !== undefined) {
          return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
        } else {
          return sorted[base];
        }
    };
    
    // Trend: map p5..p95 to [-1, 1]?
    const tMin = getPercentile(allTrends, 0.05);
    const tMax = getPercentile(allTrends, 0.95);
    
    // Vol: map 0..p95 to 0..1?
    const vMin = 0; // Volatility is always positive, 0 is calm.
    const vMax = getPercentile(allVols, 0.95);
    
    console.log(`[Metrics] Global Normalization Bounds: Trend=[${tMin.toFixed(4)}, ${tMax.toFixed(4)}], VolMax=${vMax.toFixed(4)}`);

    // 2. Apply normalization
    for (const series of allSeries.values()) {
        for (const s of series) {
            // Normalize Trend
            let t = s.trend;
            if (t < tMin) t = tMin;
            if (t > tMax) t = tMax;
            // Map [tMin, tMax] to [-1, 1]
            s.trend = tMin === tMax ? 0 : ((t - tMin) / (tMax - tMin)) * 2 - 1;
            
            // Normalize Volatility
            let v = s.volatility;
            if (v < vMin) v = vMin;
            if (v > vMax) v = vMax;
            // Map [0, vMax] to [0, 1]
            s.volatility = vMax === 0 ? 0 : (v / vMax);
        }
    }
}
