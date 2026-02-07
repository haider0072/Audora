import { VideoCache, type CachedVideo } from './video-cache'

export interface YouTubeVideo {
  id: string
  title: string
  thumbnail: string
  duration: number
  channelTitle: string
  publishedAt: string
  viewCount: number
  relevanceScore: number
}

export interface VideoSearchResult {
  videos: YouTubeVideo[]
  totalResults: number
  query: string
}

export class YouTubeService {
  /**
   * Search for music videos by artist and title
   * Uses backend API route to keep API key server-side
   */
  static async searchMusicVideo(artist: string, title: string): Promise<VideoSearchResult> {
    // Check cache first
    const cachedVideos = VideoCache.getCachedVideos(artist, title)
    if (cachedVideos && cachedVideos.length > 0) {
      return {
        videos: cachedVideos,
        totalResults: cachedVideos.length,
        query: `${artist} ${title}`
      }
    }

    try {
      const params = new URLSearchParams({ artist, title })
      const response = await fetch(`/api/youtube?${params}`)

      if (!response.ok) {
        throw new Error(`YouTube proxy error: ${response.status}`)
      }

      const data = await response.json()

      if (!data.videos || data.videos.length === 0) {
        return { videos: [], totalResults: 0, query: data.query || `${artist} ${title}` }
      }

      // Add relevance scores client-side and sort
      const videos: YouTubeVideo[] = data.videos.map((video: any) => ({
        ...video,
        relevanceScore: this.calculateRelevanceScore(video.title, artist, title),
      }))

      videos.sort((a, b) => b.relevanceScore - a.relevanceScore)

      // Cache the results
      if (videos.length > 0) {
        VideoCache.cacheVideos(artist, title, videos, data.totalResults)
      }

      return {
        videos,
        totalResults: data.totalResults,
        query: data.query || `${artist} ${title}`
      }
    } catch (error) {
      console.error('Error searching YouTube:', error)
      return { videos: [], totalResults: 0, query: `${artist} ${title}` }
    }
  }

  /**
   * Calculate relevance score for video matching
   */
  private static calculateRelevanceScore(videoTitle: string, artist: string, title: string): number {
    const videoTitleLower = videoTitle.toLowerCase()
    const artistLower = artist.toLowerCase()
    const titleLower = title.toLowerCase()

    let score = 0

    // Exact artist match
    if (videoTitleLower.includes(artistLower)) score += 50
    // Partial artist match
    else if (artistLower.split(' ').some(word => videoTitleLower.includes(word))) score += 30

    // Exact title match
    if (videoTitleLower.includes(titleLower)) score += 40
    // Partial title match
    else if (titleLower.split(' ').some(word => videoTitleLower.includes(word))) score += 20

    // Official video bonus
    if (videoTitleLower.includes('official')) score += 15
    if (videoTitleLower.includes('music video')) score += 10

    // Penalty for unrelated content
    if (videoTitleLower.includes('cover') && !videoTitleLower.includes(artistLower)) score -= 20
    if (videoTitleLower.includes('remix') && !videoTitleLower.includes(artistLower)) score -= 15

    return Math.max(0, score)
  }

  /**
   * Create YouTube embed URL with parameters
   */
  static createEmbedUrl(videoId: string, options: {
    autoplay?: boolean
    startTime?: number
    controls?: boolean
    modestbranding?: boolean
    rel?: boolean
  } = {}): string {
    const params = new URLSearchParams({
      enablejsapi: '1',
      origin: window.location.origin,
      widget_referrer: window.location.origin,
      ...(options.autoplay !== undefined && { autoplay: options.autoplay ? '1' : '0' }),
      ...(options.startTime !== undefined && { start: options.startTime.toString() }),
      ...(options.controls !== undefined && { controls: options.controls ? '1' : '0' }),
      ...(options.modestbranding !== undefined && { modestbranding: options.modestbranding ? '1' : '0' }),
      ...(options.rel !== undefined && { rel: options.rel ? '1' : '0' })
    })

    return `https://www.youtube.com/embed/${videoId}?${params.toString()}`
  }

  /**
   * Extract video ID from various YouTube URL formats
   */
  static extractVideoId(url: string): string | null {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /youtube\.com\/v\/([^&\n?#]+)/,
      /youtube\.com\/watch\?.*v=([^&\n?#]+)/
    ]

    for (const pattern of patterns) {
      const match = url.match(pattern)
      if (match) return match[1]
    }

    return null
  }

  /**
   * Cache management methods
   */
  static getCacheStats() {
    return VideoCache.getCacheStats()
  }

  static clearCache() {
    VideoCache.clearAllCachedVideos()
  }

  static hasCachedVideos(artist: string, title: string): boolean {
    return VideoCache.hasCachedVideos(artist, title)
  }

  static removeCachedVideos(artist: string, title: string) {
    VideoCache.removeCachedVideos(artist, title)
  }

  static exportCache(): string {
    return VideoCache.exportCache()
  }

  static importCache(cacheData: string): boolean {
    return VideoCache.importCache(cacheData)
  }
} 