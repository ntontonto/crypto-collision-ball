import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { Logger } from './logger';

const SCOPES = ['https://www.googleapis.com/auth/youtube.upload'];
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'client_secrets.json');

export class YouTubeUploader {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  async uploadVideo(videoPath: string, coins: any[]) {
    this.logger.info('Initializing YouTube Upload...');

    // 1. Auth using token.json
    const auth = await this.authorize();
    const youtube = google.youtube({ version: 'v3', auth });

    // 2. Generate Metadata
    const dateStr = new Date().toISOString().split('T')[0];
    const topCoin = coins.length > 0 ? coins[0].name : 'Crypto';
    
    const title = 'Which coin is trending? #satisfying #viral #simulation';
    const description = `
Here are crypto mood battle which refrects recent trend. Nice trend, stronger #shorts #simulation #music #bouncyball #oddlysatisfying #satisfying #ball #viral #trending #asmr #adhd #typescript #sound #song #meme #fun #crypto

${coins.map(c => `- ${c.name} (${c.symbol.toUpperCase()})`).join('\n')}
    `.trim();

    this.logger.info(`Title: ${title}`);

    // 3. Upload
    const fileSize = fs.statSync(videoPath).size;
    this.logger.info(`Uploading video: ${videoPath} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);

    try {
        const res = await youtube.videos.insert({
            part: ['snippet', 'status'],
            requestBody: {
                snippet: {
                    title,
                    description,
                    tags: ['crypto', 'bitcoin', 'ethereum', 'physics', 'simulation', 'data visualization'],
                    categoryId: '28', // Science & Technology
                },
                status: {
                    privacyStatus: 'public', // Immediately Public
                    selfDeclaredMadeForKids: false,
                },
            },
            media: {
                body: fs.createReadStream(videoPath),
            },
        });

        this.logger.info(`Upload complete! Video ID: ${res.data.id}`);
        return res.data;
    } catch (err) {
        this.logger.error('YouTube Upload Failed: ' + err);
        throw err;
    }
  }

  private async authorize() {
      // Load client secrets
      const content = fs.readFileSync(CREDENTIALS_PATH, 'utf-8');
      const keys = JSON.parse(content);
      // Handle different formats of client_secrets.json (installed vs web)
      const key = keys.installed || keys.web;
      
      const client = new google.auth.OAuth2(
          key.client_id,
          key.client_secret,
          key.redirect_uris[0]
      );

      // Load token
      if (fs.existsSync(TOKEN_PATH)) {
          const token = fs.readFileSync(TOKEN_PATH, 'utf-8');
          client.setCredentials(JSON.parse(token));
          this.logger.info('Loaded credentials from token.json');
          return client;
      } else {
          throw new Error('token.json not found! Please run auth script first.');
      }
  }
}
