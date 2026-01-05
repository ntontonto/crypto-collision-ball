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
    - Generates synthetic sound effects for collisions.
    - Volume scales with impact velocity.

## Installation

```bash
# Install dependencies
pnpm install

# Setup environment
# Create .env file with COINGECKO_API_KEY if needed (optional for demo)
```

## Usage

Generate a video:

```bash
pnpm run generate
```

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--days` | Number of past days to fetch/visualize | `30` |
| `--duration_sec` | Duration of the output video in seconds | `30` |
| `--cols` | (Debug) Number of columns for layout (unused in physics mode) | `5` |
| `--exclude_stables` | Exclude stablecoins (USDT, USDC, etc.) | `true` |

### Example

Generate a 60-second video for the last 7 days:

```bash
pnpm run generate --days=7 --duration_sec=60
```

## Output

Videos are saved to the `output/` directory.
- `crypto-mood.mp4`: Video only.
- `crypto-mood-final.mp4`: Final video with merged audio.

## Architecture

- **`src/index.ts`**: Main orchestration loop.
- **`src/coingecko.ts`**: API client with caching.
- **`src/metrics.ts`**: Statistical analysis engine.
- **`src/physics.ts`**: Matter.js simulation world.
- **`src/render.ts`**: Canvas-based frame renderer.
- **`src/audio.ts`**: PCM audio mixing engine.
- **`src/video.ts`**: FFmpeg video encoding wrapper.