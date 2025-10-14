import { useState, useCallback, useMemo } from "react"
import { toast } from "@/hooks/use-toast"
import { PlaylistStorage } from "@/lib/playlist-storage"
import { AlbumArtCache } from "@/lib/album-art-cache"
import type { Song } from "@/components/enhanced-playlist"

export interface UsePlaylistManagerOptions {
  onPlaylistChange?: (songs: Song[]) => void
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
  setViewMode: React.Dispatch<React.SetStateAction<"grouped" | "list">>
  setShuffledQueue: React.Dispatch<React.SetStateAction<Song[]>>
  setCurrentShuffleIndex: React.Dispatch<React.SetStateAction<number>>
  setPlayedSongs: React.Dispatch<React.SetStateAction<Set<string>>>

  // Methods
  getCurrentPlaylist: () => Song[]
  generateShuffledQueue: (songList: Song[], currentSongId?: string) => Song[]
  getNextSong: () => Song | null
  getPreviousSong: () => Song | null
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
  const { onPlaylistChange } = options

  // State
  const [songs, setSongs] = useState<Song[]>([])
  const [currentSong, setCurrentSong] = useState<Song | null>(null)
  const [shuffleMode, setShuffleMode] = useState(false)
  const [viewMode, setViewMode] = useState<"grouped" | "list">("grouped")
  const [shuffledQueue, setShuffledQueue] = useState<Song[]>([])
  const [currentShuffleIndex, setCurrentShuffleIndex] = useState(0)
  const [playedSongs, setPlayedSongs] = useState<Set<string>>(new Set())

  /**
   * Sort songs by artist -> album -> title
   */
  const sortedSongs = useMemo(() => {
    return [...songs].sort((a, b) => {
      const artistA = (a.artists?.[0] || a.artist || "Unknown Artist").toLowerCase()
      const artistB = (b.artists?.[0] || b.artist || "Unknown Artist").toLowerCase()

      if (artistA === artistB) {
        const albumA = (a.album || "Unknown Album").toLowerCase()
        const albumB = (b.album || "Unknown Album").toLowerCase()

        if (albumA === albumB) {
          return (a.title || "").localeCompare(b.title || "")
        }

        return albumA.localeCompare(albumB)
      }

      return artistA.localeCompare(artistB)
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
        }

        onPlaylistChange?.(newSongs)
        return newSongs
      })

      toast({ title: "Song removed" })
    },
    [currentSong, shuffleMode, onPlaylistChange]
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

    onPlaylistChange?.([])
  }, [songs, onPlaylistChange])

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
    setViewMode,
    setShuffledQueue,
    setCurrentShuffleIndex,
    setPlayedSongs,

    // Methods
    getCurrentPlaylist,
    generateShuffledQueue,
    getNextSong,
    getPreviousSong,
    toggleShuffle,
    removeSong,
    resetPlaylist,
  }
}
