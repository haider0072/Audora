import { useState, useEffect, useCallback } from "react"
import { toast } from "@/hooks/use-toast"
import { StorageManager } from "@/lib/storage"
import { PlaylistStorage } from "@/lib/playlist-storage"
import { AlbumArtCache } from "@/lib/album-art-cache"
import type { Song } from "@/components/enhanced-playlist"
import type { EqualizerBand } from "@/components/refined-equalizer"

export interface PlaylistPersistenceData {
  songs: Song[]
  currentSongId?: string
  equalizerBands: EqualizerBand[]
  volume: number
  shuffleMode: boolean
  viewMode: "grouped" | "list"
  showEqualizer: boolean
}

export interface UsePlaylistPersistenceOptions {
  autoSave?: boolean
  saveDelay?: number
}

export interface UsePlaylistPersistenceReturn {
  isInitialized: boolean
  isRestoringPlaylist: boolean
  restorePlaylist: () => Promise<{
    songs: Song[]
    currentSong: Song | null
    settings: Partial<PlaylistPersistenceData>
  }>
  savePlaylist: (data: PlaylistPersistenceData) => void
}

/**
 * Custom hook for persisting playlist data to IndexedDB and localStorage
 *
 * Handles:
 * - Loading saved playlist on mount
 * - Auto-saving playlist changes
 * - Restoring song files from IndexedDB
 * - Restoring album art
 * - Saving player settings
 */
export function usePlaylistPersistence(
  options: UsePlaylistPersistenceOptions = {}
): UsePlaylistPersistenceReturn {
  const { autoSave = true, saveDelay = 1000 } = options

  const [isInitialized, setIsInitialized] = useState(false)
  const [isRestoringPlaylist, setIsRestoringPlaylist] = useState(false)

  /**
   * Restore playlist from storage on mount
   */
  const restorePlaylist = useCallback(async () => {
    try {
      setIsRestoringPlaylist(true)

      const savedData = StorageManager.loadData()
      const settings: Partial<PlaylistPersistenceData> = {}

      // Load player settings
      if (savedData.equalizerBands) {
        settings.equalizerBands = savedData.equalizerBands
      }

      if (savedData.playerSettings) {
        settings.volume = savedData.playerSettings.volume
        settings.shuffleMode = savedData.playerSettings.shuffleMode
        settings.viewMode = savedData.playerSettings.viewMode
        settings.showEqualizer = savedData.playerSettings.showEqualizer
      }

      // Load playlist metadata
      const playlistData = PlaylistStorage.loadPlaylistMetadata()

      if (playlistData && playlistData.songs.length > 0) {
        const validSongs = await PlaylistStorage.validateStoredFiles(playlistData.songs)

        if (validSongs.length > 0) {
          const restoredSongs: Song[] = []

          // Restore each song from IndexedDB
          for (const songMetadata of validSongs) {
            const file = await PlaylistStorage.getSongFile(songMetadata.id)

            if (file) {
              let albumArt = songMetadata.albumArt

              // Restore album art if it was a blob URL
              if (songMetadata.albumArt && songMetadata.albumArt.startsWith("blob:")) {
                const restoredAlbumArt = await PlaylistStorage.getAlbumArt(songMetadata.id)

                if (restoredAlbumArt) {
                  albumArt = restoredAlbumArt
                  await AlbumArtCache.preloadAlbumArt(songMetadata.id, restoredAlbumArt)
                } else {
                  albumArt = undefined
                }
              }

              // Prefer artists[0] for artist if artists exists
              const artist =
                songMetadata.artists && songMetadata.artists.length > 0
                  ? songMetadata.artists[0]
                  : songMetadata.artist

              restoredSongs.push({ ...songMetadata, artist, file, url: "", albumArt })
            }
          }

          if (restoredSongs.length > 0) {
            toast({
              title: "Playlist restored",
              description: `Restored ${restoredSongs.length} song(s).`,
            })

            // Find current song
            let currentSong: Song | null = null
            if (playlistData.currentSongId) {
              const current = restoredSongs.find((s) => s.id === playlistData.currentSongId)
              if (current) {
                currentSong = current
              }
            }

            setIsInitialized(true)
            setIsRestoringPlaylist(false)

            return { songs: restoredSongs, currentSong, settings }
          }
        }
      }

      setIsInitialized(true)
      setIsRestoringPlaylist(false)

      return { songs: [], currentSong: null, settings }
    } catch (error) {
      console.error("Error loading saved data:", error)
      setIsInitialized(true)
      setIsRestoringPlaylist(false)

      return { songs: [], currentSong: null, settings: {} }
    }
  }, [])

  /**
   * Save playlist to storage
   */
  const savePlaylist = useCallback((data: PlaylistPersistenceData) => {
    const { songs, currentSongId, equalizerBands, volume, shuffleMode, viewMode, showEqualizer } =
      data

    // Serialize songs (exclude File objects)
    const serializableSongs = songs.map((song) => ({
      id: song.id,
      title: song.title,
      artist: song.artist,
      artists: song.artists,
      album: song.album,
      year: song.year,
      genre: song.genre,
      bitrate: song.bitrate,
      sampleRate: song.sampleRate,
      duration: song.duration,
      isHiRes: song.isHiRes,
      albumArt: song.albumArt,
      fileSize: song.fileSize,
      format: song.format,
      fileName: song.file ? song.file.name : "",
      fileLastModified: song.file ? song.file.lastModified : 0,
      fileType: song.file ? song.file.type : "",
    }))

    // Save playlist metadata
    PlaylistStorage.savePlaylistMetadata(serializableSongs, currentSongId)

    // Save player settings
    StorageManager.saveData({
      songs: serializableSongs,
      equalizerBands,
      playerSettings: { volume, shuffleMode, viewMode, showEqualizer },
      currentSongId,
    })
  }, [])

  return {
    isInitialized,
    isRestoringPlaylist,
    restorePlaylist,
    savePlaylist,
  }
}

/**
 * Hook for auto-saving playlist changes
 */
export function useAutoSave(
  data: PlaylistPersistenceData | null,
  isInitialized: boolean,
  isRestoringPlaylist: boolean,
  savePlaylist: (data: PlaylistPersistenceData) => void,
  delay: number = 1000
) {
  useEffect(() => {
    if (!isInitialized || isRestoringPlaylist || !data) return

    const timeoutId = setTimeout(() => {
      savePlaylist(data)
    }, delay)

    return () => clearTimeout(timeoutId)
  }, [data, isInitialized, isRestoringPlaylist, savePlaylist, delay])
}
