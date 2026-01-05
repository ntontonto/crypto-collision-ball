import fs from 'fs';
import path from 'path';

export class Logger {
  private logPath: string;

  constructor(context: string) {
    const logDir = path.join(process.cwd(), 'log');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    // Check for existing log file and delete if present (per user request)
    this.logPath = path.join(logDir, 'pipeline.log');
    if (fs.existsSync(this.logPath)) {
        try {
            fs.unlinkSync(this.logPath);
            console.log(`[Logger] Deleted existing log file: ${this.logPath}`);
        } catch (err) {
            console.error(`[Logger] Failed to delete existing log file: ${err}`);
        }
    }
    
    this.info(`Logger initialized for ${context}`);
  }

  private write(level: string, message: string) {
    const now = new Date().toISOString();
    const line = `[${now}] [${level}] ${message}`;
    
    // Console output
    console.log(line);
    
    // File output
    fs.appendFileSync(this.logPath, line + '\n');
  }

  info(message: string) {
    this.write('INFO', message);
  }

  error(message: string) {
    this.write('ERROR', message);
  }

  warn(message: string) {
    this.write('WARN', message);
  }
  
  getLogPath() {
      return this.logPath;
  }
}
