import { TidalCache } from "./tidal-cache"
import type {
  TidalSearchResult,
  TidalAlbum,
  TidalDiscographyResult,
} from "./tidal-types"

export class TidalService {
  private static queue: Array<() => void> = []
  private static isProcessing = false
  private static readonly REQUEST_INTERVAL = 300

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

  // Search
  static async search(
    query: string,
    type: string = "track",
    limit: number = 20
  ): Promise<TidalSearchResult | null> {
    const cached = TidalCache.getCachedSearch(query, type)
    if (cached) return cached

    return this.enqueue(async () => {
      try {
        const params = new URLSearchParams({
          q: query,
          type,
          limit: String(limit),
        })
        const res = await fetch(`/api/tidal/search?${params}`)

        if (res.status === 429) {
          const data = await res.json()
          throw new Error(`rate_limited:${data.retryAfter || 10}`)
        }

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}))
          console.error("Tidal search failed:", res.status, errorData)
          throw new Error(errorData.error || "Search failed")
        }

        const data = await res.json()

        const result: TidalSearchResult = {
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

        TidalCache.cacheSearch(query, type, result)
        return result
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.startsWith("rate_limited:")
        ) {
          throw error
        }
        console.error("Tidal search error:", error)
        return null
      }
    })
  }

  // Album detail
  static async getAlbum(albumId: string): Promise<TidalAlbum | null> {
    const cached = TidalCache.getCachedAlbum(albumId)
    if (cached) return cached

    return this.enqueue(async () => {
      try {
        const res = await fetch(`/api/tidal/album?albumId=${albumId}`)
        if (!res.ok) return null

        const data = await res.json()
        const album: TidalAlbum | null = data.album || null
        if (album) TidalCache.cacheAlbum(albumId, album)
        return album
      } catch (error) {
        console.error("Tidal album error:", error)
        return null
      }
    })
  }

  // Discography
  static async getDiscography(
    artistId: string
  ): Promise<TidalDiscographyResult | null> {
    const cached = TidalCache.getCachedDiscography(artistId)
    if (cached) return cached

    return this.enqueue(async () => {
      try {
        const res = await fetch(`/api/tidal/discography?artistId=${artistId}`)
        if (!res.ok) return null

        const data = await res.json()
        const result: TidalDiscographyResult | null =
          data.artist && data.albums
            ? { artist: data.artist, albums: data.albums }
            : null
        if (result) TidalCache.cacheDiscography(artistId, result)
        return result
      } catch (error) {
        console.error("Tidal discography error:", error)
        return null
      }
    })
  }

  // Stream URL (proxied through our API)
  static getStreamUrl(trackId: string, quality: string = "LOSSLESS"): string {
    return `/api/tidal/stream?trackId=${encodeURIComponent(trackId)}&quality=${quality}`
  }

  static clearCache(): void {
    TidalCache.clearAll()
  }
}
