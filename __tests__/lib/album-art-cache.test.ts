import { AlbumArtCache } from '@/lib/album-art-cache'

// jsdom ships neither of these; the cache calls both.
beforeAll(() => {
  global.URL.createObjectURL = jest.fn(() => 'blob:created')
  global.URL.revokeObjectURL = jest.fn()
})

beforeEach(() => {
  AlbumArtCache.clearCache()
  jest.clearAllMocks()
})

/**
 * A `blob:` URL is adopted as-is rather than re-fetched, which makes it the
 * cheapest way to seed an entry without touching the network.
 */
async function seed(songId: string, url = 'blob:seeded'): Promise<void> {
  await AlbumArtCache.preloadAlbumArt(songId, url)
}

describe('AlbumArtCache', () => {
  describe('invalidateCachedAlbumArt', () => {
    it('drops an entry that callers still hold a reference to', async () => {
      await seed('song-1')
      // Taking the URL is what a displaying component does, and it is what
      // leaves refCount above zero.
      expect(AlbumArtCache.getCachedAlbumArt('song-1')).toBe('blob:seeded')

      AlbumArtCache.invalidateCachedAlbumArt('song-1')

      expect(AlbumArtCache.getCachedAlbumArt('song-1')).toBeNull()
    })

    it('revokes the dead URL on the way out', async () => {
      await seed('song-1', 'blob:dead')
      AlbumArtCache.invalidateCachedAlbumArt('song-1')
      expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:dead')
    })

    it('is a no-op for a song that was never cached', () => {
      expect(() => AlbumArtCache.invalidateCachedAlbumArt('missing')).not.toThrow()
      expect(global.URL.revokeObjectURL).not.toHaveBeenCalled()
    })

    it('leaves other songs alone', async () => {
      await seed('song-1', 'blob:one')
      await seed('song-2', 'blob:two')

      AlbumArtCache.invalidateCachedAlbumArt('song-1')

      expect(AlbumArtCache.getCachedAlbumArt('song-1')).toBeNull()
      expect(AlbumArtCache.getCachedAlbumArt('song-2')).toBe('blob:two')
    })
  })

  describe('removeCachedAlbumArt', () => {
    it('refuses while a reference is held — the reason invalidate exists', async () => {
      await seed('song-1')
      AlbumArtCache.getCachedAlbumArt('song-1') // refCount -> 1

      AlbumArtCache.removeCachedAlbumArt('song-1')

      expect(AlbumArtCache.getCachedAlbumArt('song-1')).toBe('blob:seeded')
    })

    it('removes once every reference is released', async () => {
      await seed('song-1')
      AlbumArtCache.getCachedAlbumArt('song-1')
      AlbumArtCache.releaseAlbumArt('song-1')
      AlbumArtCache.releaseAlbumArt('song-1') // the preload's own reference

      AlbumArtCache.removeCachedAlbumArt('song-1')

      expect(AlbumArtCache.getCachedAlbumArt('song-1')).toBeNull()
    })
  })
})
