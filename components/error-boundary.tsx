'use client'

import React, { Component, ErrorInfo, ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'
import { createLogger } from '@/lib/logger'

const logger = createLogger('ErrorBoundary')

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
  showDetails?: boolean
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
  errorId: string | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
      errorId: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const errorId = this.state.errorId || `error_${Date.now()}`
    
    logger.error('Application error caught by boundary', {
      errorId,
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack
    })

    this.setState({
      error,
      errorInfo,
      errorId
    })

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo)

    // Report to external error tracking service
    this.reportError(error, errorInfo, errorId)
  }

  private reportError = async (error: Error, errorInfo: ErrorInfo, errorId: string) => {
    try {
      // In production, send to error tracking service (Sentry, Bugsnag, etc.)
      if (process.env.NODE_ENV === 'production') {
        // await errorTrackingService.captureException(error, {
        //   tags: { errorId },
        //   extra: { componentStack: errorInfo.componentStack }
        // })
      }
    } catch (reportingError) {
      logger.error('Failed to report error to external service', reportingError)
    }
  }

  private handleRetry = () => {
    logger.info('User attempting to recover from error', { errorId: this.state.errorId })
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null
    })
  }

  private handleReload = () => {
    logger.info('User reloading page after error', { errorId: this.state.errorId })
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      // Custom fallback UI provided
      if (this.props.fallback) {
        return this.props.fallback
      }

      // Default error UI
      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-background">
          <Card className="w-full max-w-lg">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <CardTitle className="text-2xl">Something went wrong</CardTitle>
              <CardDescription>
                We encountered an unexpected error. This has been automatically reported to our team.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {this.props.showDetails && this.state.error && (
                <div className="rounded-lg bg-muted p-4">
                  <h4 className="font-medium mb-2">Error Details:</h4>
                  <p className="text-sm text-muted-foreground mb-2">
                    <strong>Error ID:</strong> {this.state.errorId}
                  </p>
                  <p className="text-sm text-muted-foreground font-mono">
                    {this.state.error.message}
                  </p>
                </div>
              )}
              
              <div className="flex flex-col sm:flex-row gap-2">
                <Button 
                  onClick={this.handleRetry}
                  className="flex-1"
                  variant="default"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Try Again
                </Button>
                <Button 
                  onClick={this.handleReload}
                  variant="outline"
                  className="flex-1"
                >
                  <Home className="w-4 h-4 mr-2" />
                  Reload Page
                </Button>
              </div>

              <p className="text-xs text-muted-foreground text-center">
                If this problem persists, please contact support with Error ID: {this.state.errorId}
              </p>
            </CardContent>
          </Card>
        </div>
      )
    }

    return this.props.children
  }
}

// Specialized error boundaries for different parts of the app
export const MusicPlayerErrorBoundary: React.FC<{ children: ReactNode }> = ({ children }) => (
  <ErrorBoundary
    onError={(error, errorInfo) => {
      logger.error('Music Player Error', { error: error.message, componentStack: errorInfo.componentStack })
    }}
  >
    {children}
  </ErrorBoundary>
)

export const YouTubePlayerErrorBoundary: React.FC<{ children: ReactNode }> = ({ children }) => (
  <ErrorBoundary
    fallback={
      <Card className="p-6 text-center">
        <AlertTriangle className="w-8 h-8 mx-auto mb-4 text-destructive" />
        <h3 className="font-semibold mb-2">YouTube Player Error</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Failed to load the YouTube video player. This might be due to network issues or API limitations.
        </p>
        <Button onClick={() => window.location.reload()} size="sm">
          Retry
        </Button>
      </Card>
    }
    onError={(error) => {
      logger.error('YouTube Player Error', { error: error.message })
    }}
  >
    {children}
  </ErrorBoundary>
)

export const PlaylistErrorBoundary: React.FC<{ children: ReactNode }> = ({ children }) => (
  <ErrorBoundary
    fallback={
      <Card className="p-6 text-center">
        <AlertTriangle className="w-6 h-6 mx-auto mb-4 text-destructive" />
        <h3 className="font-semibold mb-2">Playlist Error</h3>
        <p className="text-sm text-muted-foreground">
          Unable to load playlist. Your music data is safe.
        </p>
      </Card>
    }
    onError={(error) => {
      logger.error('Playlist Error', { error: error.message })
    }}
  >
    {children}
  </ErrorBoundary>
)