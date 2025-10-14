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
  private static readonly API_KEY = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY || ''
  private static readonly SEARCH_BASE_URL = 'https://www.googleapis.com/youtube/v3/search'
  private static readonly VIDEO_BASE_URL = 'https://www.googleapis.com/youtube/v3/videos'

  /**
   * Search for music videos by artist and title
   */
  static async searchMusicVideo(artist: string, title: string): Promise<VideoSearchResult> {
    // Check cache first
    const cachedVideos = VideoCache.getCachedVideos(artist, title)
    if (cachedVideos && cachedVideos.length > 0) {
      console.log(`Using cached videos for: ${artist} - ${title}`)
      return {
        videos: cachedVideos,
        totalResults: cachedVideos.length,
        query: `${artist} ${title}`
      }
    }

    if (!this.API_KEY) {
      console.warn('YouTube API key not configured')
      return { videos: [], totalResults: 0, query: `${artist} ${title}` }
    }

    try {
      console.log(`Searching YouTube for: ${artist} - ${title}`)
      const query = `${artist} ${title} official music video`
      const url = `${this.SEARCH_BASE_URL}?part=snippet&q=${encodeURIComponent(query)}&type=video&videoCategoryId=10&maxResults=5&key=${this.API_KEY}`

      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`YouTube API error: ${response.status}`)
      }

      const data = await response.json()
      
      if (!data.items || data.items.length === 0) {
        return { videos: [], totalResults: 0, query }
      }

      // Get video details including duration
      const videoIds = data.items.map((item: any) => item.id.videoId).join(',')
      const videoDetails = await this.getVideoDetails(videoIds)

      const videos: YouTubeVideo[] = data.items.map((item: any, index: number) => {
        const details = videoDetails.find((v: any) => v.id === item.id.videoId)
        return {
          id: item.id.videoId,
          title: item.snippet.title,
          thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url,
          duration: details ? this.parseDuration(details.contentDetails.duration) : 0,
          channelTitle: item.snippet.channelTitle,
          publishedAt: item.snippet.publishedAt,
          viewCount: details?.statistics?.viewCount ? parseInt(details.statistics.viewCount) : 0,
          relevanceScore: this.calculateRelevanceScore(item.snippet.title, artist, title)
        }
      })

      // Sort by relevance score
      videos.sort((a, b) => b.relevanceScore - a.relevanceScore)

      // Cache the results
      if (videos.length > 0) {
        VideoCache.cacheVideos(artist, title, videos, data.pageInfo.totalResults)
        console.log(`Cached ${videos.length} videos for: ${artist} - ${title}`)
      }

      return {
        videos,
        totalResults: data.pageInfo.totalResults,
        query
      }
    } catch (error) {
      console.error('Error searching YouTube:', error)
      return { videos: [], totalResults: 0, query: `${artist} ${title}` }
    }
  }

  /**
   * Get detailed video information including duration
   */
  private static async getVideoDetails(videoIds: string): Promise<any[]> {
    if (!this.API_KEY) return []

    try {
      const url = `${this.VIDEO_BASE_URL}?part=contentDetails,statistics&id=${videoIds}&key=${this.API_KEY}`
      const response = await fetch(url)
      
      if (!response.ok) {
        throw new Error(`YouTube API error: ${response.status}`)
      }

      const data = await response.json()
      return data.items || []
    } catch (error) {
      console.error('Error getting video details:', error)
      return []
    }
  }

  /**
   * Parse YouTube duration format (PT4M13S) to seconds
   */
  private static parseDuration(duration: string): number {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
    if (!match) return 0

    const hours = parseInt(match[1] || '0')
    const minutes = parseInt(match[2] || '0')
    const seconds = parseInt(match[3] || '0')

    return hours * 3600 + minutes * 60 + seconds
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