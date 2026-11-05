import { useState, useCallback, useMemo } from "react"
import { toast } from "@/hooks/use-toast"
import { PlaylistStorage } from "@/lib/playlist-storage"
import { AlbumArtCache } from "@/lib/album-art-cache"
import type { Song } from "@/lib/song"
import { albumKey, albumOf, artistKey, artistOf, trackNumberOf, yearOf } from "@/lib/library-groups"
import { isCloudOnlySong } from "@/lib/cloud/merge"

export interface UsePlaylistManagerOptions {
  onPlaylistChange?: (songs: Song[]) => void
  onCurrentSongRemoved?: () => void
  onPlaylistReset?: () => void
}

export interface UsePlaylistManagerReturn {
  // State
  songs: Song[]
  currentSong: Song | null
  shuffleMode: boolean
  viewMode: "grouped" | "list"
  shuffledQueue: Song[]
  currentShuffleIndex: number
  playedSongs: Set<string>
  sortedSongs: Song[]
  /** Songs queued with Play next or Add to queue, in the order they will play. */
  manualQueue: Song[]
  /**
   * What plays once the queue is done, in order: the rest of the shuffle, or
   * the library onward from the last song it played. Sequential order goes
   * round, so it holds every other song.
   */
  upNext: Song[]

  // Setters
  setSongs: React.Dispatch<React.SetStateAction<Song[]>>
  setCurrentSong: React.Dispatch<React.SetStateAction<Song | null>>
  setShuffleMode: React.Dispatch<React.SetStateAction<boolean>>
  setViewMode: React.Dispatch<React.SetStateAction<"grouped" | "list">>
  setShuffledQueue: React.Dispatch<React.SetStateAction<Song[]>>
  setCurrentShuffleIndex: React.Dispatch<React.SetStateAction<number>>
  setPlayedSongs: React.Dispatch<React.SetStateAction<Set<string>>>

  // Methods
  getCurrentPlaylist: () => Song[]
  generateShuffledQueue: (songList: Song[], currentSongId?: string) => Song[]
  getNextSong: () => Song | null
  /**
   * The song `getNextSong` would return, without any of its side effects —
   * for looking ahead (warming the next track) rather than advancing. Null
   * where advancing would first have to deal a fresh shuffle.
   */
  peekNextSong: () => Song | null
  getPreviousSong: () => Song | null
  /**
   * A song started. `fromQueue` says it was played off the queue, which an
   * advance is when the song was queued: the library's order and the shuffle
   * then carry on from where they were once the queue is done.
   */
  notifySongSelected: (song: Song, isAutoAdvance: boolean, fromQueue?: boolean) => void
  toggleShuffle: () => void
  removeSong: (songId: string) => Promise<void>
  resetPlaylist: () => Promise<void>
  playNext: (song: Song) => void
  /** Queue a song after the ones already queued. */
  addToQueue: (song: Song) => void
  removeFromQueue: (songId: string) => void
  clearQueue: () => void
}

/** `song` with its list entry's stream info, or `song` itself when they already agree. */
function withStreamInfoOf(entry: Song, song: Song): Song {
  if (entry.sampleRate === song.sampleRate && entry.bitDepth === song.bitDepth && entry.bitrate === song.bitrate) {
    return song
  }
  return { ...song, sampleRate: entry.sampleRate, bitDepth: entry.bitDepth, bitrate: entry.bitrate }
}

/**
 * Custom hook for managing playlist state and operations
 *
 * Handles:
 * - Song list management
 * - Current song tracking
 * - Shuffle mode and queue
 * - View mode (grouped/list)
 * - Sorting logic
 * - Next/previous song logic
 * - Song removal and playlist reset
 */
