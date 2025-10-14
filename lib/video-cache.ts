export interface CachedVideo {
  id: string
  title: string
  thumbnail: string
  duration: number
  channelTitle: string
  publishedAt: string
  viewCount: number
  relevanceScore: number
  cachedAt: number
  searchQuery: string
}

export interface VideoCacheEntry {
  videos: CachedVideo[]
  totalResults: number
  query: string
  cachedAt: number
  expiresAt: number
}

export class VideoCache {
  private static readonly CACHE_KEY = 'music_player_video_cache'
  private static readonly CACHE_DURATION = 7 * 24 * 60 * 60 * 1000 // 7 days
  private static readonly MAX_CACHE_SIZE = 1000 // Maximum number of cached entries
  private static readonly CLEANUP_THRESHOLD = 800 // Cleanup when reaching this threshold

  /**
   * Generate a cache key for a song
   */
  private static generateCacheKey(artist: string, title: string): string {
    const normalizedArtist = artist.toLowerCase().trim()
    const normalizedTitle = title.toLowerCase().trim()
    return `${normalizedArtist}|${normalizedTitle}`
  }

  /**
   * Get cached video results for a song
   */
  static getCachedVideos(artist: string, title: string): CachedVideo[] | null {
    try {
      const cache = this.loadCache()
      const cacheKey = this.generateCacheKey(artist, title)
      const entry = cache[cacheKey]

      if (!entry) {
        return null
      }

      // Check if cache has expired
      if (Date.now() > entry.expiresAt) {
        this.removeCachedVideos(artist, title)
        return null
      }

      // Return videos with current timestamp
      return entry.videos.map(video => ({
        ...video,
        cachedAt: Date.now()
      }))
    } catch (error) {
      console.error('Error reading video cache:', error)
      return null
    }
  }

  /**
   * Cache video results for a song
   */
  static cacheVideos(artist: string, title: string, videos: any[], totalResults: number): void {
    try {
      const cache = this.loadCache()
      const cacheKey = this.generateCacheKey(artist, title)
      const now = Date.now()

      // Convert videos to cached format
      const cachedVideos: CachedVideo[] = videos.map(video => ({
        id: video.id,
        title: video.title,
        thumbnail: video.thumbnail,
        duration: video.duration,
        channelTitle: video.channelTitle,
        publishedAt: video.publishedAt,
        viewCount: video.viewCount,
        relevanceScore: video.relevanceScore,
        cachedAt: now,
        searchQuery: `${artist} ${title}`
      }))

      // Create cache entry
      const entry: VideoCacheEntry = {
        videos: cachedVideos,
        totalResults,
        query: `${artist} ${title}`,
        cachedAt: now,
        expiresAt: now + this.CACHE_DURATION
      }

      // Add to cache
      cache[cacheKey] = entry

      // Cleanup if cache is getting too large
      if (Object.keys(cache).length > this.CLEANUP_THRESHOLD) {
        this.cleanupCache()
      }

      this.saveCache(cache)
    } catch (error) {
      console.error('Error caching videos:', error)
    }
  }

  /**
   * Remove cached videos for a song
   */
  static removeCachedVideos(artist: string, title: string): void {
    try {
      const cache = this.loadCache()
      const cacheKey = this.generateCacheKey(artist, title)
      delete cache[cacheKey]
      this.saveCache(cache)
    } catch (error) {
      console.error('Error removing cached videos:', error)
    }
  }

  /**
   * Clear all cached videos
   */
  static clearAllCachedVideos(): void {
    try {
      localStorage.removeItem(this.CACHE_KEY)
    } catch (error) {
      console.error('Error clearing video cache:', error)
    }
  }

