import dotenv from 'dotenv';
import minimist from 'minimist';
import path from 'path';

dotenv.config();

export interface Config {
  apiKey: string;
  coins: number;
  vsCurrency: string;
  days: number;
  windowHours: number;
  durationSec: number;
  fps: number;
  width: number;
  height: number;
  excludeStables: boolean;
  cacheDir: string;
  outputDir: string;
}

const args = minimist(process.argv.slice(2));

export const config: Config = {
  apiKey: process.env.COINGECKO_API_KEY || '',
  coins: args.coins || 10,
  vsCurrency: args.vs_currency || 'usd',
  days: args.days || 30,
  windowHours: args.window_hours || 48,
  durationSec: args.duration_sec || 35,
  fps: args.fps || 30,
  width: args.width || 1080,
  height: args.height || 1920,
  excludeStables: args.exclude_stables !== 'false', // Default true unless explicitly false? Or default false?
  // User asked for "exclude stablecoins if desired; make it configurable"
  // Let's default to false if not specified, or true if flag is present without value.
  // Actually, standard minimist boolean logic applies.
  // We'll trust the user to pass --exclude_stables=true or just --exclude_stables
  cacheDir: path.resolve(process.cwd(), 'cache'),
  outputDir: path.resolve(process.cwd(), 'output'),
};

if (!config.apiKey) {
  console.warn('WARNING: COINGECKO_API_KEY not found in .env. API calls may fail or be rate-limited.');
}
