import fs from 'fs';
import path from 'path';
import { config } from './config';

export class AudioMixer {
  private sampleRate = 44100;
  private buffer: Float32Array;
  private assets: Map<string, Float32Array> = new Map();

  constructor(durationSec: number) {
    const totalSamples = Math.ceil(durationSec * this.sampleRate);
    this.buffer = new Float32Array(totalSamples);
  }

  async loadAssets() {
    const soundsDir = path.join(process.cwd(), 'assets', 'sounds');
    
    const loadFile = async (name: string, filename: string) => {
      const filePath = path.join(soundsDir, filename);
      if (fs.existsSync(filePath)) {
        const buffer = await fs.promises.readFile(filePath);
        // Create Float32Array from raw bytes (assuming f32le)
        const float32 = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
        this.assets.set(name, float32);
        console.log(`[Audio] Loaded ${name}: ${float32.length} samples`);
      } else {
        console.warn(`[Audio] Asset not found: ${filePath}`);
      }
    };

    await loadFile('coin', 'coin.pcm');
    await loadFile('wall', 'wall.pcm');
  }

  addEvent(timeSec: number, type: 'coin' | 'wall', volume: number = 1.0) {
    const asset = this.assets.get(type);
    if (!asset) return;

    const startSample = Math.floor(timeSec * this.sampleRate);
    const endSample = startSample + asset.length;

    // Boundary check
    if (startSample >= this.buffer.length) return;
    
    const actualEnd = Math.min(endSample, this.buffer.length);

    // Mix
    for (let i = startSample; i < actualEnd; i++) {
      const assetIndex = i - startSample;
      this.buffer[i] += asset[assetIndex] * volume;
    }
  }

  async export(outputPath: string) {
    // Hard clipper to prevent distortion
    for (let i = 0; i < this.buffer.length; i++) {
        if (this.buffer[i] > 1.0) this.buffer[i] = 1.0;
        else if (this.buffer[i] < -1.0) this.buffer[i] = -1.0;
    }

    // Convert back to Buffer (f32le)
    const buffer = Buffer.from(this.buffer.buffer);
    await fs.promises.writeFile(outputPath, buffer);
    console.log(`[Audio] Exported mixing track to ${outputPath}`);
  }
}
