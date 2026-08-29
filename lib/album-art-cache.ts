import { PlaylistStorage } from "./playlist-storage"

interface CachedAlbumArt {
  url: string
  blob: Blob
  lastAccessed: number
  songId: string
  size: number
  refCount: number
  isStable: boolean
  isLoading: boolean // Track loading state to prevent duplicate requests
}

export class AlbumArtCache {
  private static cache = new Map<string, CachedAlbumArt>()
  private static readonly MAX_CACHE_SIZE = 100 * 1024 * 1024 // 100MB
  private static readonly MAX_CACHE_ENTRIES = 200
  private static readonly CACHE_EXPIRY = 24 * 60 * 60 * 1000 // 24 hours
  private static readonly STABLE_DURATION = 10 * 60 * 1000 // 10 minutes stable period
  private static loadingPromises = new Map<string, Promise<string | null>>() // Track loading promises

  // Check if we're in a browser environment
  private static isBrowser(): boolean {
    return typeof window !== "undefined" && typeof URL !== "undefined"
  }

  // Preload album art for a song with deduplication
  static async preloadAlbumArt(songId: string, albumArtUrl?: string): Promise<string | null> {
    if (!this.isBrowser() || !albumArtUrl) return null

    // Check if already cached and stable
    const cached = this.cache.get(songId)
    if (cached && !cached.isLoading) {
      cached.lastAccessed = Date.now()
      cached.refCount++
      cached.isStable = true
      return cached.url
    }

    // Check if already loading
    const existingPromise = this.loadingPromises.get(songId)
    if (existingPromise) {
      return existingPromise
    }

    // Create loading promise
    const loadingPromise = this.loadAlbumArtInternal(songId, albumArtUrl)
    this.loadingPromises.set(songId, loadingPromise)

    try {
      const result = await loadingPromise
      return result
    } finally {
      this.loadingPromises.delete(songId)
    }
  }

  /**
   * Is this blob URL still backed by a blob in this document?
   *
   * A revoked or foreign-session URL rejects immediately; a live one resolves
   * from memory without touching the network.
   */
  private static async isBlobUrlAlive(url: string): Promise<boolean> {
    try {
      const response = await fetch(url)
      return response.ok
    } catch {
      return false
    }
  }

  private static async loadAlbumArtInternal(songId: string, albumArtUrl: string): Promise<string | null> {
    try {
      // Mark as loading in cache
      const existingCached = this.cache.get(songId)
      if (existingCached) {
        existingCached.isLoading = true
      }

      if (albumArtUrl.startsWith("blob:")) {
        // A blob URL is only meaningful inside the session that minted it. The
        // library persists these strings, so after a reload the stored value
        // names a URL this document never created — caching it as-is renders a
        // permanently broken image. Resolving from IndexedDB instead is what
        // lets the restore skip minting a live URL per library entry.
        //
        // Same-session URLs are still valid and must not be re-fetched from the
        // store, so liveness is probed rather than assumed.
        const live = await this.isBlobUrlAlive(albumArtUrl)
        if (live) {
          const cacheEntry: CachedAlbumArt = {
            url: albumArtUrl,
            blob: new Blob(),
            lastAccessed: Date.now(),
            songId,
            size: 0,
            refCount: 1,
            isStable: true,
            isLoading: false,
          }
          this.cache.set(songId, cacheEntry)
          return albumArtUrl
        }

        const restored = await PlaylistStorage.getAlbumArt(songId)
        if (!restored) return null

        const cacheEntry: CachedAlbumArt = {
          url: restored,
          blob: new Blob(),
          lastAccessed: Date.now(),
          songId,
          size: 0,
          refCount: 1,
          isStable: true,
          isLoading: false,
        }
        this.cache.set(songId, cacheEntry)
        this.maybeCleanup()
        return restored
      }

      // Fetch and cache the album art
      const response = await fetch(albumArtUrl)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const blob = await response.blob()

      // Create a persistent URL
      const url = URL.createObjectURL(blob)

      // Add to cache
      const cacheEntry: CachedAlbumArt = {
        url,
        blob,
        lastAccessed: Date.now(),
        songId,
        size: blob.size,
        refCount: 1,
        isStable: true,
        isLoading: false,
      }

      this.cache.set(songId, cacheEntry)

      this.maybeCleanup()

      return url
    } catch (error) {
      console.error(`Error preloading album art for song ${songId}:`, error)

      // Remove loading state
      const cached = this.cache.get(songId)
      if (cached) {
        cached.isLoading = false
      }

      return albumArtUrl // Return original URL as fallback
    }
  }

  // Get cached album art URL and increment reference count
  static getCachedAlbumArt(songId: string): string | null {
    if (!this.isBrowser()) return null

    const cached = this.cache.get(songId)
    if (cached && !cached.isLoading) {
      cached.lastAccessed = Date.now()
      cached.refCount++
      cached.isStable = true
      return cached.url
    }
    return null
  }

  // Release a reference to cached album art
  static releaseAlbumArt(songId: string): void {
    if (!this.isBrowser()) return

    const cached = this.cache.get(songId)
    if (cached && cached.refCount > 0) {
      cached.refCount--
    }
  }

  // Preload album art for multiple songs in parallel
  static async preloadMultiple(songs: Array<{ id: string; albumArt?: string }>): Promise<void> {
    if (!this.isBrowser()) return

    const songsToPreload = songs
      .filter((song) => song.albumArt && !this.cache.has(song.id) && !this.loadingPromises.has(song.id))
      .slice(0, 3)

    // Load in parallel — preloadAlbumArt already deduplicates via loadingPromises
    await Promise.all(
      songsToPreload.map((song) =>
        this.preloadAlbumArt(song.id, song.albumArt).catch(() => {})
      )
    )
  }