export function usePlaylistManager(options: UsePlaylistManagerOptions = {}): UsePlaylistManagerReturn {
  const { onPlaylistChange, onCurrentSongRemoved, onPlaylistReset } = options

  // State
  const [songs, setSongs] = useState<Song[]>([])
  const [currentSong, setCurrentSong] = useState<Song | null>(null)
  const [shuffleMode, setShuffleMode] = useState(false)
  const [viewMode, setViewMode] = useState<"grouped" | "list">("grouped")
  const [shuffledQueue, setShuffledQueue] = useState<Song[]>([])
  const [currentShuffleIndex, setCurrentShuffleIndex] = useState(0)
  const [playedSongs, setPlayedSongs] = useState<Set<string>>(new Set())
  const [manualQueue, setManualQueue] = useState<Song[]>([])
  // The last song played in the library's own order rather than off the
  // queue. Queued songs are an interlude: once they are done, the library
  // carries on from here, not from wherever the last queued song sits in it.
  const [contextSong, setContextSong] = useState<Song | null>(null)

  // The current song is a copy of its list entry, taken when it was picked.
  // Stream info can reach the list later — read from an older song's file, or
  // from the cloud index — so whenever the list changes the copy takes it up,
  // adjusted while rendering rather than in an effect.
  const [songsSeen, setSongsSeen] = useState(songs)
  if (songs !== songsSeen) {
    setSongsSeen(songs)
    const entry = currentSong && songs.find((song) => song.id === currentSong.id)
    if (currentSong && entry) {
      const refreshed = withStreamInfoOf(entry, currentSong)
      if (refreshed !== currentSong) setCurrentSong(refreshed)
    }
  }

  /**
   * Sort songs by artist (alpha) -> album year (oldest first, missing last) -> track number -> title
   */
  const sortedSongs = useMemo(() => {
    // Each song's sort keys, worked out once rather than in every comparison.
    const keys = new Map<Song, { artist: string; album: string; track: number }>()
    // An album's year is the first one any of its songs gives.
    const albumYears = new Map<string, number>()
    for (const song of songs) {
      const artist = artistOf(song)
      const album = albumKey(artist, albumOf(song))
      keys.set(song, { artist: artistKey(artist), album, track: trackNumberOf(song) ?? Infinity })
      const year = yearOf(song)
      if (year !== undefined && !albumYears.has(album)) albumYears.set(album, year)
    }

    return [...songs].sort((a, b) => {
      const keyA = keys.get(a)!
      const keyB = keys.get(b)!
      if (keyA.artist !== keyB.artist) return keyA.artist.localeCompare(keyB.artist)
      if (keyA.album !== keyB.album) {
        // Compared before subtracting: two albums without a year would give
        // Infinity - Infinity, and a NaN comparison lets their songs interleave.
        const yearA = albumYears.get(keyA.album) ?? Infinity
        const yearB = albumYears.get(keyB.album) ?? Infinity
        if (yearA !== yearB) return yearA - yearB
        return keyA.album.localeCompare(keyB.album)
      }
      if (keyA.track !== keyB.track) return keyA.track - keyB.track
      return (a.title || "").localeCompare(b.title || "")
    })
  }, [songs])

  /**
   * The playback order — always the order the user is looking at.
   *
   * Both views render the same sequence: list view maps `sortedSongs` directly,
   * and grouped view rebuilds it as artist -> album year -> track number, which
   * is what `sortedSongs` already sorts by. Grouped view used to fall back to
   * the raw `songs` array (upload order), so next/previous stepped through a
   * sequence that had nothing to do with the screen and read as stuck-on
   * shuffle.
   */
  const getCurrentPlaylist = useCallback(() => sortedSongs, [sortedSongs])

  /**
   * Generate a shuffled queue excluding the current song
   */
  const generateShuffledQueue = useCallback((songList: Song[], currentSongId?: string) => {
    if (songList.length === 0) return []

    let availableSongs = [...songList]
    if (currentSongId) {
      availableSongs = availableSongs.filter((song) => song.id !== currentSongId)
    }

    // Fisher-Yates shuffle
    for (let i = availableSongs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[availableSongs[i], availableSongs[j]] = [availableSongs[j], availableSongs[i]]
    }

    return availableSongs
  }, [])

  /**
   * Toggle shuffle mode
   */
  const toggleShuffle = useCallback(() => {
    const newShuffleMode = !shuffleMode
    setShuffleMode(newShuffleMode)

    if (newShuffleMode) {
      const currentPlaylist = getCurrentPlaylist()
      const newShuffledQueue = generateShuffledQueue(currentPlaylist, currentSong?.id)
      setShuffledQueue(newShuffledQueue)
      setCurrentShuffleIndex(0)
      setPlayedSongs(new Set(currentSong ? [currentSong.id] : []))
      toast({ title: "Shuffle enabled" })
    } else {
      setShuffledQueue([])
      setCurrentShuffleIndex(0)
      setPlayedSongs(new Set())
      toast({ title: "Shuffle disabled" })
    }
  }, [shuffleMode, getCurrentPlaylist, generateShuffledQueue, currentSong])

  /**
   * Get the next song based on shuffle mode
   */
  const peekNextSong = useCallback((): Song | null => {
    // Manual queue takes priority over both shuffle and sequential modes
    if (manualQueue.length > 0) return manualQueue[0]

    const currentPlaylist = getCurrentPlaylist()
    if (currentPlaylist.length === 0) return null

    if (shuffleMode) {
      return currentShuffleIndex < shuffledQueue.length ? shuffledQueue[currentShuffleIndex] : null
    }

    // Sequential mode
    const anchor = contextSong ?? currentSong
    if (!anchor) return currentPlaylist[0] || null

    const currentIndex = currentPlaylist.findIndex((s) => s.id === anchor.id)
    if (currentIndex === -1) return currentPlaylist[0] || null

    return currentPlaylist[(currentIndex + 1) % currentPlaylist.length]
  }, [getCurrentPlaylist, shuffleMode, shuffledQueue, currentShuffleIndex, contextSong, currentSong, manualQueue])

  const upNext = useMemo(() => {
    if (shuffleMode) return shuffledQueue.slice(currentShuffleIndex)
    const anchor = contextSong ?? currentSong
    const index = anchor ? sortedSongs.findIndex((s) => s.id === anchor.id) : -1
    if (index === -1) return sortedSongs
    return [...sortedSongs.slice(index + 1), ...sortedSongs.slice(0, index)]
  }, [shuffleMode, shuffledQueue, currentShuffleIndex, contextSong, currentSong, sortedSongs])

  const getNextSong = useCallback((): Song | null => {
    const next = peekNextSong()
    if (next || !shuffleMode || manualQueue.length > 0) return next

    // Shuffle queue exhausted: deal a fresh one.
    const currentPlaylist = getCurrentPlaylist()
    if (currentPlaylist.length === 0) return null
    const newQueue = generateShuffledQueue(currentPlaylist)
    setShuffledQueue(newQueue)
    setCurrentShuffleIndex(0)
    setPlayedSongs(new Set())
    return newQueue.length > 0 ? newQueue[0] : null
  }, [peekNextSong, shuffleMode, manualQueue, getCurrentPlaylist, generateShuffledQueue])

  /**
   * Get the previous song based on shuffle mode
   */
  const getPreviousSong = useCallback((): Song | null => {
    const currentPlaylist = getCurrentPlaylist()
    if (currentPlaylist.length === 0) return null

    if (shuffleMode) {
      // Go back in shuffled queue
      if (currentShuffleIndex > 1) {
        return shuffledQueue[currentShuffleIndex - 2]
      }
      return null
    }

    // Sequential mode
    if (!currentSong) return currentPlaylist[currentPlaylist.length - 1] || null

    const currentIndex = currentPlaylist.findIndex((s) => s.id === currentSong.id)
    if (currentIndex === -1) return currentPlaylist[currentPlaylist.length - 1] || null

    return currentPlaylist[currentIndex === 0 ? currentPlaylist.length - 1 : currentIndex - 1]
  }, [getCurrentPlaylist, shuffleMode, shuffledQueue, currentShuffleIndex, currentSong])

  const notifySongSelected = useCallback((song: Song, isAutoAdvance: boolean, fromQueue = isAutoAdvance) => {
    // A song that played off the queue leaves the library's order and the
    // shuffle where they were. Advancing the shuffle for it skipped the
    // shuffled song that was due next.
    const offQueue = fromQueue && manualQueue.some((s) => s.id === song.id)

    // Drop the song from manual queue if it matches (auto-advance from queue head,
    // or user clicked a queued song directly — either way it should leave the queue)
    setManualQueue((prev) => {
      if (prev.length === 0) return prev
      const idx = prev.findIndex((s) => s.id === song.id)
      if (idx === -1) return prev
      const next = [...prev]
      next.splice(idx, 1)
      return next
    })

    if (offQueue) {
      // A song brought back on reload was never picked, so it is not the
      // context yet. It becomes it when the queue takes over from it.
      setContextSong((prev) => prev ?? currentSong)
      return
    }
    setContextSong(song)
    if (!shuffleMode) return

    if (isAutoAdvance) {
      setCurrentShuffleIndex((prev) => prev + 1)
    } else {
      const songIndex = shuffledQueue.findIndex((s) => s.id === song.id)
      if (songIndex !== -1) setCurrentShuffleIndex(songIndex + 1)
    }
    setPlayedSongs((prev) => new Set(prev).add(song.id))
  }, [shuffleMode, shuffledQueue, manualQueue, currentSong])

  /**
   * Insert a song at the front of the manual queue (LIFO).
   * If the song is already queued, it moves to the front.
   */
  const playNext = useCallback((song: Song) => {
    setManualQueue((prev) => {
      const filtered = prev.filter((s) => s.id !== song.id)
      return [song, ...filtered]
    })
    toast({ title: "Added to play next", description: song.title })
  }, [])

  /**
   * Add a song to the end of the manual queue (FIFO).
   * If the song is already queued, it moves to the end.
   */
  const addToQueue = useCallback((song: Song) => {
    setManualQueue((prev) => [...prev.filter((s) => s.id !== song.id), song])
    toast({ title: "Added to queue", description: song.title })
  }, [])

  const removeFromQueue = useCallback((songId: string) => {
    setManualQueue((prev) => prev.filter((s) => s.id !== songId))
  }, [])

  const clearQueue = useCallback(() => setManualQueue([]), [])

  /**
   * Remove a song from the playlist
   */
  const removeSong = useCallback(
    async (songId: string) => {
      // A cloud-only song has nothing on this device to remove, and the next
      // library refresh would put it straight back.
      const target = songs.find((s) => s.id === songId)
      if (target && isCloudOnlySong(target)) {
        toast({
          title: "This song lives in your cloud library",
          description: "Delete it from the bucket to remove it everywhere.",
        })
        return
      }

      // Attempt to remove the song file from storage
      try {
        await PlaylistStorage.removeSongFile(songId)
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error"
        toast({
          title: "Could not remove song",
          description: message,
          variant: "destructive"
        })
        return
      }

      // Album art removal is best-effort — don't fail the entire removal if it throws
      try {
        await PlaylistStorage.removeAlbumArt(songId)
      } catch (error) {
        console.error(`Failed to remove album art for ${songId}:`, error)
      }

      // Revoke the song's blob: URL if it exists
      const songToRemove = songs.find((s) => s.id === songId)
      if (songToRemove?.albumArt?.startsWith("blob:")) {
        URL.revokeObjectURL(songToRemove.albumArt)
      }

      // Unconditional: the art has just been deleted from storage, so a cached
      // entry for it is stale whether or not a row is still holding a
      // reference. `removeCachedAlbumArt` would decline in exactly that case.
      AlbumArtCache.invalidateCachedAlbumArt(songId)

      setSongs((prev) => {
        const newSongs = prev.filter((s) => s.id !== songId)

        // Update shuffled queue if in shuffle mode
        if (shuffleMode) {
          setShuffledQueue((prevQ) => prevQ.filter((s) => s.id !== songId))
        }

        // Drop from manual queue too
        setManualQueue((prevQ) => prevQ.filter((s) => s.id !== songId))
        setContextSong((prevContext) => (prevContext?.id === songId ? null : prevContext))

        // Clear current song if it was removed
        if (currentSong?.id === songId) {
          if (currentSong.url) {
            URL.revokeObjectURL(currentSong.url)
          }
          setCurrentSong(null)
          onCurrentSongRemoved?.()
        }

        onPlaylistChange?.(newSongs)
        return newSongs
      })

      toast({ title: "Song removed" })
    },
    [currentSong, shuffleMode, songs, onPlaylistChange, onCurrentSongRemoved]
  )

  /**
   * Reset the entire playlist
   */
  const resetPlaylist = useCallback(async () => {
    // Clear storage first. Resetting the UI while the bytes are still on disk
    // would leave every record unreachable — the exact way orphans are made.
    try {
      await PlaylistStorage.clearPlaylist()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      toast({
        title: "Could not clear playlist",
        description: message,
        variant: "destructive",
      })
      return
    }

    // Only now discard the in-memory copies. Clearing the art cache before the
    // storage call would strip covers off a playlist that is still intact when
    // that call fails.
    AlbumArtCache.clearCache()

    songs.forEach((song) => {
      if (song.url) URL.revokeObjectURL(song.url)
      if (song.albumArt && song.albumArt.startsWith("blob:")) {
        URL.revokeObjectURL(song.albumArt)
      }
    })

    // Reset all state
    setSongs([])
    setCurrentSong(null)
    setShuffledQueue([])
    setCurrentShuffleIndex(0)
    setPlayedSongs(new Set())
    setManualQueue([])
    setContextSong(null)

    onPlaylistReset?.()
    onPlaylistChange?.([])
  }, [songs, onPlaylistChange, onPlaylistReset])

  return {
    // State
    songs,
    currentSong,
    shuffleMode,
    viewMode,
    shuffledQueue,
    currentShuffleIndex,
    playedSongs,
    sortedSongs,
    manualQueue,
    upNext,

    // Setters
    setSongs,
    setCurrentSong,
    setShuffleMode,
    setViewMode,
    setShuffledQueue,
    setCurrentShuffleIndex,
    setPlayedSongs,

    // Methods
    getCurrentPlaylist,
    generateShuffledQueue,
    getNextSong,
    peekNextSong,
    getPreviousSong,
    notifySongSelected,
    toggleShuffle,
    removeSong,
    resetPlaylist,
    playNext,
    addToQueue,
    removeFromQueue,
    clearQueue,
  }
}
