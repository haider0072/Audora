// Pulls in the matcher type augmentation as well as the matchers themselves;
// jest.setup.js registers them at runtime but TypeScript needs the import here.
import '@testing-library/jest-dom'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { AlbumArtDisplay } from '@/components/album-art-display'
import { AlbumArtCache } from '@/lib/album-art-cache'

jest.mock('@/lib/album-art-cache', () => ({
  AlbumArtCache: {
    getCachedAlbumArt: jest.fn(),
    preloadAlbumArt: jest.fn(),
    releaseAlbumArt: jest.fn(),
    markAsStable: jest.fn(),
    invalidateCachedAlbumArt: jest.fn(),
    removeCachedAlbumArt: jest.fn(),
  },
}))

const cache = AlbumArtCache as jest.Mocked<typeof AlbumArtCache>

/** Long enough to cover the component's 100ms loading-state settle. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 250))
  })
}

beforeEach(() => {
  jest.clearAllMocks()
})

/**
 * Replaces the always-intersecting setup mock with one this file can steer,
 * so a slot can be scrolled out of view on demand.
 */
function useSteerableObserver() {
  const original = global.IntersectionObserver
  let setIntersecting: ((value: boolean) => void) | null = null

  beforeEach(() => {
    global.IntersectionObserver = class {
      callback: (entries: unknown[], observer: unknown) => void
      constructor(callback: (entries: unknown[], observer: unknown) => void) {
        this.callback = callback
      }
      observe(target: Element) {
        setIntersecting = (isIntersecting: boolean) =>
          this.callback([{ target, isIntersecting }], this)
        this.callback([{ target, isIntersecting: true }], this)
      }
      disconnect() {}
      unobserve() {}
      takeRecords() {
        return []
      }
    } as unknown as typeof IntersectionObserver
  })

  afterEach(() => {
    global.IntersectionObserver = original
    setIntersecting = null
  })

  return {
    scrollOutOfView: async () => {
      await act(async () => {
        setIntersecting?.(false)
      })
    },
    scrollIntoView: async () => {
      await act(async () => {
        setIntersecting?.(true)
      })
    },
  }
}

describe('AlbumArtDisplay', () => {
  it('shows art that loads', async () => {
    cache.getCachedAlbumArt.mockReturnValue('blob:good')

    render(<AlbumArtDisplay songId="song-1" albumArt="blob:good" title="cover" />)

    const img = await screen.findByRole('img', { name: 'cover' })
    expect(img).toHaveAttribute('src', 'blob:good')
  })

  describe('when it scrolls out of view', () => {
    const observer = useSteerableObserver()

    it('hands the art back so the cache can reclaim it', async () => {
      cache.getCachedAlbumArt.mockReturnValue('blob:good')

      render(<AlbumArtDisplay songId="song-1" albumArt="blob:good" title="cover" />)
      await screen.findByRole('img', { name: 'cover' })

      await observer.scrollOutOfView()

      // A held reference is what keeps an entry pinned, and a pinned entry is
      // one the caps can never evict. Every song in the library renders one of
      // these, so holding art for slots nobody can see is the whole problem.
      expect(cache.releaseAlbumArt).toHaveBeenCalledWith('song-1')
    })

    it('drops the image so its decoded bitmap can go too', async () => {
      cache.getCachedAlbumArt.mockReturnValue('blob:good')

      render(<AlbumArtDisplay songId="song-1" albumArt="blob:good" title="cover" />)
      await screen.findByRole('img', { name: 'cover' })

      await observer.scrollOutOfView()

      expect(screen.queryByRole('img', { name: 'cover' })).not.toBeInTheDocument()
    })

    it('picks the art back up on the way in', async () => {
      cache.getCachedAlbumArt.mockReturnValue('blob:good')

      render(<AlbumArtDisplay songId="song-1" albumArt="blob:good" title="cover" />)
      await screen.findByRole('img', { name: 'cover' })
      await observer.scrollOutOfView()

      await observer.scrollIntoView()

      const img = await screen.findByRole('img', { name: 'cover' })
      expect(img).toHaveAttribute('src', 'blob:good')
    })
  })

  describe('when the art fails to load', () => {
    it('does not ask for the same URL again', async () => {
      // The regression this file exists for: a dead URL used to be retried for
      // as long as the window stayed open, because the error re-armed the load
      // effect, which cleared the error and re-read the same cached URL.
      cache.getCachedAlbumArt.mockReturnValue('blob:dead')

      render(<AlbumArtDisplay songId="song-1" albumArt="blob:dead" title="cover" />)
      const img = await screen.findByRole('img', { name: 'cover' })

      fireEvent.error(img)
      await settle()

      const callsAfterFailure = cache.getCachedAlbumArt.mock.calls.length
      await settle()

      expect(cache.getCachedAlbumArt.mock.calls.length).toBe(callsAfterFailure)
    })

    it('falls back instead of leaving a broken image on screen', async () => {
      cache.getCachedAlbumArt.mockReturnValue('blob:dead')

      render(<AlbumArtDisplay songId="song-1" albumArt="blob:dead" title="cover" />)
      const img = await screen.findByRole('img', { name: 'cover' })

      fireEvent.error(img)

      await waitFor(() => {
        expect(screen.queryByRole('img', { name: 'cover' })).not.toBeInTheDocument()
      })
    })

    it('evicts the entry that handed over the dead URL', async () => {
      cache.getCachedAlbumArt.mockReturnValue('blob:dead')

      render(<AlbumArtDisplay songId="song-1" albumArt="blob:dead" title="cover" />)
      const img = await screen.findByRole('img', { name: 'cover' })

      fireEvent.error(img)

      expect(cache.invalidateCachedAlbumArt).toHaveBeenCalledWith('song-1')
    })

    it('does not release art it never had', async () => {
      cache.getCachedAlbumArt.mockReturnValue('blob:dead')

      render(<AlbumArtDisplay songId="song-1" albumArt="blob:dead" title="cover" />)
      fireEvent.error(await screen.findByRole('img', { name: 'cover' }))
      await settle()

      // The failure already invalidated the entry; releasing on top of that
      // would drive the refCount below what the component actually holds.
      expect(cache.releaseAlbumArt).not.toHaveBeenCalled()
    })

    it('tries again for a different song', async () => {
      cache.getCachedAlbumArt.mockReturnValue('blob:dead')

      const { rerender } = render(
        <AlbumArtDisplay songId="song-1" albumArt="blob:dead" title="cover" />
      )
      fireEvent.error(await screen.findByRole('img', { name: 'cover' }))
      await settle()

      cache.getCachedAlbumArt.mockReturnValue('blob:good')
      rerender(<AlbumArtDisplay songId="song-2" albumArt="blob:good" title="cover" />)

      const img = await screen.findByRole('img', { name: 'cover' })
      expect(img).toHaveAttribute('src', 'blob:good')
    })
  })
})
