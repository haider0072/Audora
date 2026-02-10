import { InsightsCache, type CachedInsight } from './insights-cache'

export interface InsightsResult {
  content: string | null
  available: boolean
  cached: boolean
  error?: string
  model?: string
}

export class InsightsService {
  static async getInsights(
    title: string,
    artist: string,
    album?: string,
    year?: string,
    genre?: string,
  ): Promise<InsightsResult> {
    const cached = InsightsCache.getCachedInsight(artist, title)
    if (cached) {
      return {
        content: cached.content,
        available: true,
        cached: true,
        model: cached.model,
      }
    }

    try {
      const response = await fetch('/api/ai-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, artist, album, year, genre }),
      })

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }

      const data = await response.json()

      if (!data.available) {
        return { content: null, available: false, cached: false, error: data.reason }
      }

      if (data.insights) {
        InsightsCache.cacheInsight(artist, title, data.insights, data.model || 'unknown')
        return {
          content: data.insights,
          available: true,
          cached: false,
          model: data.model,
        }
      }

      return {
        content: null,
        available: true,
        cached: false,
        error: data.error || 'No insights generated',
      }
    } catch (error) {
      console.error('Error fetching AI insights:', error)
      return {
        content: null,
        available: true,
        cached: false,
        error: 'Failed to connect to insights service',
      }
    }
  }

  static hasCachedInsight(artist: string, title: string): boolean {
    return InsightsCache.hasCachedInsight(artist, title)
  }

  static clearCache(): void {
    InsightsCache.clearAllCachedInsights()
  }
}
