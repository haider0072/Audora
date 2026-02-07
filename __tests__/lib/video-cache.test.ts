import { VideoCache } from '@/lib/video-cache'

const CACHE_KEY = 'music_player_video_cache'

function mockVideo(id: string) {
  return {
    id,
    title: `Video ${id}`,
    channelTitle: 'Test Channel',
    thumbnail: `https://img.youtube.com/${id}`,
    duration: 240,
    viewCount: 1000,
    relevanceScore: 90,
  }
}

describe('VideoCache', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('generateCacheKey', () => {
    it('normalizes artist and title to lowercase trimmed', () => {
      VideoCache.cacheVideos('  Adele  ', '  Hello  ', [mockVideo('1')], 1)
      expect(VideoCache.hasCachedVideos('adele', 'hello')).toBe(true)
    })

    it('treats different casing as same key', () => {
      VideoCache.cacheVideos('ADELE', 'HELLO', [mockVideo('1')], 1)
      const result = VideoCache.getCachedVideos('adele', 'hello')
      expect(result).toHaveLength(1)
    })
  })

  describe('cacheVideos / getCachedVideos', () => {
    it('stores and retrieves videos', () => {
      const videos = [mockVideo('1'), mockVideo('2')]
      VideoCache.cacheVideos('artist', 'title', videos, 2)
      const cached = VideoCache.getCachedVideos('artist', 'title')
      expect(cached).toHaveLength(2)
      expect(cached![0].id).toBe('1')
    })

    it('returns null for non-existent entries', () => {
      expect(VideoCache.getCachedVideos('none', 'none')).toBeNull()
    })

    it('returns null for expired entries', () => {
      VideoCache.cacheVideos('artist', 'title', [mockVideo('1')], 1)

      // Manually expire the entry
      const raw = JSON.parse(localStorage.getItem(CACHE_KEY)!)
      const key = Object.keys(raw)[0]
      raw[key].expiresAt = Date.now() - 1000
      localStorage.setItem(CACHE_KEY, JSON.stringify(raw))

      expect(VideoCache.getCachedVideos('artist', 'title')).toBeNull()
    })
  })

  describe('hasCachedVideos', () => {
    it('returns true for cached entries', () => {
      VideoCache.cacheVideos('artist', 'title', [mockVideo('1')], 1)
      expect(VideoCache.hasCachedVideos('artist', 'title')).toBe(true)
    })

    it('returns false for missing entries', () => {
      expect(VideoCache.hasCachedVideos('none', 'none')).toBe(false)
    })
  })

  describe('removeCachedVideos', () => {
    it('removes specific entry', () => {
      VideoCache.cacheVideos('artist1', 'title1', [mockVideo('1')], 1)
      VideoCache.cacheVideos('artist2', 'title2', [mockVideo('2')], 1)

      VideoCache.removeCachedVideos('artist1', 'title1')

      expect(VideoCache.hasCachedVideos('artist1', 'title1')).toBe(false)
      expect(VideoCache.hasCachedVideos('artist2', 'title2')).toBe(true)
    })
  })

  describe('clearAllCachedVideos', () => {
    it('removes all entries', () => {
      VideoCache.cacheVideos('artist1', 'title1', [mockVideo('1')], 1)
      VideoCache.cacheVideos('artist2', 'title2', [mockVideo('2')], 1)

      VideoCache.clearAllCachedVideos()

      expect(VideoCache.hasCachedVideos('artist1', 'title1')).toBe(false)
      expect(VideoCache.hasCachedVideos('artist2', 'title2')).toBe(false)
    })
  })

  describe('getCacheStats', () => {
    it('returns correct stats', () => {
      VideoCache.cacheVideos('artist1', 'title1', [mockVideo('1')], 1)
      VideoCache.cacheVideos('artist2', 'title2', [mockVideo('2')], 1)

      const stats = VideoCache.getCacheStats()
      expect(stats.totalEntries).toBe(2)
      expect(stats.totalSize).toBeGreaterThan(0)
    })

    it('returns zero for empty cache', () => {
      const stats = VideoCache.getCacheStats()
      expect(stats.totalEntries).toBe(0)
    })
  })

  describe('exportCache / importCache', () => {
    it('roundtrips data through export/import', () => {
      VideoCache.cacheVideos('artist', 'title', [mockVideo('1')], 1)

      const exported = VideoCache.exportCache()
      VideoCache.clearAllCachedVideos()
      expect(VideoCache.hasCachedVideos('artist', 'title')).toBe(false)

      const imported = VideoCache.importCache(exported)
      expect(imported).toBe(true)
      expect(VideoCache.hasCachedVideos('artist', 'title')).toBe(true)
    })

    it('returns false for invalid import data', () => {
      expect(VideoCache.importCache('not json')).toBe(false)
    })
  })

  describe('getCacheExpiration', () => {
    it('returns expiration timestamp for cached entry', () => {
      VideoCache.cacheVideos('artist', 'title', [mockVideo('1')], 1)
      const exp = VideoCache.getCacheExpiration('artist', 'title')
      expect(exp).toBeGreaterThan(Date.now())
    })

    it('returns null for missing entry', () => {
      expect(VideoCache.getCacheExpiration('none', 'none')).toBeNull()
    })
  })
})
