export interface SpotifyTrackData {
  spotifyId: string
  name: string
  popularity: number
  previewUrl: string | null
  spotifyUrl: string
  trackNumber: number
  durationMs: number
  explicit: boolean
}

export interface SpotifyAlbumData {
  name: string
  image: string
  releaseDate: string
  totalTracks: number
  spotifyUrl: string
}

export interface SpotifyArtistData {
  spotifyId: string
  name: string
  image: string
  genres: string[]
  followers: number
  popularity: number
  spotifyUrl: string
}

export interface SpotifyRelatedArtist {
  name: string
  image: string
  genres: string[]
  spotifyUrl: string
}

export interface SpotifyResult {
  found: boolean
  track?: SpotifyTrackData
  album?: SpotifyAlbumData
  artist?: SpotifyArtistData
  relatedArtists?: SpotifyRelatedArtist[]
}

export interface SpotifyCacheEntry {
  data: SpotifyResult
  cachedAt: number
  expiresAt: number
}

export class SpotifyCache {
  private static readonly CACHE_KEY = 'music_player_spotify_cache'
  private static readonly CACHE_DURATION = 7 * 24 * 60 * 60 * 1000 // 7 days
  private static readonly MAX_CACHE_SIZE = 500
  private static readonly CLEANUP_THRESHOLD = 400

  private static generateCacheKey(artist: string, title: string): string {
    return `${artist.toLowerCase().trim()}|${title.toLowerCase().trim()}`
  }

  static getCachedResult(artist: string, title: string): SpotifyResult | null {
    try {
      const cache = this.loadCache()
      const cacheKey = this.generateCacheKey(artist, title)
      const entry = cache[cacheKey]

      if (!entry) {
        return null
      }

      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        this.removeCachedResult(artist, title)
        return null
      }

      return entry.data
    } catch (error) {
      console.error('Error reading spotify cache:', error)
      return null
    }
  }

  static cacheResult(artist: string, title: string, data: SpotifyResult): void {
    try {
      const cache = this.loadCache()
      const cacheKey = this.generateCacheKey(artist, title)
      const now = Date.now()

      const entry: SpotifyCacheEntry = {
        data,
        cachedAt: now,
        expiresAt: now + this.CACHE_DURATION,
      }

      cache[cacheKey] = entry

      if (Object.keys(cache).length > this.CLEANUP_THRESHOLD) {
        this.cleanupCache()
      }

      this.saveCache(cache)
    } catch (error) {
      console.error('Error caching spotify result:', error)
    }
  }

  static removeCachedResult(artist: string, title: string): void {
    try {
      const cache = this.loadCache()
      const cacheKey = this.generateCacheKey(artist, title)
      delete cache[cacheKey]
      this.saveCache(cache)
    } catch (error) {
      console.error('Error removing cached spotify result:', error)
    }
  }

  static clearAllCachedResults(): void {
    try {
      localStorage.removeItem(this.CACHE_KEY)
    } catch (error) {
      console.error('Error clearing spotify cache:', error)
    }
  }

  static hasCachedResult(artist: string, title: string): boolean {
    return this.getCachedResult(artist, title) !== null
  }

  private static cleanupCache(): void {
    try {
      const cache = this.loadCache()
      const entries = Object.entries(cache)

      // Remove expired entries first
      const now = Date.now()
      const validEntries = entries.filter(([, entry]) => !entry.expiresAt || now <= entry.expiresAt)

      // If still over max, keep newest
      if (validEntries.length > this.MAX_CACHE_SIZE) {
        validEntries.sort((a, b) => b[1].cachedAt - a[1].cachedAt)
        validEntries.splice(this.MAX_CACHE_SIZE)
      }

      const cleanedCache: Record<string, SpotifyCacheEntry> = {}
      validEntries.forEach(([key, entry]) => {
        cleanedCache[key] = entry
      })

      this.saveCache(cleanedCache)
    } catch (error) {
      console.error('Error cleaning up spotify cache:', error)
    }
  }

  private static loadCache(): Record<string, SpotifyCacheEntry> {
    try {
      const cached = localStorage.getItem(this.CACHE_KEY)
      return cached ? JSON.parse(cached) : {}
    } catch (error) {
      console.error('Error loading spotify cache:', error)
      return {}
    }
  }

  private static saveCache(cache: Record<string, SpotifyCacheEntry>): void {
    try {
      localStorage.setItem(this.CACHE_KEY, JSON.stringify(cache))
    } catch (error) {
      console.error('Error saving spotify cache:', error)

      if (error instanceof Error && error.name === 'QuotaExceededError') {
        this.clearAllCachedResults()
        this.cleanupCache()
        try {
          localStorage.setItem(this.CACHE_KEY, JSON.stringify(cache))
        } catch (retryError) {
          console.error('Failed to save spotify cache after cleanup:', retryError)
        }
      }
    }
  }
}
