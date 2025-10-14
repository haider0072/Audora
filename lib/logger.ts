/* eslint-disable no-console */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LogEntry {
  timestamp: Date
  level: LogLevel
  context: string
  message: string
  data?: any
}

export class Logger {
  private context: string
  private minLevel: LogLevel
  private isProduction: boolean

  constructor(context: string) {
    this.context = context
    this.isProduction = process.env.NODE_ENV === 'production'
    this.minLevel = this.isProduction ? LogLevel.WARN : LogLevel.DEBUG
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.minLevel
  }

  private formatMessage(level: LogLevel, message: string, data?: any): string {
    const timestamp = new Date().toISOString()
    const levelStr = LogLevel[level]
    const dataStr = data ? ` | ${JSON.stringify(data)}` : ''
    return `[${timestamp}] ${levelStr} [${this.context}]: ${message}${dataStr}`
  }

  private log(level: LogLevel, message: string, data?: any) {
    if (!this.shouldLog(level)) return

    const formattedMessage = this.formatMessage(level, message, data)
    const logEntry: LogEntry = {
      timestamp: new Date(),
      level,
      context: this.context,
      message,
      data
    }

    // Send to external logging service in production
    if (this.isProduction) {
      this.sendToExternalService(logEntry)
    }

    // Console output
    switch (level) {
      case LogLevel.DEBUG:
        console.debug(formattedMessage)
        break
      case LogLevel.INFO:
        console.info(formattedMessage)
        break
      case LogLevel.WARN:
        console.warn(formattedMessage)
        break
      case LogLevel.ERROR:
        console.error(formattedMessage)
        break
    }
  }

  private async sendToExternalService(entry: LogEntry) {
    // In production, send to external logging service (Sentry, LogRocket, etc.)
    // This is a placeholder for production logging integration
    try {
      // TODO: Integrate with Sentry or similar service
      // Example: Sentry.captureMessage(entry.message, { level: this.getSentryLevel(entry.level), extra: entry.data })

      // For now, only log errors to avoid noise
      if (entry.level === LogLevel.ERROR && typeof window !== 'undefined') {
        // Could send to an API endpoint
        // await fetch('/api/logs', {
        //   method: 'POST',
        //   headers: { 'Content-Type': 'application/json' },
        //   body: JSON.stringify(entry)
        // })
      }
    } catch (error) {
      // Silently fail to avoid infinite loops
      // Only log to console in development
      if (!this.isProduction) {
        console.error('Failed to send log to external service:', error)
      }
    }
  }

  debug(message: string, data?: any) {
    this.log(LogLevel.DEBUG, message, data)
  }

  info(message: string, data?: any) {
    this.log(LogLevel.INFO, message, data)
  }

  warn(message: string, data?: any) {
    this.log(LogLevel.WARN, message, data)
  }

  error(message: string, data?: any) {
    this.log(LogLevel.ERROR, message, data)
  }

  // Performance logging
  startTimer(label: string): () => void {
    const start = performance.now()
    return () => {
      const duration = performance.now() - start
      this.debug(`Timer [${label}]: ${duration.toFixed(2)}ms`)
    }
  }

  // Method decorator for automatic function logging
  static logFunction(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value
    const logger = new Logger(`${target.constructor.name}.${propertyKey}`)

    descriptor.value = function (...args: any[]) {
      const timer = logger.startTimer(propertyKey)
      logger.debug(`Calling ${propertyKey}`, { args: args.length })
      
      try {
        const result = originalMethod.apply(this, args)
        
        if (result instanceof Promise) {
          return result
            .then((value) => {
              timer()
              logger.debug(`${propertyKey} completed successfully`)
              return value
            })
            .catch((error) => {
              timer()
              logger.error(`${propertyKey} failed`, { error: error.message })
              throw error
            })
        } else {
          timer()
          logger.debug(`${propertyKey} completed successfully`)
          return result
        }
      } catch (error) {
        timer()
        logger.error(`${propertyKey} failed`, { error: (error as Error).message })
        throw error
      }
    }

    return descriptor
  }
}

// Global logger instance for general use
export const logger = new Logger('App')

// Create context-specific loggers
export const createLogger = (context: string) => new Logger(context)