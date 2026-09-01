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

describe('AlbumArtDisplay', () => {
  it('shows art that loads', async () => {
    cache.getCachedAlbumArt.mockReturnValue('blob:good')

    render(<AlbumArtDisplay songId="song-1" albumArt="blob:good" title="cover" />)

    const img = await screen.findByRole('img', { name: 'cover' })
    expect(img).toHaveAttribute('src', 'blob:good')
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