  /**
   * Get cache statistics
   */
  static getCacheStats(): {
    totalEntries: number
    totalSize: number
    oldestEntry: number | null
    newestEntry: number | null
  } {
    try {
      const cache = this.loadCache()
      const entries = Object.values(cache)
      
      if (entries.length === 0) {
        return {
          totalEntries: 0,
          totalSize: 0,
          oldestEntry: null,
          newestEntry: null
        }
      }

      const timestamps = entries.map(entry => entry.cachedAt)
      const cacheSize = new Blob([JSON.stringify(cache)]).size

      return {
        totalEntries: entries.length,
        totalSize: cacheSize,
        oldestEntry: Math.min(...timestamps),
        newestEntry: Math.max(...timestamps)
      }
    } catch (error) {
      console.error('Error getting cache stats:', error)
      return {
        totalEntries: 0,
        totalSize: 0,
        oldestEntry: null,
        newestEntry: null
      }
    }
  }

  /**
   * Clean up expired and old cache entries
   */
  private static cleanupCache(): void {
    try {
      const cache = this.loadCache()
      const now = Date.now()
      const entries = Object.entries(cache)

      // Remove expired entries
      const validEntries = entries.filter(([_, entry]) => entry.expiresAt > now)

      // If still too many entries, remove oldest ones
      if (validEntries.length > this.MAX_CACHE_SIZE) {
        validEntries.sort((a, b) => a[1].cachedAt - b[1].cachedAt)
        validEntries.splice(0, validEntries.length - this.MAX_CACHE_SIZE)
      }

      // Rebuild cache
      const cleanedCache: Record<string, VideoCacheEntry> = {}
      validEntries.forEach(([key, entry]) => {
        cleanedCache[key] = entry
      })

      this.saveCache(cleanedCache)
    } catch (error) {
      console.error('Error cleaning up cache:', error)
    }
  }

  /**
   * Load cache from localStorage
   */
  private static loadCache(): Record<string, VideoCacheEntry> {
    try {
      const cached = localStorage.getItem(this.CACHE_KEY)
      return cached ? JSON.parse(cached) : {}
    } catch (error) {
      console.error('Error loading video cache:', error)
      return {}
    }
  }

  /**
   * Save cache to localStorage
   */
  private static saveCache(cache: Record<string, VideoCacheEntry>): void {
    try {
      localStorage.setItem(this.CACHE_KEY, JSON.stringify(cache))
    } catch (error) {
      console.error('Error saving video cache:', error)
      
      // If localStorage is full, try to clean up and save again
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        this.clearAllCachedVideos()
        this.cleanupCache()
        try {
          localStorage.setItem(this.CACHE_KEY, JSON.stringify(cache))
        } catch (retryError) {
          console.error('Failed to save cache after cleanup:', retryError)
        }
      }
    }
  }

  /**
   * Check if a song has cached videos
   */
  static hasCachedVideos(artist: string, title: string): boolean {
    const videos = this.getCachedVideos(artist, title)
    return videos !== null && videos.length > 0
  }

  /**
   * Get cache expiration time for a song
   */
  static getCacheExpiration(artist: string, title: string): number | null {
    try {
      const cache = this.loadCache()
      const cacheKey = this.generateCacheKey(artist, title)
      const entry = cache[cacheKey]
      return entry ? entry.expiresAt : null
    } catch (error) {
      console.error('Error getting cache expiration:', error)
      return null
    }
  }

  /**
   * Update cache expiration for a song
   */
  static updateCacheExpiration(artist: string, title: string, newExpiration: number): void {
    try {
      const cache = this.loadCache()
      const cacheKey = this.generateCacheKey(artist, title)
      const entry = cache[cacheKey]

      if (entry) {
        entry.expiresAt = newExpiration
        this.saveCache(cache)
      }
    } catch (error) {
      console.error('Error updating cache expiration:', error)
    }
  }

  /**
   * Export cache data (for debugging/backup)
   */
  static exportCache(): string {
    try {
      const cache = this.loadCache()
      return JSON.stringify(cache, null, 2)
    } catch (error) {
      console.error('Error exporting cache:', error)
      return '{}'
    }
  }

  /**
   * Import cache data (for debugging/restore)
   */
  static importCache(cacheData: string): boolean {
    try {
      const cache = JSON.parse(cacheData)
      this.saveCache(cache)
      return true
    } catch (error) {
      console.error('Error importing cache:', error)
      return false
    }
  }
} 