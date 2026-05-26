import type { TidalSearchResult, TidalAlbum, TidalDiscographyResult } from "./tidal-types"

interface CacheEntry<T> {
  data: T
  cachedAt: number
  expiresAt: number
}

type CacheData = Record<string, CacheEntry<unknown>>

export class TidalCache {
  // Bumped from v1 → v2 when the Tidal route was rerouted onto Lucida.
  // Old entries hold dead qqdl.site IDs and have to be invalidated.
  private static readonly CACHE_KEY = "audora_tidal_cache_v2"
  private static readonly LEGACY_KEYS = ["audora_tidal_cache"]
  private static readonly SEARCH_DURATION = 60 * 60 * 1000 // 1 hour
  private static readonly DETAIL_DURATION = 24 * 60 * 60 * 1000 // 24 hours
  private static readonly MAX_ENTRIES = 200
  private static readonly CLEANUP_THRESHOLD = 160

  private static generateKey(prefix: string, ...parts: string[]): string {
    return `${prefix}:${parts.map((p) => p.toLowerCase().trim()).join("|")}`
  }

  static getCachedSearch(query: string, type: string, source = "auto"): TidalSearchResult | null {
    return this.get<TidalSearchResult>(this.generateKey("search", query, type, source))
  }

  static cacheSearch(query: string, type: string, data: TidalSearchResult, source = "auto"): void {
    this.set(this.generateKey("search", query, type, source), data, this.SEARCH_DURATION)
  }

  static getCachedAlbum(albumId: string): TidalAlbum | null {
    return this.get<TidalAlbum>(this.generateKey("album", albumId))
  }

  static cacheAlbum(albumId: string, data: TidalAlbum): void {
    this.set(this.generateKey("album", albumId), data, this.DETAIL_DURATION)
  }

  static getCachedDiscography(artistId: string): TidalDiscographyResult | null {
    return this.get<TidalDiscographyResult>(this.generateKey("disco", artistId))
  }

  static cacheDiscography(artistId: string, data: TidalDiscographyResult): void {
    this.set(this.generateKey("disco", artistId), data, this.DETAIL_DURATION)
  }

  static clearAll(): void {
    try {
      localStorage.removeItem(this.CACHE_KEY)
    } catch (error) {
      console.error("Error clearing Tidal cache:", error)
    }
  }

  private static get<T>(key: string): T | null {
    try {
      const cache = this.loadCache()
      const entry = cache[key] as CacheEntry<T> | undefined
      if (!entry) return null
      if (Date.now() > entry.expiresAt) {
        delete cache[key]
        this.saveCache(cache)
        return null
      }
      return entry.data
    } catch (error) {
      console.error("Error reading Tidal cache:", error)
      return null
    }
  }

  private static set<T>(key: string, data: T, duration: number): void {
    try {
      const cache = this.loadCache()
      const now = Date.now()
      cache[key] = { data, cachedAt: now, expiresAt: now + duration }

      if (Object.keys(cache).length > this.CLEANUP_THRESHOLD) {
        this.cleanup(cache)
      }
      this.saveCache(cache)
    } catch (error) {
      console.error("Error writing Tidal cache:", error)
    }
  }

  private static cleanup(cache: CacheData): void {
    const now = Date.now()
    const entries = Object.entries(cache)
    const valid = entries.filter(([, entry]) => now <= entry.expiresAt)

    if (valid.length > this.MAX_ENTRIES) {
      valid.sort((a, b) => b[1].cachedAt - a[1].cachedAt)
      valid.splice(this.MAX_ENTRIES)
    }

    const keys = new Set(valid.map(([k]) => k))
    for (const key of Object.keys(cache)) {
      if (!keys.has(key)) delete cache[key]
    }
  }

  private static loadCache(): CacheData {
    try {
      for (const legacy of this.LEGACY_KEYS) {
        if (localStorage.getItem(legacy)) localStorage.removeItem(legacy)
      }
      const cached = localStorage.getItem(this.CACHE_KEY)
      return cached ? JSON.parse(cached) : {}
    } catch {
      return {}
    }
  }

  private static saveCache(cache: CacheData): void {
    try {
      localStorage.setItem(this.CACHE_KEY, JSON.stringify(cache))
    } catch (error) {
      if (error instanceof Error && error.name === "QuotaExceededError") {
        this.clearAll()
        try {
          localStorage.setItem(this.CACHE_KEY, JSON.stringify(cache))
        } catch {
          console.error("Failed to save Tidal cache after cleanup")
        }
      }
    }
  }
}
