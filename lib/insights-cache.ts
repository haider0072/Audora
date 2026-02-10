export interface CachedInsight {
  content: string
  model: string
  songTitle: string
  songArtist: string
  cachedAt: number
}

export interface InsightsCacheEntry {
  insight: CachedInsight
  cachedAt: number
  expiresAt: number
}

export class InsightsCache {
  private static readonly CACHE_KEY = 'music_player_insights_cache'
  private static readonly CACHE_DURATION = Infinity // Never expires — song facts don't change
  private static readonly MAX_CACHE_SIZE = 500
  private static readonly CLEANUP_THRESHOLD = 400

  private static generateCacheKey(artist: string, title: string): string {
    return `${artist.toLowerCase().trim()}|${title.toLowerCase().trim()}`
  }

  static getCachedInsight(artist: string, title: string): CachedInsight | null {
    try {
      const cache = this.loadCache()
      const cacheKey = this.generateCacheKey(artist, title)
      const entry = cache[cacheKey]

      if (!entry) {
        return null
      }

      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        this.removeCachedInsight(artist, title)
        return null
      }

      return entry.insight
    } catch (error) {
      console.error('Error reading insights cache:', error)
      return null
    }
  }

  static cacheInsight(artist: string, title: string, content: string, model: string): void {
    try {
      const cache = this.loadCache()
      const cacheKey = this.generateCacheKey(artist, title)
      const now = Date.now()

      const entry: InsightsCacheEntry = {
        insight: {
          content,
          model,
          songTitle: title,
          songArtist: artist,
          cachedAt: now,
        },
        cachedAt: now,
        expiresAt: 0, // 0 = never expires
      }

      cache[cacheKey] = entry

      if (Object.keys(cache).length > this.CLEANUP_THRESHOLD) {
        this.cleanupCache()
      }

      this.saveCache(cache)
    } catch (error) {
      console.error('Error caching insight:', error)
    }
  }

  static removeCachedInsight(artist: string, title: string): void {
    try {
      const cache = this.loadCache()
      const cacheKey = this.generateCacheKey(artist, title)
      delete cache[cacheKey]
      this.saveCache(cache)
    } catch (error) {
      console.error('Error removing cached insight:', error)
    }
  }

  static clearAllCachedInsights(): void {
    try {
      localStorage.removeItem(this.CACHE_KEY)
    } catch (error) {
      console.error('Error clearing insights cache:', error)
    }
  }

  static hasCachedInsight(artist: string, title: string): boolean {
    return this.getCachedInsight(artist, title) !== null
  }

  private static cleanupCache(): void {
    try {
      const cache = this.loadCache()
      const entries = Object.entries(cache)

      // No expiry — only trim if exceeding max entries (keep newest)
      if (entries.length > this.MAX_CACHE_SIZE) {
        entries.sort((a, b) => b[1].cachedAt - a[1].cachedAt)
        entries.splice(this.MAX_CACHE_SIZE)
      }

      const cleanedCache: Record<string, InsightsCacheEntry> = {}
      entries.forEach(([key, entry]) => {
        cleanedCache[key] = entry
      })

      this.saveCache(cleanedCache)
    } catch (error) {
      console.error('Error cleaning up insights cache:', error)
    }
  }

  private static loadCache(): Record<string, InsightsCacheEntry> {
    try {
      const cached = localStorage.getItem(this.CACHE_KEY)
      return cached ? JSON.parse(cached) : {}
    } catch (error) {
      console.error('Error loading insights cache:', error)
      return {}
    }
  }

  private static saveCache(cache: Record<string, InsightsCacheEntry>): void {
    try {
      localStorage.setItem(this.CACHE_KEY, JSON.stringify(cache))
    } catch (error) {
      console.error('Error saving insights cache:', error)

      if (error instanceof Error && error.name === 'QuotaExceededError') {
        this.clearAllCachedInsights()
        this.cleanupCache()
        try {
          localStorage.setItem(this.CACHE_KEY, JSON.stringify(cache))
        } catch (retryError) {
          console.error('Failed to save insights cache after cleanup:', retryError)
        }
      }
    }
  }
}
