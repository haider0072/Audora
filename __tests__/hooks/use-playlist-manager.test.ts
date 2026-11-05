import { renderHook, act } from '@testing-library/react'
import { usePlaylistManager } from '@/hooks/use-playlist-manager'
import type { Song } from '@/lib/song'

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
    invalidateCachedAlbumArt: jest.fn(),
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

/**
 * Songs in a deliberately jumbled upload order. Grouped view renders them as
 * artist -> album year -> track number, i.e.
 * alpha-early-1, alpha-early-2, alpha-later-1, beta-1.
 */
function groupedViewSongs(): Song[] {
  return [
    makeSong({ id: 'beta-1', artist: 'Beta', album: 'Solo', year: '2005', trackNumber: '1' }),
    makeSong({ id: 'alpha-later-1', artist: 'Alpha', album: 'Later', year: '2010', trackNumber: '1' }),
    makeSong({ id: 'alpha-early-2', artist: 'Alpha', album: 'Early', year: '2001', trackNumber: '2' }),
    makeSong({ id: 'alpha-early-1', artist: 'Alpha', album: 'Early', year: '2001', trackNumber: '1' }),
  ]
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

    it('keeps two albums without a year apart, each in track order', () => {
      const { result } = renderHook(() => usePlaylistManager())

      act(() => {
        result.current.setSongs([
          makeSong({ id: 'b2', artist: 'X', album: 'Beta', trackNumber: '2' }),
          makeSong({ id: 'a1', artist: 'X', album: 'Alpha', trackNumber: '1' }),
          makeSong({ id: 'b1', artist: 'X', album: 'Beta', trackNumber: '1' }),
          makeSong({ id: 'a2', artist: 'X', album: 'Alpha', trackNumber: '2' }),
        ])
      })

      expect(result.current.sortedSongs.map(s => s.id)).toEqual(['a1', 'a2', 'b1', 'b2'])
    })

    it('puts an album without a year after the ones with one', () => {
      const { result } = renderHook(() => usePlaylistManager())

      act(() => {
        result.current.setSongs([
          makeSong({ id: 'none', artist: 'X', album: 'Aardvark' }),
          makeSong({ id: 'late', artist: 'X', album: 'Zebra', year: '2020' }),
          makeSong({ id: 'early', artist: 'X', album: 'Yak', year: '1999-04-01' }),
        ])
      })

      expect(result.current.sortedSongs.map(s => s.id)).toEqual(['early', 'late', 'none'])
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

  describe('peekNextSong', () => {
    it('agrees with getNextSong in sequential mode', () => {
      const { result } = renderHook(() => usePlaylistManager())
      const songs = [makeSong({ id: '1' }), makeSong({ id: '2' })]
      act(() => {
        result.current.setSongs(songs)
        result.current.setCurrentSong(songs[0])
        result.current.setViewMode('list')
      })
      expect(result.current.peekNextSong()?.id).toBe(result.current.getNextSong()?.id)
    })

    it('looks ahead without dealing a new shuffle when the queue is used up', () => {
      const { result } = renderHook(() => usePlaylistManager())
      const songs = [makeSong({ id: '1' }), makeSong({ id: '2' })]
      act(() => {
        result.current.setSongs(songs)
        result.current.setShuffleMode(true)
        result.current.setShuffledQueue([])
      })

      expect(result.current.peekNextSong()).toBeNull()
      expect(result.current.shuffledQueue).toEqual([])
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

    it('follows the on-screen order in grouped view, not upload order', () => {
      const { result } = renderHook(() => usePlaylistManager())
      // Uploaded jumbled; grouped view renders these as
      // Alpha/Early #1, Alpha/Early #2, Alpha/Later #1, Beta/Solo #1
      const songs = groupedViewSongs()

      act(() => {
        result.current.setSongs(songs)
        result.current.setCurrentSong(songs[3]) // Alpha / Early / track 1
      })

      expect(result.current.getNextSong()?.id).toBe('alpha-early-2')

      act(() => { result.current.setCurrentSong(songs[2]) }) // Alpha / Early / track 2

      expect(result.current.getNextSong()?.id).toBe('alpha-later-1')
    })

    it('wraps from the last on-screen song to the first in grouped view', () => {
      const { result } = renderHook(() => usePlaylistManager())
      const songs = groupedViewSongs()

      act(() => {
        result.current.setSongs(songs)
        result.current.setCurrentSong(songs[0]) // Beta / Solo — last on screen
      })

      expect(result.current.getNextSong()?.id).toBe('alpha-early-1')
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

    it('follows the on-screen order in grouped view, not upload order', () => {
      const { result } = renderHook(() => usePlaylistManager())
      const songs = groupedViewSongs()

      act(() => {
        result.current.setSongs(songs)
        result.current.setCurrentSong(songs[1]) // Alpha / Later / track 1
      })

      expect(result.current.getPreviousSong()?.id).toBe('alpha-early-2')
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
    it('returns sorted songs in grouped mode, not insertion order', () => {
      const { result } = renderHook(() => usePlaylistManager())
      const songs = [makeSong({ id: 'b' }), makeSong({ id: 'a' })]

      act(() => { result.current.setSongs(songs) })

      expect(result.current.getCurrentPlaylist().map(s => s.id)).toEqual(['a', 'b'])
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

  describe('the current song', () => {
    it('takes up stream info its list entry learns later, keeping its URL', () => {
      const song = makeSong({ id: 'a', format: 'FLAC' })
      const { result } = renderHook(() => usePlaylistManager())
      act(() => {
        result.current.setSongs([song])
        result.current.setCurrentSong({ ...song, url: 'blob:a' })
      })

      act(() => {
        result.current.setSongs([{ ...song, sampleRate: 96_000, bitDepth: 24, bitrate: 2400 }])
      })

      expect(result.current.currentSong).toMatchObject({
        id: 'a',
        url: 'blob:a',
        sampleRate: 96_000,
        bitDepth: 24,
        bitrate: 2400,
      })
    })

    it('stays the same object while its stream info is unchanged', () => {
      const song = makeSong({ id: 'a', format: 'FLAC', sampleRate: 44_100, bitDepth: 16, bitrate: 900 })
      const { result } = renderHook(() => usePlaylistManager())
      act(() => {
        result.current.setSongs([song])
        result.current.setCurrentSong({ ...song, url: 'blob:a' })
      })
      const current = result.current.currentSong

      act(() => {
        result.current.setSongs([{ ...song, title: 'Renamed' }, makeSong({ id: 'b' })])
      })

      expect(result.current.currentSong).toBe(current)
    })
  })

  describe('the queue', () => {
    function withSongs() {
      const songs = [makeSong({ id: '1' }), makeSong({ id: '2' }), makeSong({ id: '3' }), makeSong({ id: '4' })]
      const { result } = renderHook(() => usePlaylistManager())
      act(() => {
        result.current.setSongs(songs)
        result.current.setCurrentSong(songs[0])
      })
      return { result, songs }
    }

    it('plays queued songs in the order they were added, before the library goes on', () => {
      const { result, songs } = withSongs()
      act(() => {
        result.current.addToQueue(songs[3])
        result.current.addToQueue(songs[2])
      })
      expect(result.current.peekNextSong()?.id).toBe('4')

      act(() => result.current.notifySongSelected(songs[3], true))
      expect(result.current.peekNextSong()?.id).toBe('3')

      act(() => result.current.notifySongSelected(songs[2], true))
      expect(result.current.peekNextSong()?.id).toBe('2')
    })

    it('moves a song queued again to the end', () => {
      const { result, songs } = withSongs()
      act(() => {
        result.current.addToQueue(songs[3])
        result.current.addToQueue(songs[2])
        result.current.addToQueue(songs[3])
      })
      act(() => result.current.notifySongSelected(songs[2], true))
      expect(result.current.peekNextSong()?.id).toBe('4')
      act(() => result.current.notifySongSelected(songs[3], true))
      expect(result.current.peekNextSong()?.id).toBe('2')
    })

    it('lets "play next" go ahead of what is already queued', () => {
      const { result, songs } = withSongs()
      act(() => {
        result.current.addToQueue(songs[3])
        result.current.playNext(songs[2])
      })
      expect(result.current.peekNextSong()?.id).toBe('3')
    })

    it('carries on with the library from where it was once a queued song has played', () => {
      const { result, songs } = withSongs()
      act(() => result.current.addToQueue(songs[3]))

      // Song 4 comes off the queue and plays.
      act(() => result.current.notifySongSelected(songs[3], true))
      act(() => result.current.setCurrentSong(songs[3]))

      // Not 1, which follows 4 in the library: 2, which follows the song before the queue.
      expect(result.current.peekNextSong()?.id).toBe('2')
      expect(result.current.upNext.map((s) => s.id)).toEqual(['2', '3', '4'])
    })

    it('carries on from where it was after a queued song picked from the queue, too', () => {
      const { result, songs } = withSongs()
      act(() => {
        result.current.addToQueue(songs[2])
        result.current.addToQueue(songs[3])
      })

      // Song 4 picked out of the queue: it plays now and leaves the queue; 3 stays queued.
      act(() => result.current.notifySongSelected(songs[3], false, true))
      act(() => result.current.setCurrentSong(songs[3]))

      expect(result.current.manualQueue.map((s) => s.id)).toEqual(['3'])
      act(() => result.current.notifySongSelected(songs[2], true))
      act(() => result.current.setCurrentSong(songs[2]))
      // Then the library, from after 1, where it was before the queue.
      expect(result.current.peekNextSong()?.id).toBe('2')
    })

    it('carries on from a queued song picked anywhere else, which is a pick like any other', () => {
      const { result, songs } = withSongs()
      act(() => result.current.addToQueue(songs[2]))

      act(() => result.current.notifySongSelected(songs[2], false))
      act(() => result.current.setCurrentSong(songs[2]))

      expect(result.current.manualQueue).toEqual([])
      expect(result.current.peekNextSong()?.id).toBe('4')
    })

    it('keeps the shuffle where it was while a queued song plays', () => {
      const { result, songs } = withSongs()
      act(() => result.current.toggleShuffle())
      const due = result.current.peekNextSong()!
      const queued = songs.find((s) => s.id !== due.id && s.id !== '1')!
      act(() => result.current.addToQueue(queued))

      act(() => result.current.notifySongSelected(queued, true))

      expect(result.current.peekNextSong()?.id).toBe(due.id)
      expect(result.current.upNext[0].id).toBe(due.id)
    })

    it('lists what follows the current song in the library, going round', () => {
      const { result, songs } = withSongs()
      act(() => result.current.notifySongSelected(songs[1], false))
      act(() => result.current.setCurrentSong(songs[1]))

      expect(result.current.upNext.map((s) => s.id)).toEqual(['3', '4', '1'])
    })

    it('lists the rest of the shuffle while shuffling', () => {
      const { result } = withSongs()
      act(() => result.current.toggleShuffle())

      expect(result.current.upNext).toEqual(result.current.shuffledQueue)
      act(() => result.current.notifySongSelected(result.current.shuffledQueue[0], true))
      expect(result.current.upNext).toEqual(result.current.shuffledQueue.slice(1))
    })

    it('takes a song off the queue, and clears it', () => {
      const { result, songs } = withSongs()
      act(() => {
        result.current.addToQueue(songs[1])
        result.current.addToQueue(songs[2])
        result.current.addToQueue(songs[3])
      })

      act(() => result.current.removeFromQueue('3'))
      expect(result.current.manualQueue.map((s) => s.id)).toEqual(['2', '4'])

      act(() => result.current.clearQueue())
      expect(result.current.manualQueue).toEqual([])
      expect(result.current.peekNextSong()?.id).toBe('2')
    })
  })
})
