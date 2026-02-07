import { renderHook, act } from '@testing-library/react'
import { usePlaylistManager } from '@/hooks/use-playlist-manager'
import type { Song } from '@/components/enhanced-playlist'

// Mock dependencies
jest.mock('@/hooks/use-toast', () => ({
  toast: jest.fn(),
}))

jest.mock('@/lib/playlist-storage', () => ({
  PlaylistStorage: {
    removeSongFile: jest.fn().mockResolvedValue(undefined),
    removeAlbumArt: jest.fn().mockResolvedValue(undefined),
    clearPlaylist: jest.fn().mockResolvedValue(undefined),
  },
}))

jest.mock('@/lib/album-art-cache', () => ({
  AlbumArtCache: {
    removeCachedAlbumArt: jest.fn(),
    clearCache: jest.fn(),
  },
}))

function makeSong(overrides: Partial<Song> = {}): Song {
  const id = overrides.id || Math.random().toString(36).slice(2)
  return {
    id,
    title: `Song ${id}`,
    artist: 'Test Artist',
    album: 'Test Album',
    duration: 180,
    file: new File([''], `${id}.mp3`, { type: 'audio/mpeg' }),
    ...overrides,
  } as Song
}

describe('usePlaylistManager', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.URL.revokeObjectURL = jest.fn()
  })

  describe('initial state', () => {
    it('starts with empty songs and null currentSong', () => {
      const { result } = renderHook(() => usePlaylistManager())
      expect(result.current.songs).toEqual([])
      expect(result.current.currentSong).toBeNull()
      expect(result.current.shuffleMode).toBe(false)
      expect(result.current.viewMode).toBe('grouped')
    })
  })

  describe('sortedSongs', () => {
    it('sorts by artist -> album -> title', () => {
      const { result } = renderHook(() => usePlaylistManager())

      act(() => {
        result.current.setSongs([
          makeSong({ id: '1', artist: 'Charlie', album: 'B Album', title: 'Zebra' }),
          makeSong({ id: '2', artist: 'Alice', album: 'A Album', title: 'Beta' }),
          makeSong({ id: '3', artist: 'Alice', album: 'A Album', title: 'Alpha' }),
          makeSong({ id: '4', artist: 'Bob', album: 'C Album', title: 'Gamma' }),
        ])
      })

      const sorted = result.current.sortedSongs
      expect(sorted.map(s => s.id)).toEqual(['3', '2', '4', '1'])
    })

    it('handles missing metadata gracefully', () => {
      const { result } = renderHook(() => usePlaylistManager())

      act(() => {
        result.current.setSongs([
          makeSong({ id: '1', artist: undefined, album: undefined, title: undefined }),
          makeSong({ id: '2', artist: 'Alice', album: 'Album', title: 'Song' }),
        ])
      })

      // Should not throw
      expect(result.current.sortedSongs).toHaveLength(2)
    })
  })

  describe('generateShuffledQueue', () => {
    it('returns empty array for empty list', () => {
      const { result } = renderHook(() => usePlaylistManager())
      expect(result.current.generateShuffledQueue([])).toEqual([])
    })

    it('excludes current song from queue', () => {
      const { result } = renderHook(() => usePlaylistManager())
      const songs = [makeSong({ id: '1' }), makeSong({ id: '2' }), makeSong({ id: '3' })]

      const queue = result.current.generateShuffledQueue(songs, '2')
      expect(queue.find(s => s.id === '2')).toBeUndefined()
      expect(queue).toHaveLength(2)
    })

    it('includes all songs when no currentSongId', () => {
      const { result } = renderHook(() => usePlaylistManager())
      const songs = [makeSong({ id: '1' }), makeSong({ id: '2' })]

      const queue = result.current.generateShuffledQueue(songs)
      expect(queue).toHaveLength(2)
    })

    it('contains the same songs (just shuffled)', () => {
      const { result } = renderHook(() => usePlaylistManager())
      const songs = [makeSong({ id: '1' }), makeSong({ id: '2' }), makeSong({ id: '3' })]

      const queue = result.current.generateShuffledQueue(songs)
      const ids = queue.map(s => s.id).sort()
      expect(ids).toEqual(['1', '2', '3'])
    })
  })

  describe('getNextSong — sequential mode', () => {
    it('returns first song when no current song', () => {
      const { result } = renderHook(() => usePlaylistManager())
      const songs = [makeSong({ id: '1' }), makeSong({ id: '2' })]

      act(() => { result.current.setSongs(songs) })

      const next = result.current.getNextSong()
      expect(next).not.toBeNull()
    })

    it('wraps around to first song at end of list', () => {
      const { result } = renderHook(() => usePlaylistManager())
      const songs = [makeSong({ id: '1' }), makeSong({ id: '2' })]

      act(() => {
        result.current.setSongs(songs)
        result.current.setCurrentSong(songs[1])
        result.current.setViewMode('list')
      })

      const next = result.current.getNextSong()
      expect(next?.id).toBe('1')
    })

    it('returns null for empty playlist', () => {
      const { result } = renderHook(() => usePlaylistManager())
      expect(result.current.getNextSong()).toBeNull()
    })
  })

  describe('getPreviousSong — sequential mode', () => {
    it('wraps to last song when at beginning', () => {
      const { result } = renderHook(() => usePlaylistManager())
      const songs = [makeSong({ id: '1' }), makeSong({ id: '2' }), makeSong({ id: '3' })]

      act(() => {
        result.current.setSongs(songs)
        result.current.setCurrentSong(songs[0])
        result.current.setViewMode('list')
      })

      const prev = result.current.getPreviousSong()
      expect(prev?.id).toBe('3')
    })

    it('returns null for empty playlist', () => {
      const { result } = renderHook(() => usePlaylistManager())
      expect(result.current.getPreviousSong()).toBeNull()
    })
  })

  describe('removeSong', () => {
    it('removes song from list', async () => {
      const { result } = renderHook(() => usePlaylistManager())
      const songs = [makeSong({ id: '1' }), makeSong({ id: '2' })]

      act(() => { result.current.setSongs(songs) })

      await act(async () => {
        await result.current.removeSong('1')
      })

      expect(result.current.songs).toHaveLength(1)
      expect(result.current.songs[0].id).toBe('2')
    })

    it('calls onCurrentSongRemoved when current song is removed', async () => {
      const onRemoved = jest.fn()
      const { result } = renderHook(() => usePlaylistManager({ onCurrentSongRemoved: onRemoved }))
      const songs = [makeSong({ id: '1' }), makeSong({ id: '2' })]

      act(() => {
        result.current.setSongs(songs)
        result.current.setCurrentSong(songs[0])
      })

      await act(async () => {
        await result.current.removeSong('1')
      })

      expect(onRemoved).toHaveBeenCalled()
      expect(result.current.currentSong).toBeNull()
    })
  })

  describe('resetPlaylist', () => {
    it('clears all state', async () => {
      const onReset = jest.fn()
      const { result } = renderHook(() => usePlaylistManager({ onPlaylistReset: onReset }))

      act(() => {
        result.current.setSongs([makeSong({ id: '1' })])
        result.current.setCurrentSong(makeSong({ id: '1' }))
      })

      await act(async () => {
        await result.current.resetPlaylist()
      })

      expect(result.current.songs).toEqual([])
      expect(result.current.currentSong).toBeNull()
      expect(result.current.shuffledQueue).toEqual([])
      expect(onReset).toHaveBeenCalled()
    })

    it('revokes blob URLs on reset', async () => {
      const { result } = renderHook(() => usePlaylistManager())

      act(() => {
        result.current.setSongs([
          makeSong({ id: '1', url: 'blob:http://localhost/abc' }),
          makeSong({ id: '2', albumArt: 'blob:http://localhost/art' }),
        ])
      })

      await act(async () => {
        await result.current.resetPlaylist()
      })

      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/abc')
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/art')
    })
  })

  describe('getCurrentPlaylist', () => {
    it('returns songs in grouped mode (insertion order)', () => {
      const { result } = renderHook(() => usePlaylistManager())
      const songs = [makeSong({ id: 'b' }), makeSong({ id: 'a' })]

      act(() => { result.current.setSongs(songs) })

      expect(result.current.getCurrentPlaylist().map(s => s.id)).toEqual(['b', 'a'])
    })

    it('returns sorted songs in list mode', () => {
      const { result } = renderHook(() => usePlaylistManager())
      const songs = [
        makeSong({ id: '1', artist: 'Zed', title: 'A' }),
        makeSong({ id: '2', artist: 'Alice', title: 'B' }),
      ]

      act(() => {
        result.current.setSongs(songs)
        result.current.setViewMode('list')
      })

      expect(result.current.getCurrentPlaylist()[0].id).toBe('2')
    })
  })
})
