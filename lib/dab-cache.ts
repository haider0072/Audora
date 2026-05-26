import type { DabSearchResult, DabAlbum, DabDiscographyResult } from "./dab-types"

interface DabCacheEntry<T> {
  data: T
  cachedAt: number
  expiresAt: number
}

type CacheData = Record<string, DabCacheEntry<unknown>>

export class DabCache {
  // Bumped from v1 → v2 with the DAB→Lucida swap. Entries from before
  // the swap have the wrong shape (no `source`, old numeric track IDs)
  // and need to be re-fetched.
  private static readonly CACHE_KEY = "audora_dab_cache_v2"
  private static readonly LEGACY_KEYS = ["audora_dab_cache"]
  private static readonly SEARCH_DURATION = 60 * 60 * 1000 // 1 hour
  private static readonly DETAIL_DURATION = 24 * 60 * 60 * 1000 // 24 hours
  private static readonly MAX_ENTRIES = 200
  private static readonly CLEANUP_THRESHOLD = 160

  private static generateKey(prefix: string, ...parts: string[]): string {
    return `${prefix}:${parts.map((p) => p.toLowerCase().trim()).join("|")}`
  }

  // Search results
  static getCachedSearch(query: string, type: string): DabSearchResult | null {
    return this.get<DabSearchResult>(this.generateKey("search", query, type))
  }

  static cacheSearch(query: string, type: string, data: DabSearchResult): void {
    this.set(this.generateKey("search", query, type), data, this.SEARCH_DURATION)
  }

  // Album details
  static getCachedAlbum(albumId: string): DabAlbum | null {
    return this.get<DabAlbum>(this.generateKey("album", albumId))
  }

  static cacheAlbum(albumId: string, data: DabAlbum): void {
    this.set(this.generateKey("album", albumId), data, this.DETAIL_DURATION)
  }

  // Discography
  static getCachedDiscography(artistId: string): DabDiscographyResult | null {
    return this.get<DabDiscographyResult>(this.generateKey("disco", artistId))
  }

  static cacheDiscography(artistId: string, data: DabDiscographyResult): void {
    this.set(this.generateKey("disco", artistId), data, this.DETAIL_DURATION)
  }

  static clearAll(): void {
    try {
      localStorage.removeItem(this.CACHE_KEY)
    } catch (error) {
      console.error("Error clearing DAB cache:", error)
    }
  }

  // Private helpers
  private static get<T>(key: string): T | null {
    try {
      const cache = this.loadCache()
      const entry = cache[key] as DabCacheEntry<T> | undefined
      if (!entry) return null
      if (Date.now() > entry.expiresAt) {
        delete cache[key]
        this.saveCache(cache)
        return null
      }
      return entry.data
    } catch (error) {
      console.error("Error reading DAB cache:", error)
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
      console.error("Error writing DAB cache:", error)
    }
  }

  private static cleanup(cache: CacheData): void {
    const now = Date.now()
    const entries = Object.entries(cache)

    // Remove expired
    const valid = entries.filter(([, entry]) => now <= entry.expiresAt)

    // If still over max, keep newest
    if (valid.length > this.MAX_ENTRIES) {
      valid.sort((a, b) => b[1].cachedAt - a[1].cachedAt)
      valid.splice(this.MAX_ENTRIES)
    }

    // Rebuild cache
    const keys = new Set(valid.map(([k]) => k))
    for (const key of Object.keys(cache)) {
      if (!keys.has(key)) delete cache[key]
    }
  }

  private static loadCache(): CacheData {
    try {
      // Drop any cache buckets from previous versions so we don't waste
      // storage on data that can never satisfy a current read.
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
          console.error("Failed to save DAB cache after cleanup")
        }
      }
    }
  }
}
