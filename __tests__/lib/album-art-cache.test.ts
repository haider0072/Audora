import { AlbumArtCache } from '@/lib/album-art-cache'
import { PlaylistStorage } from '@/lib/playlist-storage'
import { storedArtRef } from '@/lib/album-art-ref'

jest.mock('@/lib/playlist-storage', () => ({
  PlaylistStorage: { getAlbumArtBlob: jest.fn() },
}))

const storage = PlaylistStorage as jest.Mocked<typeof PlaylistStorage>

/** Only `size` is read off the blob, so there is no point allocating bytes. */
function blobOfSize(size: number): Blob {
  return { size } as Blob
}

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

  describe('stored art references', () => {
    it('resolves a reference into a URL only when asked', async () => {
      storage.getAlbumArtBlob.mockResolvedValue(blobOfSize(1234))

      const url = await AlbumArtCache.preloadAlbumArt('song-1', storedArtRef('song-1'))

      expect(storage.getAlbumArtBlob).toHaveBeenCalledWith('song-1')
      expect(url).toBe('blob:created')
    })

    it('records the real byte size, which is what the size cap acts on', async () => {
      storage.getAlbumArtBlob.mockResolvedValue(blobOfSize(4096))

      await AlbumArtCache.preloadAlbumArt('song-1', storedArtRef('song-1'))

      expect(AlbumArtCache.getCacheStats().totalSize).toBe(4096)
    })

    it('reports nothing for a song with no stored art', async () => {
      storage.getAlbumArtBlob.mockResolvedValue(null)

      const url = await AlbumArtCache.preloadAlbumArt('song-1', storedArtRef('song-1'))

      expect(url).toBeNull()
    })
  })

  describe('warmAlbumArt', () => {
    it('does not hold a reference — nothing displays a warmed entry', async () => {
      storage.getAlbumArtBlob.mockResolvedValue(blobOfSize(10))

      await AlbumArtCache.warmAlbumArt('song-1', storedArtRef('song-1'))
      // Only an entry nobody references can be removed, so this succeeding is
      // the observable proof that warming left refCount at zero. A pinned
      // entry is one the caps can never evict.
      AlbumArtCache.removeCachedAlbumArt('song-1')

      expect(AlbumArtCache.getCacheStats().entryCount).toBe(0)
    })

    it('still caches what it warmed', async () => {
      storage.getAlbumArtBlob.mockResolvedValue(blobOfSize(10))

      await AlbumArtCache.warmAlbumArt('song-1', storedArtRef('song-1'))

      expect(AlbumArtCache.getCacheStats().entryCount).toBe(1)
    })
  })

  describe('size cap', () => {
    it('evicts unreferenced entries once the byte budget is exceeded', async () => {
      // 100MB is the cap; three 40MB entries cannot all stay.
      const fortyMB = 40 * 1024 * 1024
      storage.getAlbumArtBlob.mockResolvedValue(blobOfSize(fortyMB))

      await AlbumArtCache.warmAlbumArt('song-1', storedArtRef('song-1'))
      await AlbumArtCache.warmAlbumArt('song-2', storedArtRef('song-2'))
      await AlbumArtCache.warmAlbumArt('song-3', storedArtRef('song-3'))

      expect(AlbumArtCache.getCacheStats().totalSize).toBeLessThanOrEqual(100 * 1024 * 1024)
    })

    it('keeps entries that are still referenced', async () => {
      const fortyMB = 40 * 1024 * 1024
      storage.getAlbumArtBlob.mockResolvedValue(blobOfSize(fortyMB))

      // preload, not warm: these are being displayed.
      await AlbumArtCache.preloadAlbumArt('song-1', storedArtRef('song-1'))
      await AlbumArtCache.preloadAlbumArt('song-2', storedArtRef('song-2'))
      await AlbumArtCache.preloadAlbumArt('song-3', storedArtRef('song-3'))

      expect(AlbumArtCache.getCacheStats().entryCount).toBe(3)
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
