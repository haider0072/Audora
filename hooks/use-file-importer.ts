import { useState, useRef, useCallback } from "react"
import { toast } from "@/hooks/use-toast"
import { MetadataExtractor } from "@/lib/metadata-extractor"
import { PlaylistStorage } from "@/lib/playlist-storage"
import { AlbumArtCache } from "@/lib/album-art-cache"
import type { Song } from "@/components/enhanced-playlist"

export interface UseFileImporterOptions {
  songs: Song[]
  onSongsAdded?: (newSongs: Song[]) => void
}

export interface UseFileImporterReturn {
  isLoadingSongs: boolean
  loadingProgress: { current: number; total: number }
  fileInputRef: React.RefObject<HTMLInputElement>
  folderInputRef: React.RefObject<HTMLInputElement>
  handleFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void
  handleFolderUpload: (event: React.ChangeEvent<HTMLInputElement>) => void
  addSongsToPlaylist: (files: File[]) => Promise<void>
}

const SUPPORTED_FORMATS = ["mp3", "flac", "wav", "m4a", "aac"]
const BATCH_SIZE = 5

/**
 * Custom hook for handling file uploads and metadata extraction
 *
 * Handles:
 * - File and folder upload events
 * - Metadata extraction with batching
 * - Progress tracking
 * - IndexedDB storage
 * - Duplicate detection
 * - Error handling
 */
export function useFileImporter(options: UseFileImporterOptions): UseFileImporterReturn {
  const { songs, onSongsAdded } = options

  const [isLoadingSongs, setIsLoadingSongs] = useState(false)
  const [loadingProgress, setLoadingProgress] = useState({ current: 0, total: 0 })

  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const processingRef = useRef(false)

  /**
   * Generate a unique ID for a song based on file properties
   */
  const generateSongId = useCallback((file: File): string => {
    return `${file.name}-${file.size}-${file.lastModified}`
  }, [])

  /**
   * Add songs to playlist with metadata extraction and storage
   */
  const addSongsToPlaylist = useCallback(
    async (files: File[]) => {
      // Prevent concurrent processing
      if (processingRef.current) {
        toast({ title: "Import in progress" })
        return
      }

      // Filter for supported formats
      const validFiles = files.filter((f) => {
        const ext = f.name.split(".").pop()?.toLowerCase() || ""
        return SUPPORTED_FORMATS.includes(ext)
      })

      if (validFiles.length === 0) {
        toast({ title: "No supported files", variant: "destructive" })
        return
      }

      processingRef.current = true
      setIsLoadingSongs(true)
      setLoadingProgress({ current: 0, total: validFiles.length })

      const newSongs: Song[] = []
      const duplicates: string[] = []
      const errors: string[] = []
      const existingIds = new Set(songs.map((s) => s.id))
      // Secondary content fingerprint: catches the case where the same audio
      // already lives in the library under a different songId scheme (e.g.
      // downloads use `tidal-<id>`, imports use filename-size-mtime). Same
      // file → same byte count.
      const existingSizes = new Set(
        songs
          .map((s) => s.file?.size)
          .filter((size): size is number => typeof size === "number" && size > 0)
      )

      // Process files in batches
      for (let i = 0; i < validFiles.length; i += BATCH_SIZE) {
        const batch = validFiles.slice(i, i + BATCH_SIZE)

        const batchPromises = batch.map(async (file, batchIndex) => {
          const globalIndex = i + batchIndex
          setLoadingProgress({ current: globalIndex + 1, total: validFiles.length })

          const songId = generateSongId(file)

          // Check for duplicates (by songId or by content fingerprint)
          if (existingIds.has(songId) || existingSizes.has(file.size)) {
            duplicates.push(file.name)
            return null
          }

          try {
            // Extract metadata (pure binary — no Audio element, works in background tabs)
            const metadata = await MetadataExtractor.extractMetadata(file)
            // Loudness analysis deferred to first playback (uses OfflineAudioContext
            // which gets throttled in background tabs, blocking import)
            const song: Song = { ...metadata, id: songId, file, url: "" }

            // Store in IndexedDB
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

      // Show results
      if (newSongs.length > 0) {
        onSongsAdded?.(newSongs)
        toast({ title: `Added ${newSongs.length} new song(s).` })
      }

      if (duplicates.length > 0) {
        toast({ title: `Ignored ${duplicates.length} duplicate(s).` })
      }

      if (errors.length > 0) {
        toast({
          title: `Failed to process ${errors.length} file(s).`,
          variant: "destructive"
        })
      }

      setIsLoadingSongs(false)
      processingRef.current = false
    },
    [songs, onSongsAdded, generateSongId]
  )

  /**
   * Handle file input change event
   */
  const handleFileUpload = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || [])
      if (files.length > 0) {
        addSongsToPlaylist(files)
      }
      // Reset input to allow re-uploading the same file
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    },
    [addSongsToPlaylist]
  )

  /**
   * Handle folder input change event
   */
  const handleFolderUpload = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || [])
      if (files.length > 0) {
        addSongsToPlaylist(files)
      }
      // Reset input to allow re-uploading the same folder
      if (folderInputRef.current) {
        folderInputRef.current.value = ""
      }
    },
    [addSongsToPlaylist]
  )

  return {
    isLoadingSongs,
    loadingProgress,
    fileInputRef,
    folderInputRef,
    handleFileUpload,
    handleFolderUpload,
    addSongsToPlaylist,
  }
}
