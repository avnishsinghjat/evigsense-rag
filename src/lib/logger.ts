import { supabase } from "@/integrations/supabase/client";

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

interface LogContext {
  [key: string]: any;
}

interface LogEntry {
  level: LogLevel;
  source: string;
  message: string;
  context?: LogContext;
  userId?: string;
  sessionId?: string;
  url?: string;
  userAgent?: string;
  ipAddress?: string;
}

class Logger {
  private buffer: LogEntry[] = [];
  private flushInterval: number = 5000; // 5 seconds
  private maxBufferSize: number = 50;
  private timerId: number | null = null;
  private sessionId: string;

  constructor() {
    this.sessionId = this.generateSessionId();
    this.startFlushTimer();

    // Flush on page unload
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => this.flush());
    }
  }

  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private async getCurrentUserId(): Promise<string | undefined> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      return user?.id;
    } catch {
      return undefined;
    }
  }

  private startFlushTimer() {
    if (this.timerId) {
      clearInterval(this.timerId);
    }
    this.timerId = window.setInterval(() => this.flush(), this.flushInterval);
  }

  private async log(level: LogLevel, source: string, message: string, context?: LogContext) {
    const userId = await this.getCurrentUserId();
    
    const entry: LogEntry = {
      level,
      source,
      message,
      context,
      userId,
      sessionId: this.sessionId,
      url: typeof window !== 'undefined' ? window.location.href : undefined,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    };

    this.buffer.push(entry);

    // Also log to console for development
    if (import.meta.env.DEV) {
      const consoleMethod = level === 'fatal' ? 'error' : level;
      console[consoleMethod](`[${source}] ${message}`, context || '');
    }

    if (this.buffer.length >= this.maxBufferSize) {
      await this.flush();
    }
  }

  async flush() {
    if (this.buffer.length === 0) return;

    const logsToSend = [...this.buffer];
    this.buffer = [];

    try {
      const { error } = await supabase.functions.invoke('ingest-logs', {
        body: { logs: logsToSend },
      });

      if (error) {
        console.error('Failed to send logs:', error);
        // Put logs back in buffer to retry
        this.buffer.unshift(...logsToSend);
      }
    } catch (error) {
      console.error('Error flushing logs:', error);
      // Put logs back in buffer to retry
      this.buffer.unshift(...logsToSend);
    }
  }

  debug(source: string, message: string, context?: LogContext) {
    return this.log('debug', source, message, context);
  }

  info(source: string, message: string, context?: LogContext) {
    return this.log('info', source, message, context);
  }

  warn(source: string, message: string, context?: LogContext) {
    return this.log('warn', source, message, context);
  }

  error(source: string, message: string, context?: LogContext) {
    return this.log('error', source, message, context);
  }

  fatal(source: string, message: string, context?: LogContext) {
    return this.log('fatal', source, message, context);
  }
}

// Export singleton instance
export const logger = new Logger();
