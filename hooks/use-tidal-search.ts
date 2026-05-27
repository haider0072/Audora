"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { toast } from "@/hooks/use-toast"
import { TidalService, type SearchSource } from "@/lib/tidal-service"
import { MetadataExtractor } from "@/lib/metadata-extractor"
import { LoudnessAnalyzer } from "@/lib/loudness-analyzer"
import { PlaylistStorage } from "@/lib/playlist-storage"
import { AlbumArtCache } from "@/lib/album-art-cache"
import { embedFlacMetadata } from "@/lib/flac-art-embedder"
import type { Song } from "@/components/enhanced-playlist"
import type {
  TidalTrack,
  TidalAlbum,
  TidalSearchResult,
  TidalDiscographyResult,
  DownloadState,
} from "@/lib/tidal-types"

export interface UseTidalSearchOptions {
  songs: Song[]
  onSongDownloaded: (song: Song) => void
}

export type TidalView = "search" | "album" | "artist"
export type TidalQuality = "HI_RES_LOSSLESS" | "LOSSLESS" | "HIGH"

const MAX_CONCURRENT_DOWNLOADS = 2

export function useTidalSearch(options: UseTidalSearchOptions) {
  const { songs, onSongDownloaded } = options

  // No auth needed for Tidal — always authenticated
  const isAuthenticated = true as boolean
  const isAuthenticating = false

  // Search state
  const [searchQuery, setSearchQuery] = useState("")
  const [searchType, setSearchType] = useState<"track" | "album" | "artist" | "all">("all")
  const [searchResults, setSearchResults] = useState<TidalSearchResult | null>(null)
  const [isSearching, setIsSearching] = useState(false)

  // Source preference (auto = merge Qobuz+Amazon, otherwise pin to one).
  // Lazy-init from localStorage so the choice survives reloads.
  const [searchSource, setSearchSourceState] = useState<SearchSource>(() => {
    if (typeof window === "undefined") return "auto"
    const saved = window.localStorage.getItem("audora_search_source")
    return saved === "qobuz" || saved === "amazon" ? saved : "auto"
  })
  const setSearchSource = useCallback((s: SearchSource) => {
    setSearchSourceState(s)
    try {
      window.localStorage.setItem("audora_search_source", s)
    } catch {
      // localStorage may be disabled — preference just won't persist.
    }
  }, [])

  // Navigation state
  const [currentView, setCurrentView] = useState<TidalView>("search")
  const [selectedAlbum, setSelectedAlbum] = useState<TidalAlbum | null>(null)
  const [selectedArtist, setSelectedArtist] = useState<TidalDiscographyResult | null>(null)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [navigationStack, setNavigationStack] = useState<TidalView[]>([])

  // Download state
  const [downloads, setDownloads] = useState<Map<string, DownloadState>>(new Map())
  const abortControllers = useRef<Map<string, AbortController>>(new Map())
  const downloadQueue = useRef<TidalTrack[]>([])
  const activeDownloads = useRef(0)

  // Quality preference
  const [quality, setQuality] = useState<TidalQuality>("HI_RES_LOSSLESS")


  // Error state
  const [error, setError] = useState<string | null>(null)

  // Online state
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  )

  // Online/offline detection
  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)
    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [])

  // Login is a no-op for Tidal (no auth needed)
  const login = useCallback(async (): Promise<boolean> => {
    return true
  }, [])

  // Search
  const search = useCallback(async (query?: string) => {
    const q = query ?? searchQuery
    if (!q.trim()) return

    setIsSearching(true)
    setError(null)

    try {
      const data = await TidalService.search(q, searchType, 20, searchSource)
      setSearchResults(data)
      setCurrentView("search")
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("rate_limited:")) {
        const seconds = err.message.split(":")[1]
        setError(`Too many requests. Try again in ${seconds}s`)
        toast({ title: `Rate limited — wait ${seconds}s`, variant: "destructive" })
      } else {
        setError("Search failed. Please try again.")
      }
    } finally {
      setIsSearching(false)
    }
  }, [searchQuery, searchType, searchSource])

  // View album detail
  const viewAlbum = useCallback(async (albumId: string) => {
    setIsLoadingDetail(true)
    setError(null)

    try {
      const data = await TidalService.getAlbum(albumId)

      if (data) {
        setSelectedAlbum(data)
        setNavigationStack((prev) => [...prev, currentView])
        setCurrentView("album")
      } else {
        toast({ title: "Album not found", variant: "destructive" })
      }
    } catch {
      setError("Failed to load album")
    } finally {
      setIsLoadingDetail(false)
    }
  }, [currentView])

  // View artist discography
  const viewArtist = useCallback(async (artistId: string) => {
    setIsLoadingDetail(true)
    setError(null)

    try {
      const data = await TidalService.getDiscography(artistId)

      if (data) {
        setSelectedArtist(data)
        setNavigationStack((prev) => [...prev, currentView])
        setCurrentView("artist")
      } else {
        toast({ title: "Artist not found", variant: "destructive" })
      }
    } catch {
      setError("Failed to load artist")
    } finally {
      setIsLoadingDetail(false)
    }
  }, [currentView])

  // Go back in navigation
  const goBack = useCallback(() => {
    const prev = navigationStack[navigationStack.length - 1] || "search"
    setNavigationStack((stack) => stack.slice(0, -1))
    setCurrentView(prev)
  }, [navigationStack])

  // Check if track is already in library
  const isInLibrary = useCallback(
    (trackId: string) => {
      const tidalId = `tidal-${trackId}`
      return songs.some((s) => s.id === tidalId)
    },
    [songs]
  )

  // Update download state helper
  const updateDownload = useCallback(
    (trackId: string, update: Partial<DownloadState>) => {
      setDownloads((prev) => {
        const next = new Map(prev)
        const existing = next.get(trackId)
        if (existing) {
          next.set(trackId, { ...existing, ...update })
        }
        return next
      })
    },
    []
  )

  // Process download queue
  const processQueue = useCallback(async () => {
    while (
      downloadQueue.current.length > 0 &&
      activeDownloads.current < MAX_CONCURRENT_DOWNLOADS
    ) {
      const track = downloadQueue.current.shift()
      if (!track) break
      activeDownloads.current++
      processDownload(track).finally(() => {
        activeDownloads.current--
        processQueue()
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Core download logic
  const processDownload = useCallback(
    async (track: TidalTrack) => {
      const songId = `tidal-${track.id}`

      updateDownload(track.id, { status: "downloading", progress: 0 })

      const controller = new AbortController()
      abortControllers.current.set(track.id, controller)

      try {
        const streamUrl = TidalService.getStreamUrl(track.id, quality)
        const res = await fetch(streamUrl, { signal: controller.signal })

        if (!res.ok) {
          throw new Error(`Download failed: ${res.status}`)
        }

        const contentLength = Number(res.headers.get("content-length") || 0)
        const reader = res.body?.getReader()
        if (!reader) throw new Error("No response body")

        const chunks: BlobPart[] = []
        let receivedLength = 0

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          chunks.push(value)
          receivedLength += value.length

          const progress = contentLength > 0
            ? Math.round((receivedLength / contentLength) * 100)
            : 0

          updateDownload(track.id, {
            status: "downloading",
            progress,
            bytesDownloaded: receivedLength,
            totalBytes: contentLength,
          })
        }

        if (controller.signal.aborted) return

        updateDownload(track.id, { status: "processing", progress: 100 })

        // Create File object
        const contentType = res.headers.get("content-type") || "audio/flac"
        const isFlac = contentType.includes("flac")
        const ext = isFlac ? "flac" : "m4a"
        const blob = new Blob(chunks, { type: contentType })
        const fileName = `${track.artist} - ${track.title}.${ext}`
        const file = new File([blob], fileName, {
          type: contentType,
          lastModified: Date.now(),
        })

        // Extract metadata from actual file
        let metadata
        try {
          metadata = await MetadataExtractor.extractMetadata(file)
        } catch {
          metadata = {
            title: track.title,
            artist: track.artist,
            album: track.albumTitle,
            genre: track.genre,
            duration: track.duration,
            format: isFlac ? "FLAC" : "AAC",
            fileSize: file.size,
          }
        }

        // Loudness analysis (non-critical)
        try {
          const loudness = await LoudnessAnalyzer.analyze(file)
          metadata.loudnessLUFS = loudness.lufs
          metadata.gainCorrection = loudness.gainCorrection
        } catch {
          // Continue without loudness data
        }

        // Build Song with Tidal metadata overrides
        const song: Song = {
          ...metadata,
          id: songId,
          title: track.title,
          artist: track.artist,
          album: track.albumTitle,
          genre: track.genre || metadata.genre,
          file,
          url: "",
        }

        // Fetch album art and embed metadata + art into FLAC
        let finalBlob: Blob = blob
        let artBlob: Blob | null = null

        if (track.albumCover) {
          try {
            const proxiedArtUrl = `/api/tidal/cover?url=${encodeURIComponent(track.albumCover)}`
            const artRes = await fetch(proxiedArtUrl)
            if (artRes.ok) {
              artBlob = await artRes.blob()
              const artObjUrl = URL.createObjectURL(artBlob)
              song.albumArt = artObjUrl
              await PlaylistStorage.storeAlbumArt(songId, artObjUrl)
              await AlbumArtCache.preloadAlbumArt(songId, artObjUrl)
            }
          } catch {
            // Continue without album art
          }
        }

        // Embed full metadata + album art into FLAC
        if (isFlac) {
          try {
            finalBlob = await embedFlacMetadata(
              blob,
              {
                title: track.title,
                artist: track.artist,
                album: track.albumTitle,
                albumArtist: track.artist,
                date: track.releaseDate ? track.releaseDate.slice(0, 4) : undefined,
                genre: track.genre || undefined,
                trackNumber: track.trackNumber ? String(track.trackNumber) : undefined,
                discNumber: track.discNumber ? String(track.discNumber) : undefined,
                copyright: track.copyright || undefined,
                isrc: track.isrc || undefined,
              },
              artBlob
            )
          } catch {
            // Fall back to raw blob if embedding fails
          }
        }

        // Save file with embedded art to filesystem
        const downloadUrl = URL.createObjectURL(finalBlob)
        const a = document.createElement("a")
        a.href = downloadUrl
        a.download = fileName
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000)

        // Store audio file in IndexedDB (for library) — use art-embedded version
        const fileWithArt = finalBlob !== blob
          ? new File([finalBlob], fileName, { type: contentType, lastModified: Date.now() })
          : file
        song.file = fileWithArt
        // Keep the displayable metadata field in step with the actual File
        // so any consumer reading song.fileSize sees the embedded size.
        song.fileSize = fileWithArt.size
        await PlaylistStorage.storeSongFile(songId, fileWithArt)

        // Add to playlist
        onSongDownloaded(song)

        updateDownload(track.id, { status: "complete" })
        toast({ title: `Downloaded: ${track.title}` })
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          updateDownload(track.id, { status: "cancelled" })
          return
        }

        console.error(`Download error for ${track.title}:`, err)
        updateDownload(track.id, {
          status: "error",
          error: err instanceof Error ? err.message : "Download failed",
        })
        toast({
          title: `Download failed: ${track.title}`,
          variant: "destructive",
        })
      } finally {
        abortControllers.current.delete(track.id)
      }
    },
    [quality, onSongDownloaded, updateDownload]
  )


  // Download a single track
  const downloadTrack = useCallback(
    async (track: TidalTrack) => {
      if (isInLibrary(track.id)) {
        toast({ title: "Already in library" })
        return
      }

      const existing = downloads.get(track.id)
      if (existing && ["queued", "downloading", "processing"].includes(existing.status)) {
        return
      }

      setDownloads((prev) => {
        const next = new Map(prev)
        next.set(track.id, {
          trackId: track.id,
          trackTitle: track.title,
          artist: track.artist,
          status: "queued",
          progress: 0,
          bytesDownloaded: 0,
          totalBytes: 0,
        })
        return next
      })

      downloadQueue.current.push(track)
      processQueue()
    },
    [isInLibrary, downloads, processQueue]
  )

  // Download entire album
  const downloadAlbum = useCallback(
    async (album: TidalAlbum) => {
      const tracks = album.tracks || []
      if (tracks.length === 0) {
        toast({ title: "No tracks to download", variant: "destructive" })
        return
      }

      let queued = 0
      for (const track of tracks) {
        if (!isInLibrary(track.id)) {
          const existing = downloads.get(track.id)
          if (!existing || ["error", "cancelled"].includes(existing.status)) {
            downloadTrack(track)
            queued++
          }
        }
      }

      if (queued === 0) {
        toast({ title: "All tracks already in library or downloading" })
      } else {
        toast({ title: `Queued ${queued} track(s) for download` })
      }
    },
    [isInLibrary, downloads, downloadTrack]
  )

  // Cancel a download
  const cancelDownload = useCallback((trackId: string) => {
    const controller = abortControllers.current.get(trackId)
    if (controller) {
      controller.abort()
    }
    updateDownload(trackId, { status: "cancelled" })
  }, [updateDownload])

  // Clear error
  const clearError = useCallback(() => setError(null), [])

  // Count active downloads
  const activeDownloadCount = Array.from(downloads.values()).filter(
    (d) => d.status === "downloading" || d.status === "queued" || d.status === "processing"
  ).length

  return {
    // Auth (always true for Tidal)
    isAuthenticated,
    isAuthenticating,
    login,

    // Search
    searchQuery,
    setSearchQuery,
    searchType,
    setSearchType,
    searchSource,
    setSearchSource,
    searchResults,
    isSearching,
    search,

    // Navigation
    currentView,
    selectedAlbum,
    selectedArtist,
    isLoadingDetail,
    viewAlbum,
    viewArtist,
    goBack,

    // Downloads
    downloads,
    downloadTrack,
    downloadAlbum,
    cancelDownload,
    activeDownloadCount,

    // Library check
    isInLibrary,

    // Quality
    quality,
    setQuality,

    // Error
    error,
    clearError,

    // Online
    isOnline,
  }
}

export type UseTidalSearchReturn = ReturnType<typeof useTidalSearch>
