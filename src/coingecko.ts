import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import { config } from './config';

export interface CoinData {
  id: string;
  symbol: string;
  name: string;
  image: string;
}

export interface MarketChartData {
  prices: [number, number][]; // [timestamp, price]
}

const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

async function fetchWithCache<T>(
  key: string,
  fetchFn: () => Promise<T>
): Promise<T> {
  const cachePath = path.join(config.cacheDir, `${key}.json`);

  if (await fs.pathExists(cachePath)) {
    const stat = await fs.stat(cachePath);
    const age = Date.now() - stat.mtimeMs;
    // Disable cache for debugging if needed, but keeping it is fine if we use new keys.
    if (age < CACHE_TTL_MS) {
      console.log(`[Cache] Hit for ${key}`);
      return fs.readJson(cachePath);
    }
  }

  console.log(`[Cache] Miss for ${key}, fetching...`);
  try {
    const data = await fetchFn();
    await fs.writeJson(cachePath, data);
    return data;
  } catch (error) {
    console.error(`Error fetching ${key}:`, error);
    throw error;
  }
}

const apiClient = axios.create({
  baseURL: 'https://api.coingecko.com/api/v3',
  timeout: 30000,
});

if (config.apiKey) {
    apiClient.defaults.headers.common['x-cg-demo-api-key'] = config.apiKey;
}

export async function fetchTopCoins(): Promise<CoinData[]> {
  return fetchWithCache('markets_usd_top10', async () => {
    // We might need to fetch more than 10 if we want to filter stables.
    // Fetch 50 to be safe.
    const perPage = config.excludeStables ? 50 : config.coins;
    
    console.log(`[Coingecko] Fetching markets with key: ${config.apiKey.substring(0, 5)}...`);
    console.log(`[Coingecko] Headers:`, apiClient.defaults.headers.common);

    const response = await apiClient.get('/coins/markets', {
      params: {
        vs_currency: config.vsCurrency,
        order: 'market_cap_desc',
        per_page: perPage,
        page: 1,
        sparkline: false,
      },
    });

    let coins = response.data;

    if (config.excludeStables) {
      const stablecoins = ['usdt', 'usdc', 'dai', 'fdusd', 'tusd', 'usdd', 'usde', 'pyusd']; // Basic list
      // Better: filter by known stable IDs or symbols? CoinGecko doesn't have "is_stable" in markets endpoint easily without generic category filter.
      // We will filter by symbol/id simply.
      coins = coins.filter((c: any) => !stablecoins.includes(c.symbol.toLowerCase()));
    }
    
    const result = coins.slice(0, config.coins).map((c: any) => ({
      id: c.id,
      symbol: c.symbol,
      name: c.name,
      image: c.image,
    }));
    console.log(`[Coingecko] Top coins: ${result.map((c: any) => c.id).join(', ')}`);
    return result;
  });
}

export async function fetchMarketChart(
  coinId: string
): Promise<MarketChartData> {
  return fetchWithCache(`market_chart_${coinId}_${config.days}d`, async () => {
    const response = await apiClient.get(`/coins/${coinId}/market_chart`, {
      params: {
        vs_currency: config.vsCurrency,
        days: config.days,
        // interval: 'hourly', // Removed to avoid Enterprise restriction error (401)
      },
    });
    return { prices: response.data.prices };
  });
}
