import { main as generateVideo } from './index';
import { YouTubeUploader } from './youtube';
import { Logger } from './logger';
import { config } from './config';
import path from 'path';
import fs from 'fs';

async function pipeline() {
  const logger = new Logger('Pipeline');
  logger.info('Starting Automation Pipeline...');

  // 1. Generate Video
  logger.info('Step 1: Metric Fetch & Video Generation');
  let coins: any[] = [];
  try {
      // @ts-ignore - main returns promise of coins
      coins = await generateVideo(); 
      if (!coins || coins.length === 0) {
          logger.error('Video generation failed or yielded no coins. Aborting.');
          process.exit(1);
      }
      logger.info('Video generation complete.');
  } catch (err) {
      logger.error('Error during video generation: ' + err);
      process.exit(1);
  }

  // 2. Upload to YouTube
  logger.info('Step 2: Upload to YouTube');
  const uploader = new YouTubeUploader(logger);
  const videoPath = path.join(config.outputDir, 'crypto-mood-final.mp4');

  if (!fs.existsSync(videoPath)) {
      logger.error(`Video file not found at ${videoPath}. Aborting upload.`);
      process.exit(1);
  }

  try {
      await uploader.uploadVideo(videoPath, coins);
  } catch (err) {
      logger.error('Upload failed: ' + err);
      process.exit(1);
  }

  // 3. Cleanup
  logger.info('Step 3: Cleanup');
  try {
      const files = fs.readdirSync(config.outputDir);
      files.forEach(file => {
          if (file.endsWith('.mp4') || file.endsWith('.pcm')) {
              const filePath = path.join(config.outputDir, file);
              fs.unlinkSync(filePath);
              logger.info(`Deleted: ${file}`);
          }
      });
  } catch (err) {
      logger.error('Cleanup failed: ' + err);
      // Don't exit 1 here, process succeeded mostly
  }

  logger.info('Pipeline finished successfully.');
}

if (require.main === module) {
    pipeline().catch(err => console.error(err));
}
