import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { LogLevel } from '../models/enums/log-level.enum';

@Injectable({ providedIn: 'root' })
export class LoggingService {
  debug(message: string, ...data: unknown[]): void {
    if (!environment.production) {
      this.log(LogLevel.Debug, message, data);
    }
  }

  info(message: string, ...data: unknown[]): void {
    this.log(LogLevel.Info, message, data);
  }

  warn(message: string, ...data: unknown[]): void {
    this.log(LogLevel.Warn, message, data);
  }

  error(message: string, ...data: unknown[]): void {
    this.log(LogLevel.Error, message, data);
  }

  private log(level: LogLevel, message: string, data: unknown[]): void {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    switch (level) {
      case LogLevel.Debug:
        console.debug(prefix, message, ...data);
        break;
      case LogLevel.Info:
        console.info(prefix, message, ...data);
        break;
      case LogLevel.Warn:
        console.warn(prefix, message, ...data);
        break;
      case LogLevel.Error:
        console.error(prefix, message, ...data);
        break;
    }
  }
}
