import { DabCache } from "./dab-cache"
import type {
  DabSearchResult,
  DabAlbum,
  DabDiscographyResult,
} from "./dab-types"

export class DabService {
  // Request queue for rate limiting (500ms between requests)
  private static queue: Array<() => void> = []
  private static isProcessing = false
  private static readonly REQUEST_INTERVAL = 500

  private static async processQueue(): Promise<void> {
    if (this.isProcessing) return
    this.isProcessing = true

    while (this.queue.length > 0) {
      const next = this.queue.shift()
      if (next) next()
      if (this.queue.length > 0) {
        await new Promise((r) => setTimeout(r, this.REQUEST_INTERVAL))
      }
    }

    this.isProcessing = false
  }

  private static enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(() => {
        fn().then(resolve).catch(reject)
      })
      this.processQueue()
    })
  }

  // Auth
  static async checkAuth(): Promise<boolean> {
    try {
      const res = await fetch("/api/dab/auth")
      const data = await res.json()
      return data.authenticated === true
    } catch {
      return false
    }
  }

  static async login(email: string, password: string): Promise<boolean> {
    try {
      const res = await fetch("/api/dab/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      return data.authenticated === true
    } catch {
      return false
    }
  }

  // Search
  static async search(
    query: string,
    type: string = "track",
    limit: number = 20
  ): Promise<{ data: DabSearchResult | null; authenticated: boolean }> {
    // Check cache first
    const cached = DabCache.getCachedSearch(query, type)
    if (cached) return { data: cached, authenticated: true }

    return this.enqueue(async () => {
      try {
        const params = new URLSearchParams({
          q: query,
          type,
          limit: String(limit),
        })
        const res = await fetch(`/api/dab/search?${params}`)

        if (res.status === 429) {
          const data = await res.json()
          throw new Error(`rate_limited:${data.retryAfter || 10}`)
        }

        const data = await res.json()

        // Only treat as auth failure if explicitly not authenticated
        if (data.authenticated === false) {
          return { data: null, authenticated: false }
        }

        // API error but still authenticated
        if (data.error && !data.tracks) {
          throw new Error(data.error)
        }

        const result: DabSearchResult = {
          tracks: data.tracks || [],
          albums: data.albums || [],
          artists: data.artists || [],
          pagination: data.pagination || {
            total: 0,
            limit,
            hasMore: false,
            loaded: 0,
          },
          query: data.query || query,
          searchType: data.searchType || type,
        }

        DabCache.cacheSearch(query, type, result)
        return { data: result, authenticated: true }
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.startsWith("rate_limited:")
        ) {
          throw error
        }
        console.error("DAB search error:", error)
        return { data: null, authenticated: true }
      }
    })
  }

  // Album detail
  static async getAlbum(
    albumId: string
  ): Promise<{ data: DabAlbum | null; authenticated: boolean }> {
    const cached = DabCache.getCachedAlbum(albumId)
    if (cached) return { data: cached, authenticated: true }

    return this.enqueue(async () => {
      try {
        const res = await fetch(`/api/dab/album?albumId=${albumId}`)
        const data = await res.json()

        if (!data.authenticated) {
          return { data: null, authenticated: false }
        }

        const album: DabAlbum | null = data.album || null
        if (album) DabCache.cacheAlbum(albumId, album)
        return { data: album, authenticated: true }
      } catch (error) {
        console.error("DAB album error:", error)
        return { data: null, authenticated: true }
      }
    })
  }

  // Discography
  static async getDiscography(
    artistId: string
  ): Promise<{ data: DabDiscographyResult | null; authenticated: boolean }> {
    const cached = DabCache.getCachedDiscography(artistId)
    if (cached) return { data: cached, authenticated: true }

    return this.enqueue(async () => {
      try {
        const res = await fetch(`/api/dab/discography?artistId=${artistId}`)
        const data = await res.json()

        if (!data.authenticated) {
          return { data: null, authenticated: false }
        }

        const result: DabDiscographyResult | null =
          data.artist && data.albums
            ? { artist: data.artist, albums: data.albums }
            : null
        if (result) DabCache.cacheDiscography(artistId, result)
        return { data: result, authenticated: true }
      } catch (error) {
        console.error("DAB discography error:", error)
        return { data: null, authenticated: true }
      }
    })
  }

  // Stream URL (no caching — direct proxy URL)
  static getStreamUrl(trackId: string, quality: string = "7"): string {
    return `/api/dab/stream?trackId=${encodeURIComponent(trackId)}&quality=${quality}`
  }

  static clearCache(): void {
    DabCache.clearAll()
  }
}
