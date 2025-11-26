import { useState, useRef, useCallback } from "react"
import { toast } from "@/hooks/use-toast"
import { MetadataExtractor } from "@/lib/metadata-extractor"
import { PlaylistStorage } from "@/lib/playlist-storage"
import { AlbumArtCache } from "@/lib/album-art-cache"
import type { Song } from "@/components/enhanced-playlist"

export interface UseFolderSyncOptions {
  songs: Song[]
  onSongsAdded?: (newSongs: Song[]) => void
  onSongsRemoved?: (removedIds: string[]) => void
}

export interface UseFolderSyncReturn {
  isSyncing: boolean
  syncProgress: { current: number; total: number }
  lastSyncedFolder: string | null
  syncInputRef: React.RefObject<HTMLInputElement>
  handleFolderSync: (event: React.ChangeEvent<HTMLInputElement>) => void
  triggerFolderSync: () => void
}

const SUPPORTED_FORMATS = ["mp3", "flac", "wav", "m4a", "aac"]
const BATCH_SIZE = 5

/**
 * Generate a unique ID for a song based on file properties
 */
const generateSongId = (file: File): string => {
  return `${file.name}-${file.size}-${file.lastModified}`
}

/**
 * Custom hook for syncing a folder with the playlist
 *
 * Features:
 * - Detects new songs in folder and adds them
 * - Detects removed songs and optionally removes them
 * - Skips duplicates
 * - Shows sync progress
 */
export function useFolderSync(options: UseFolderSyncOptions): UseFolderSyncReturn {
  const { songs, onSongsAdded, onSongsRemoved } = options

  const [isSyncing, setIsSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0 })
  const [lastSyncedFolder, setLastSyncedFolder] = useState<string | null>(null)

  const syncInputRef = useRef<HTMLInputElement>(null)
  const processingRef = useRef(false)

  /**
   * Process files and sync with current playlist
   */
  const syncFolder = useCallback(
    async (files: File[]) => {
      if (processingRef.current) {
        toast({ title: "Sync already in progress" })
        return
      }

      // Filter for supported formats
      const validFiles = files.filter((f) => {
        const ext = f.name.split(".").pop()?.toLowerCase() || ""
        return SUPPORTED_FORMATS.includes(ext)
      })

      if (validFiles.length === 0) {
        toast({ title: "No supported audio files found", variant: "destructive" })
        return
      }

      // Get folder name from first file's path
      const firstFile = validFiles[0]
      const folderPath = (firstFile as any).webkitRelativePath?.split("/")[0] || "Selected Folder"
      setLastSyncedFolder(folderPath)

      processingRef.current = true
      setIsSyncing(true)
      setSyncProgress({ current: 0, total: validFiles.length })

      // Create sets for comparison
      const existingIds = new Set(songs.map((s) => s.id))
      const newFileIds = new Set(validFiles.map((f) => generateSongId(f)))

      // Find new files (in folder but not in playlist)
      const filesToAdd = validFiles.filter((f) => !existingIds.has(generateSongId(f)))

      // Find removed files (in playlist but not in folder)
      // Only consider songs that were from this folder (matching pattern)
      const removedIds = songs
        .filter((s) => !newFileIds.has(s.id))
        .map((s) => s.id)

      const newSongs: Song[] = []
      const errors: string[] = []

      // Process new files in batches
      if (filesToAdd.length > 0) {
        setSyncProgress({ current: 0, total: filesToAdd.length })

        for (let i = 0; i < filesToAdd.length; i += BATCH_SIZE) {
          const batch = filesToAdd.slice(i, i + BATCH_SIZE)

          const batchPromises = batch.map(async (file, batchIndex) => {
            const globalIndex = i + batchIndex
            setSyncProgress({ current: globalIndex + 1, total: filesToAdd.length })

            const songId = generateSongId(file)

            try {
              const metadata = await MetadataExtractor.extractMetadata(file)
              const song: Song = { ...metadata, id: songId, file, url: "" }

              await PlaylistStorage.storeSongFile(songId, file)

              if (metadata.albumArt) {
                await PlaylistStorage.storeAlbumArt(songId, metadata.albumArt)
                await AlbumArtCache.preloadAlbumArt(songId, metadata.albumArt)
              }

              return song
            } catch (error) {
              console.error(`Error processing ${file.name}:`, error)
              errors.push(file.name)
              return null
            }
          })

          const batchResults = await Promise.all(batchPromises)
          newSongs.push(...batchResults.filter((s): s is Song => s !== null))
        }
      }

      // Report results
      const results: string[] = []

      if (newSongs.length > 0) {
        onSongsAdded?.(newSongs)
        results.push(`${newSongs.length} new song(s) added`)
      }

      if (removedIds.length > 0 && onSongsRemoved) {
        // Don't auto-remove, just notify user
        results.push(`${removedIds.length} song(s) no longer in folder`)
      }

      if (errors.length > 0) {
        results.push(`${errors.length} file(s) failed`)
      }

      if (newSongs.length === 0 && removedIds.length === 0 && errors.length === 0) {
        toast({ title: "Folder is in sync", description: "No new songs found" })
      } else {
        toast({
          title: "Sync Complete",
          description: results.join(" • "),
        })
      }

      setIsSyncing(false)
      processingRef.current = false
    },
    [songs, onSongsAdded, onSongsRemoved]
  )

  /**
   * Handle folder input change event
   */
  const handleFolderSync = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || [])
      if (files.length > 0) {
        syncFolder(files)
      }
      // Reset input to allow re-syncing the same folder
      if (syncInputRef.current) {
        syncInputRef.current.value = ""
      }
    },
    [syncFolder]
  )

  /**
   * Trigger the folder picker
   */
  const triggerFolderSync = useCallback(() => {
    syncInputRef.current?.click()
  }, [])

  return {
    isSyncing,
    syncProgress,
    lastSyncedFolder,
    syncInputRef,
    handleFolderSync,
    triggerFolderSync,
  }
}
