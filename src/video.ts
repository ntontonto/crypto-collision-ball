import ffmpeg from 'fluent-ffmpeg';
import { PassThrough } from 'stream';
import { config } from './config';
import path from 'path';

export class VideoEncoder {
  command: ffmpeg.FfmpegCommand; // Changed from `any` to `ffmpeg.FfmpegCommand` or rely on inference
  imageStream: PassThrough;
  outputPath: string;

  constructor() {
    this.outputPath = path.join(config.outputDir, 'crypto-mood.mp4');
    this.imageStream = new PassThrough();

    this.command = ffmpeg();
    this.command
      .input(this.imageStream)
      .inputFormat('image2pipe')
      .inputFPS(config.fps)
      // .inputOptions(['-vcodec png']) // Typically not needed for pipe unless probing fails
      .videoCodec('libx264')
      .outputOptions([
        '-pix_fmt yuv420p',
        '-preset fast',
        '-crf 23',
        '-movflags +faststart'
      ])
      .size(`${config.width}x${config.height}`)
      .output(this.outputPath)
      .on('end', () => {
        console.log('Video encoding finished: ' + this.outputPath);
      })
      .on('error', (err) => {
        console.error('Error encoding video:', err);
      });
  }

  writeFrame(buffer: Buffer) {
    this.imageStream.write(buffer);
  }

  finish(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.command.on('end', () => resolve());
      this.command.on('error', (err) => reject(err));
      
      this.imageStream.end();
      this.command.run();
    });
  }
}