  // Run cleanup as soon as either the entry-count or byte-size cap is hit
  // (the old 20% slack let the cache balloon 40-100MB past its limits).
  private static maybeCleanup(): void {
    if (this.cache.size > this.MAX_CACHE_ENTRIES) {
      this.cleanupCache()
      return
    }
    let totalSize = 0
    for (const cached of this.cache.values()) totalSize += cached.size
    if (totalSize > this.MAX_CACHE_SIZE) {
      this.cleanupCache()
    }
  }

  // Cleanup that prefers idle entries but can still shed stale ref'd ones
  private static cleanupCache(): void {
    if (!this.isBrowser()) return

    const now = Date.now()
    const entries = Array.from(this.cache.entries())

    // First pass — remove entries that are:
    // 1. Not in use (refCount === 0)
    // 2. Not currently loading
    // 3. Very old (over 24 hours) OR (expired and not stable)
    const entriesToRemove = entries.filter(([, cached]) => {
      const isVeryOld = now - cached.lastAccessed > this.CACHE_EXPIRY
      const isExpiredAndUnstable = now - cached.lastAccessed > this.STABLE_DURATION && !cached.isStable

      return cached.refCount === 0 && !cached.isLoading && (isVeryOld || isExpiredAndUnstable)
    })

    // Remove expired entries
    entriesToRemove.forEach(([songId, cached]) => {
      try {
        URL.revokeObjectURL(cached.url)
      } catch (error) {
        console.error("Error revoking URL:", error)
      }
      this.cache.delete(songId)
    })

    // Second pass — if still over either cap (entry count OR byte size),
    // evict oldest-unused first until both are satisfied. Entries with a
    // dangling refCount are still eligible once untouched for 24h: callers
    // routinely forget releaseAlbumArt(), and without this valve those
    // pinned entries would grow the cache without bound.
    const remainingEntries = Array.from(this.cache.entries())
    let remainingSize = remainingEntries.reduce((sum, [, cached]) => sum + cached.size, 0)
    if (remainingEntries.length > this.MAX_CACHE_ENTRIES || remainingSize > this.MAX_CACHE_SIZE) {
      const evictable = remainingEntries
        .filter(([, cached]) =>
          !cached.isLoading &&
          (cached.refCount === 0 || now - cached.lastAccessed > this.CACHE_EXPIRY)
        )
        .sort((a, b) => a[1].lastAccessed - b[1].lastAccessed)

      for (const [songId, cached] of evictable) {
        if (this.cache.size <= this.MAX_CACHE_ENTRIES && remainingSize <= this.MAX_CACHE_SIZE) break
        try {
          URL.revokeObjectURL(cached.url)
        } catch (error) {
          console.error("Error revoking URL:", error)
        }
        this.cache.delete(songId)
        remainingSize -= cached.size
      }
    }
  }

  // Clear all cached album art
  static clearCache(): void {
    if (!this.isBrowser()) return

    this.cache.forEach((cached) => {
      try {
        URL.revokeObjectURL(cached.url)
      } catch (error) {
        console.error("Error revoking URL:", error)
      }
    })
    this.cache.clear()
    this.loadingPromises.clear()
  }

  // Get cache statistics
  static getCacheStats(): {
    entryCount: number
    totalSize: number
    oldestEntry: number | null
    newestEntry: number | null
    stableEntries: number
    loadingEntries: number
  } {
    if (!this.isBrowser()) {
      return {
        entryCount: 0,
        totalSize: 0,
        oldestEntry: null,
        newestEntry: null,
        stableEntries: 0,
        loadingEntries: 0,
      }
    }

    const entries = Array.from(this.cache.values())
    const totalSize = entries.reduce((sum, cached) => sum + cached.size, 0)
    const accessTimes = entries.map((cached) => cached.lastAccessed)
    const stableEntries = entries.filter((cached) => cached.isStable).length
    const loadingEntries = entries.filter((cached) => cached.isLoading).length

    return {
      entryCount: entries.length,
      totalSize,
      oldestEntry: accessTimes.length > 0 ? Math.min(...accessTimes) : null,
      newestEntry: accessTimes.length > 0 ? Math.max(...accessTimes) : null,
      stableEntries,
      loadingEntries,
    }
  }

  // Remove specific song from cache (only if not in use)
  static removeCachedAlbumArt(songId: string): void {
    if (!this.isBrowser()) return

    const cached = this.cache.get(songId)
    if (cached && cached.refCount === 0 && !cached.isLoading) {
      try {
        URL.revokeObjectURL(cached.url)
      } catch (error) {
        console.error("Error revoking URL:", error)
      }
      this.cache.delete(songId)
    }
  }

  // Update cache entry for a song
  static async updateCachedAlbumArt(songId: string, newAlbumArtUrl: string): Promise<string | null> {
    // Release old cache entry
    this.releaseAlbumArt(songId)

    // Remove if no longer in use
    const cached = this.cache.get(songId)
    if (cached && cached.refCount === 0 && !cached.isLoading) {
      this.removeCachedAlbumArt(songId)
    }

    // Preload new album art
    return this.preloadAlbumArt(songId, newAlbumArtUrl)
  }

  // Mark entries as stable (called when actively displayed)
  static markAsStable(songId: string): void {
    const cached = this.cache.get(songId)
    if (cached) {
      cached.isStable = true
      cached.lastAccessed = Date.now()
    }
  }
}
