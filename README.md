# Crypto Mood Physics Video Generator

A CLI tool that generates vertical video content (YouTube Shorts/TikTok) visualizing 7-day cryptocurrency market trends using physics simulations.

## Features

- **Physics-Driven Visualization**: Coins are represented as bouncing balls in a box.
    - **Size**: Proportional to price trend (Trending = Bigger).
    - **Behavior**: "Stable" coins hop powerfully but rarely; "Volatile" coins vibrate frequently.
    - **Collisions**: Explosive restitution and mass simulation ($m \propto r^3$).
- **Data & Metrics**:
    - Fetches real-time data from CoinGecko (Top 10 excl. stablecoins).
    - Computes rolling 48-hour Trend (Slope) and Volatility (StdDev).
    - Global normalization for relative visual sizing.
- **Visuals**:
    - **Leaderboard**: Top 2 gainers displayed with Gold/Silver medals.
    - **Price Chart**: Smoothed line chart showing relative performance below the physics box.
    - **Layout**: Optimized for 9:16 vertical video.
- **Audio Effects**:
    - Generates synthetic sound effects for collisions (Coin/Wall).
    - Volume scales with impact velocity.
- **Automation Pipeline**:
    - **One-Command Operation**: Generates video -> Uploads to YouTube -> Cleans up.
    - **Viral Metadata**: Automatically sets SEO-optimized Titles, Descriptions, and Hashtags.
    - **Logging**: Detailed logs saved to `log/pipeline.log`.

## Installation

```bash
# Install dependencies
pnpm install

# Setup environment
# 1. Create .env with COINGECKO_API_KEY
# 2. Place client_secrets.json (Google Cloud Credential) in root.
# 3. Place token.json (YouTube Auth Token) in root.
```

## Usage

### 1. Manual Generation
Generate a video locally for testing.

```bash
pnpm run generate --days=30 --duration_sec=35
```

### 2. Full Automation
Run the entire pipeline (Generate -> Upload -> Cleanup). Ideal for daily cron jobs.

```bash
pnpm run automate
```

This will:
1. Generate `crypto-mood-final.mp4` (35s).
2. Upload it to YouTube as a **Public Short**.
3. Delete intermediate files.
4. Log activity to `log/pipeline.log`.

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--days` | Number of past days to fetch/visualize | `30` |
| `--duration_sec` | Duration of the output video in seconds | `35` |
| `--exclude_stables` | Exclude stablecoins (USDT, USDC, etc.) | `true` |

## Architecture

- **`src/index.ts`**: Main orchestration loop (also callable as library).
- **`src/pipeline.ts`**: Automation controller.
- **`src/youtube.ts`**: YouTube Data API uploader.
- **`src/logger.ts`**: File logging utility.
- **`src/coingecko.ts`**: API client with caching.
- **`src/physics.ts`**: Matter.js simulation.
- **`src/audio.ts`**: PCM audio mixing.