import { createLogger } from '@/lib/logger'

const logger = createLogger('Performance')

export interface PerformanceMetrics {
  timestamp: number
  metric: string
  value: number
  unit: string
  context?: Record<string, any>
}

export class PerformanceMonitor {
  private static instance: PerformanceMonitor
  private metrics: PerformanceMetrics[] = []
  private observers: Map<string, PerformanceObserver> = new Map()
  private timers: Map<string, number> = new Map()

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor()
    }
    return PerformanceMonitor.instance
  }

  constructor() {
    if (typeof window !== 'undefined') {
      this.initializeWebVitals()
      this.initializeCustomObservers()
    }
  }

  private initializeWebVitals() {
    // Core Web Vitals monitoring
    if ('web-vital' in window) {
      // This would typically use the web-vitals library
      // import { getCLS, getFID, getFCP, getLCP, getTTFB } from 'web-vitals'
      logger.info('Web Vitals monitoring initialized')
    }

    // Performance observer for navigation timing
    if ('PerformanceObserver' in window) {
      try {
        const navObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.entryType === 'navigation') {
              const navEntry = entry as PerformanceNavigationTiming
              this.recordMetric('page-load-time', navEntry.loadEventEnd - navEntry.fetchStart, 'ms')
              this.recordMetric('dom-content-loaded', navEntry.domContentLoadedEventEnd - navEntry.fetchStart, 'ms')
              this.recordMetric('first-paint', navEntry.responseEnd - navEntry.fetchStart, 'ms')
            }
          }
        })
        navObserver.observe({ entryTypes: ['navigation'] })
        this.observers.set('navigation', navObserver)
      } catch (error) {
        logger.warn('Failed to initialize navigation observer', error)
      }
    }
  }

  private initializeCustomObservers() {
    // Long task observer
    if ('PerformanceObserver' in window) {
      try {
        const longTaskObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            this.recordMetric('long-task', entry.duration, 'ms', {
              startTime: entry.startTime,
              name: entry.name
            })
            
            if (entry.duration > 50) {
              logger.warn('Long task detected', {
                duration: entry.duration,
                startTime: entry.startTime,
                name: entry.name
              })
            }
          }
        })
        longTaskObserver.observe({ entryTypes: ['longtask'] })
        this.observers.set('longtask', longTaskObserver)
      } catch (error) {
        logger.warn('Long task observer not supported', error)
      }
    }

    // Resource timing observer
    if ('PerformanceObserver' in window) {
      try {
        const resourceObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const resourceEntry = entry as PerformanceResourceTiming
            
            // Monitor large resources
            if (resourceEntry.transferSize > 1000000) { // > 1MB
              logger.warn('Large resource loaded', {
                name: resourceEntry.name,
                size: resourceEntry.transferSize,
                duration: resourceEntry.duration,
                type: resourceEntry.initiatorType
              })
            }

            // Monitor slow resources
            if (resourceEntry.duration > 3000) { // > 3s
              logger.warn('Slow resource loading', {
                name: resourceEntry.name,
                duration: resourceEntry.duration,
                type: resourceEntry.initiatorType
              })
            }
          }
        })
        resourceObserver.observe({ entryTypes: ['resource'] })
        this.observers.set('resource', resourceObserver)
      } catch (error) {
        logger.warn('Failed to initialize resource observer', error)
      }
    }
  }

  // Audio-specific performance monitoring
  trackAudioLatency(startTime: number, audioReady: number) {
    const latency = audioReady - startTime
    this.recordMetric('audio-latency', latency, 'ms')
    
    if (latency > 500) {
      logger.warn('High audio latency detected', { latency })
    }
  }

  trackAudioBuffering(bufferingStart: number, bufferingEnd: number) {
    const bufferingTime = bufferingEnd - bufferingStart
    this.recordMetric('audio-buffering', bufferingTime, 'ms')
    
    if (bufferingTime > 1000) {
      logger.warn('Extended audio buffering', { bufferingTime })
    }
  }

  trackFileProcessing(fileSize: number, processingTime: number) {
    this.recordMetric('file-processing-time', processingTime, 'ms', { fileSize })
    this.recordMetric('file-processing-rate', fileSize / processingTime, 'bytes/ms')
  }

  // YouTube sync performance
  trackYouTubeSyncLatency(syncStart: number, videoReady: number) {
    const syncLatency = videoReady - syncStart
    this.recordMetric('youtube-sync-latency', syncLatency, 'ms')
    
    if (syncLatency > 2000) {
      logger.warn('High YouTube sync latency', { syncLatency })
    }
  }

  // Memory monitoring
  trackMemoryUsage() {
    if ('memory' in performance) {
      const memInfo = (performance as any).memory
      this.recordMetric('memory-used', memInfo.usedJSHeapSize, 'bytes')
      this.recordMetric('memory-total', memInfo.totalJSHeapSize, 'bytes')
      this.recordMetric('memory-limit', memInfo.jsHeapSizeLimit, 'bytes')
      
      const memoryUsagePercent = (memInfo.usedJSHeapSize / memInfo.jsHeapSizeLimit) * 100
      if (memoryUsagePercent > 80) {
        logger.warn('High memory usage detected', { 
          usagePercent: memoryUsagePercent.toFixed(2),
          used: memInfo.usedJSHeapSize,
          limit: memInfo.jsHeapSizeLimit
        })
      }
    }
  }

  // Generic timing utilities
  startTimer(label: string): () => number {
    const startTime = performance.now()
    this.timers.set(label, startTime)
    
    return () => {
      const endTime = performance.now()
      const duration = endTime - startTime
      this.timers.delete(label)
      this.recordMetric(`timer-${label}`, duration, 'ms')
      return duration
    }
  }

  mark(name: string) {
    if ('mark' in performance) {
      performance.mark(name)
    }
  }

  measure(name: string, startMark: string, endMark?: string) {
    if ('measure' in performance) {
      try {
        performance.measure(name, startMark, endMark)
        const entries = performance.getEntriesByName(name, 'measure')
        if (entries.length > 0) {
          const entry = entries[entries.length - 1]
          this.recordMetric(name, entry.duration, 'ms')
        }
      } catch (error) {
        logger.warn('Failed to measure performance', { name, startMark, endMark, error })
      }
    }
  }

  private recordMetric(metric: string, value: number, unit: string, context?: Record<string, any>) {
    const entry: PerformanceMetrics = {
      timestamp: Date.now(),
      metric,
      value,
      unit,
      context
    }
    
    this.metrics.push(entry)
    
    // Keep only recent metrics (last 1000 entries)
    if (this.metrics.length > 1000) {
      this.metrics = this.metrics.slice(-1000)
    }

    logger.debug('Performance metric recorded', entry)
  }

  getMetrics(metric?: string): PerformanceMetrics[] {
    if (metric) {
      return this.metrics.filter(m => m.metric === metric)
    }
    return [...this.metrics]
  }

  getAverageMetric(metric: string, timeWindow?: number): number | null {
    let relevantMetrics = this.metrics.filter(m => m.metric === metric)
    
    if (timeWindow) {
      const cutoff = Date.now() - timeWindow
      relevantMetrics = relevantMetrics.filter(m => m.timestamp > cutoff)
    }
    
    if (relevantMetrics.length === 0) return null
    
    const sum = relevantMetrics.reduce((acc, m) => acc + m.value, 0)
    return sum / relevantMetrics.length
  }

  generateReport(): string {
    const report = {
      timestamp: new Date().toISOString(),
      totalMetrics: this.metrics.length,
      recentMetrics: this.metrics.filter(m => m.timestamp > Date.now() - 60000).length,
      averages: {} as Record<string, number>
    }

    // Calculate averages for key metrics
    const keyMetrics = ['audio-latency', 'file-processing-time', 'youtube-sync-latency', 'page-load-time']
    keyMetrics.forEach(metric => {
      const avg = this.getAverageMetric(metric, 300000) // Last 5 minutes
      if (avg !== null) {
        report.averages[metric] = Math.round(avg * 100) / 100
      }
    })

    return JSON.stringify(report, null, 2)
  }

  clearMetrics() {
    this.metrics = []
    logger.info('Performance metrics cleared')
  }

  destroy() {
    this.observers.forEach((observer, key) => {
      observer.disconnect()
    })
    this.observers.clear()
    this.timers.clear()
    this.metrics = []
  }
}

// React hook for performance monitoring
export function usePerformanceMonitor() {
  const monitor = PerformanceMonitor.getInstance()

  const trackComponentRender = (componentName: string) => {
    const timer = monitor.startTimer(`component-render-${componentName}`)
    return timer
  }

  const trackAsyncOperation = async <T>(
    operationName: string, 
    operation: () => Promise<T>
  ): Promise<T> => {
    const timer = monitor.startTimer(`async-${operationName}`)
    try {
      const result = await operation()
      timer()
      return result
    } catch (error) {
      timer()
      throw error
    }
  }

  return {
    monitor,
    trackComponentRender,
    trackAsyncOperation,
    trackAudioLatency: monitor.trackAudioLatency.bind(monitor),
    trackFileProcessing: monitor.trackFileProcessing.bind(monitor),
    trackYouTubeSyncLatency: monitor.trackYouTubeSyncLatency.bind(monitor),
    trackMemoryUsage: monitor.trackMemoryUsage.bind(monitor),
    startTimer: monitor.startTimer.bind(monitor),
    mark: monitor.mark.bind(monitor),
    measure: monitor.measure.bind(monitor),
  }
}

// Global performance monitor instance
export const performanceMonitor = PerformanceMonitor.getInstance()