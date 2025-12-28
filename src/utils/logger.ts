/**
 * Logger utility for structured, level-based logging
 * Enables forensic-level debugging via environment configuration
 */

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  TRACE = 4,
}

export class Logger {
  private static instance: Logger;
  private level: LogLevel;
  private enableTimestamp: boolean;

  private constructor() {
    const levelStr = (process.env.TINYTASK_LOG_LEVEL || 'info').toLowerCase();
    this.level = this.parseLevel(levelStr);
    this.enableTimestamp = true;
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private parseLevel(level: string): LogLevel {
    switch (level) {
      case 'error':
        return LogLevel.ERROR;
      case 'warn':
        return LogLevel.WARN;
      case 'info':
        return LogLevel.INFO;
      case 'debug':
        return LogLevel.DEBUG;
      case 'trace':
        return LogLevel.TRACE;
      default:
        return LogLevel.INFO;
    }
  }

  shouldLog(level: LogLevel): boolean {
    return level <= this.level;
  }

  private formatMessage(level: string, message: string, context?: unknown): string {
    const timestamp = this.enableTimestamp ? `[${new Date().toISOString()}]` : '';
    const prefix = `${timestamp} ${level}:`;

    if (context === undefined) {
      return `${prefix} ${message}`;
    }

    // Format context object
    const contextStr =
      typeof context === 'string' ? context : JSON.stringify(context, null, 2);

    return `${prefix} ${message}\n${contextStr}`;
  }

  error(message: string, context?: unknown): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(this.formatMessage('ERROR', message, context));
    }
  }

  warn(message: string, context?: unknown): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.error(this.formatMessage('WARN', message, context));
    }
  }

  info(message: string, context?: unknown): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.error(this.formatMessage('INFO', message, context));
    }
  }

  debug(message: string, context?: unknown): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.error(this.formatMessage('DEBUG', message, context));
    }
  }

  trace(message: string, context?: unknown): void {
    if (this.shouldLog(LogLevel.TRACE)) {
      console.error(this.formatMessage('TRACE', message, context));
    }
  }

  // Specialized helper methods

  logRequest(
    method: string,
    path: string,
    details: {
      sessionId?: string;
      headers?: Record<string, unknown>;
      body?: unknown;
    }
  ): void {
    if (this.shouldLog(LogLevel.TRACE)) {
      this.trace('HTTP Request', {
        method,
        path,
        ...details,
      });
    }
  }

  logResponse(
    status: number,
    details: {
      duration?: number;
      body?: unknown;
    }
  ): void {
    if (this.shouldLog(LogLevel.TRACE)) {
      this.trace('HTTP Response', {
        status,
        ...details,
      });
    }
  }

  logToolCall(name: string, args: unknown): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      const context = this.shouldLog(LogLevel.TRACE)
        ? { fullArgs: args }
        : { args: this.sanitizeArgs(args) };

      this.debug(`Tool call: ${name}`, context);
    }
  }

  logToolResult(name: string, result: unknown, duration?: number): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      const context: Record<string, unknown> = {};

      if (duration !== undefined) {
        context.duration = `${duration}ms`;
      }

      if (this.shouldLog(LogLevel.TRACE)) {
        context.result = result;
      }

      this.debug(`Tool result: ${name}`, context);
    }
  }

  logToolError(name: string, error: Error, args?: unknown): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      this.error(`Tool error: ${name}`, {
        error: error.message,
        stack: error.stack,
        args: this.sanitizeArgs(args),
      });
    }
  }

  private sanitizeArgs(args: unknown): unknown {
    // Basic sanitization - remove deeply nested objects for readability
    // In TRACE mode, full args are logged anyway
    if (typeof args !== 'object' || args === null) {
      return args;
    }

    // For arrays, show count
    if (Array.isArray(args)) {
      return `[Array: ${args.length} items]`;
    }

    // For objects, show keys with simplified values
    const obj = args as Record<string, unknown>;
    return Object.keys(obj).reduce(
      (acc, key) => {
        const value = obj[key];
        if (typeof value === 'object' && value !== null) {
          acc[key] = Array.isArray(value) ? `[Array: ${value.length} items]` : '[Object]';
        } else {
          acc[key] = value;
        }
        return acc;
      },
      {} as Record<string, unknown>
    );
  }
}

// Export singleton instance
export const logger = Logger.getInstance();
