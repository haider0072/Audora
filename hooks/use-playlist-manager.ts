import { useState, useCallback, useMemo } from "react"
import { toast } from "@/hooks/use-toast"
import { PlaylistStorage } from "@/lib/playlist-storage"
import { AlbumArtCache } from "@/lib/album-art-cache"
import type { Song } from "@/components/enhanced-playlist"

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
  getPreviousSong: () => Song | null
  notifySongSelected: (song: Song, isAutoAdvance: boolean) => void
  toggleShuffle: () => void
  removeSong: (songId: string) => Promise<void>
  resetPlaylist: () => Promise<void>
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

  /**
   * Sort songs by artist (alpha) -> album year (oldest first, missing last) -> track number -> title
   */
  const sortedSongs = useMemo(() => {
    // Pick first 4-digit run from a year string; Infinity if missing/invalid
    const parseYear = (y?: string): number => {
      if (!y) return Infinity
      const match = y.match(/\d{4}/)
      return match ? parseInt(match[0], 10) : Infinity
    }
    // Parse leading integer ("3" or "3/12"); Infinity if missing/invalid
    const parseTrack = (t?: string): number => {
      if (!t) return Infinity
      const n = parseInt(t, 10)
      return Number.isNaN(n) ? Infinity : n
    }

    // First pass: compute representative year per (artist, album) — first non-empty year wins
    const albumYearMap = new Map<string, number>()
    for (const s of songs) {
      const artistKey = (s.artists?.[0] || s.artist || "Unknown Artist").trim().toLowerCase()
      const albumKey = `${artistKey}::${(s.album || "Unknown Album").trim().toLowerCase()}`
      if (!albumYearMap.has(albumKey)) {
        albumYearMap.set(albumKey, parseYear(s.year))
      } else if (albumYearMap.get(albumKey) === Infinity) {
        // Upgrade if we now have a real year
        const y = parseYear(s.year)
        if (y !== Infinity) albumYearMap.set(albumKey, y)
      }
    }

    return [...songs].sort((a, b) => {
      const artistA = (a.artists?.[0] || a.artist || "Unknown Artist").trim().toLowerCase()
      const artistB = (b.artists?.[0] || b.artist || "Unknown Artist").trim().toLowerCase()
      if (artistA !== artistB) return artistA.localeCompare(artistB)

      const albumKeyA = `${artistA}::${(a.album || "Unknown Album").trim().toLowerCase()}`
      const albumKeyB = `${artistB}::${(b.album || "Unknown Album").trim().toLowerCase()}`
      if (albumKeyA !== albumKeyB) {
        const yearDiff = (albumYearMap.get(albumKeyA) ?? Infinity) - (albumYearMap.get(albumKeyB) ?? Infinity)
        if (yearDiff !== 0) return yearDiff
        return albumKeyA.localeCompare(albumKeyB)
      }

      const tA = parseTrack(a.trackNumber)
      const tB = parseTrack(b.trackNumber)
      if (tA !== tB) return tA - tB
      return (a.title || "").localeCompare(b.title || "")
    })
  }, [songs])

  /**
   * Get the current playlist based on view mode
   */
  const getCurrentPlaylist = useCallback(
    () => (viewMode === "list" ? sortedSongs : songs),
    [viewMode, sortedSongs, songs]
  )

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
  const getNextSong = useCallback((): Song | null => {
    const currentPlaylist = getCurrentPlaylist()
    if (currentPlaylist.length === 0) return null

    if (shuffleMode) {
      // Return next song from shuffled queue
      if (currentShuffleIndex < shuffledQueue.length) {
        return shuffledQueue[currentShuffleIndex]
      }

      // Queue exhausted, generate new queue
      const newQueue = generateShuffledQueue(currentPlaylist)
      setShuffledQueue(newQueue)
      setCurrentShuffleIndex(0)
      setPlayedSongs(new Set())
      return newQueue.length > 0 ? newQueue[0] : null
    }

    // Sequential mode
    if (!currentSong) return currentPlaylist[0] || null

    const currentIndex = currentPlaylist.findIndex((s) => s.id === currentSong.id)
    if (currentIndex === -1) return currentPlaylist[0] || null

    return currentPlaylist[(currentIndex + 1) % currentPlaylist.length]
  }, [getCurrentPlaylist, shuffleMode, shuffledQueue, currentShuffleIndex, currentSong, generateShuffledQueue])

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

  /**
   * Notify the playlist manager that a song was selected (for shuffle index tracking)
   * Call this from selectSong in the player component.
   */
  const notifySongSelected = useCallback((song: Song, isAutoAdvance: boolean) => {
    if (!shuffleMode) return

    if (isAutoAdvance) {
      setCurrentShuffleIndex((prev) => prev + 1)
    } else {
      const songIndex = shuffledQueue.findIndex((s) => s.id === song.id)
      if (songIndex !== -1) setCurrentShuffleIndex(songIndex + 1)
    }
    setPlayedSongs((prev) => new Set(prev).add(song.id))
  }, [shuffleMode, shuffledQueue])

  /**
   * Remove a song from the playlist
   */
  const removeSong = useCallback(
    async (songId: string) => {
      await PlaylistStorage.removeSongFile(songId)
      await PlaylistStorage.removeAlbumArt(songId)
      AlbumArtCache.removeCachedAlbumArt(songId)

      setSongs((prev) => {
        const newSongs = prev.filter((s) => s.id !== songId)

        // Update shuffled queue if in shuffle mode
        if (shuffleMode) {
          setShuffledQueue((prevQ) => prevQ.filter((s) => s.id !== songId))
        }

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
    [currentSong, shuffleMode, onPlaylistChange, onCurrentSongRemoved]
  )

  /**
   * Reset the entire playlist
   */
  const resetPlaylist = useCallback(async () => {
    // Revoke all object URLs
    songs.forEach((song) => {
      if (song.url) URL.revokeObjectURL(song.url)
      if (song.albumArt && song.albumArt.startsWith("blob:")) {
        URL.revokeObjectURL(song.albumArt)
      }
    })

    // Clear cache and storage
    AlbumArtCache.clearCache()
    await PlaylistStorage.clearPlaylist()

    // Reset all state
    setSongs([])
    setCurrentSong(null)
    setShuffledQueue([])
    setCurrentShuffleIndex(0)
    setPlayedSongs(new Set())

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
    getPreviousSong,
    notifySongSelected,
    toggleShuffle,
    removeSong,
    resetPlaylist,
  }
}
