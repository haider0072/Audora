import { SpotifyCache, type SpotifyResult } from './spotify-cache'

export type { SpotifyResult, SpotifyTrackData, SpotifyAlbumData, SpotifyArtistData, SpotifyRelatedArtist } from './spotify-cache'

export class SpotifyService {
  /**
   * What Spotify knows about a song and its artist. An answer is cached; a
   * refusal is not, so artist info comes back as soon as Spotify does.
   */
  static async getArtistInfo(artist: string, title: string): Promise<SpotifyResult> {
    const cached = SpotifyCache.getCachedResult(artist, title)
    if (cached) {
      return cached
    }

    try {
      const params = new URLSearchParams({ artist, title })
      const response = await fetch(`/api/spotify?${params}`)

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }

      const data: SpotifyResult = await response.json()

      if (!data.unavailable) SpotifyCache.cacheResult(artist, title, data)
      return data
    } catch (error) {
      console.error('Error fetching Spotify info:', error)
      return { found: false, unavailable: "Couldn't reach Spotify." }
    }
  }

  static hasCachedInfo(artist: string, title: string): boolean {
    return SpotifyCache.hasCachedResult(artist, title)
  }

  static clearCache(): void {
    SpotifyCache.clearAllCachedResults()
  }
}
