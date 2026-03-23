"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { toast } from "@/hooks/use-toast"
import { DabService } from "@/lib/dab-service"
import { MetadataExtractor } from "@/lib/metadata-extractor"
import { LoudnessAnalyzer } from "@/lib/loudness-analyzer"
import { PlaylistStorage } from "@/lib/playlist-storage"
import { AlbumArtCache } from "@/lib/album-art-cache"
import type { Song } from "@/components/enhanced-playlist"
import type {
  DabTrack,
  DabAlbum,
  DabArtist,
  DabSearchResult,
  DabDiscographyResult,
  DownloadState,
} from "@/lib/dab-types"

export interface UseDabSearchOptions {
  songs: Song[]
  onSongDownloaded: (song: Song) => void
}

export type DabView = "search" | "album" | "artist"
export type DabQuality = "27" | "7" | "5"

const MAX_CONCURRENT_DOWNLOADS = 2

export function useDabSearch(options: UseDabSearchOptions) {
  const { songs, onSongDownloaded } = options

  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [isAuthenticating, setIsAuthenticating] = useState(false)

  // Search state
  const [searchQuery, setSearchQuery] = useState("")
  const [searchType, setSearchType] = useState<"track" | "album" | "artist" | "all">("all")
  const [searchResults, setSearchResults] = useState<DabSearchResult | null>(null)
  const [isSearching, setIsSearching] = useState(false)

  // Navigation state
  const [currentView, setCurrentView] = useState<DabView>("search")
  const [selectedAlbum, setSelectedAlbum] = useState<DabAlbum | null>(null)
  const [selectedArtist, setSelectedArtist] = useState<DabDiscographyResult | null>(null)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [navigationStack, setNavigationStack] = useState<DabView[]>([])

  // Download state
  const [downloads, setDownloads] = useState<Map<string, DownloadState>>(new Map())
  const abortControllers = useRef<Map<string, AbortController>>(new Map())
  const downloadQueue = useRef<DabTrack[]>([])
  const activeDownloads = useRef(0)

  // Quality preference
  const [quality, setQuality] = useState<DabQuality>("7")

  // Error state
  const [error, setError] = useState<string | null>(null)

  // Online state
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  )

  // Check auth on mount
  useEffect(() => {
    DabService.checkAuth().then(setIsAuthenticated)
  }, [])

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

  // Login
  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    setIsAuthenticating(true)
    try {
      const success = await DabService.login(email, password)
      setIsAuthenticated(success)
      if (!success) {
        toast({ title: "Invalid credentials", variant: "destructive" })
      }
      return success
    } finally {
      setIsAuthenticating(false)
    }
  }, [])

  // Search
  const search = useCallback(async (query?: string) => {
    const q = query ?? searchQuery
    if (!q.trim()) return

    setIsSearching(true)
    setError(null)

    try {
      const { data, authenticated } = await DabService.search(q, searchType)

      if (!authenticated) {
        setIsAuthenticated(false)
        return
      }

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
  }, [searchQuery, searchType])

  // View album detail
  const viewAlbum = useCallback(async (albumId: string) => {
    setIsLoadingDetail(true)
    setError(null)

    try {
      const { data, authenticated } = await DabService.getAlbum(albumId)

      if (!authenticated) {
        setIsAuthenticated(false)
        return
      }

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
      const { data, authenticated } = await DabService.getDiscography(artistId)

      if (!authenticated) {
        setIsAuthenticated(false)
        return
      }

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
      const dabId = `dab-${trackId}`
      return songs.some((s) => s.id === dabId)
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
      // Process in background (don't await)
      processDownload(track).finally(() => {
        activeDownloads.current--
        processQueue()
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Core download logic
  const processDownload = useCallback(
    async (track: DabTrack) => {
      const songId = `dab-${track.id}`

      updateDownload(track.id, { status: "downloading", progress: 0 })

      const controller = new AbortController()
      abortControllers.current.set(track.id, controller)

      try {
        const streamUrl = DabService.getStreamUrl(track.id, quality)
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

        // Check if cancelled during download
        if (controller.signal.aborted) return

        updateDownload(track.id, { status: "processing", progress: 100 })

        // Create File object
        const blob = new Blob(chunks, { type: "audio/flac" })
        const fileName = `${track.artist} - ${track.title}.flac`
        const file = new File([blob], fileName, {
          type: "audio/flac",
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
            format: "FLAC",
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

        // Build Song with DAB metadata overrides (more reliable)
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

        // Handle album art from DAB
        if (track.albumCover) {
          try {
            const artRes = await fetch(track.albumCover)
            if (artRes.ok) {
              const artBlob = await artRes.blob()
              const artUrl = URL.createObjectURL(artBlob)
              song.albumArt = artUrl
              await PlaylistStorage.storeAlbumArt(songId, artUrl)
              await AlbumArtCache.preloadAlbumArt(songId, artUrl)
            }
          } catch {
            // Use extracted album art if DAB art fails
          }
        }

        // Store audio file in IndexedDB
        await PlaylistStorage.storeSongFile(songId, file)

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
    async (track: DabTrack) => {
      // Duplicate check
      if (isInLibrary(track.id)) {
        toast({ title: "Already in library" })
        return
      }

      // Check if already downloading
      const existing = downloads.get(track.id)
      if (existing && ["queued", "downloading", "processing"].includes(existing.status)) {
        return
      }

      // Add to downloads map
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

      // Add to queue
      downloadQueue.current.push(track)
      processQueue()
    },
    [isInLibrary, downloads, processQueue]
  )

  // Download entire album
  const downloadAlbum = useCallback(
    async (album: DabAlbum) => {
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
    // Auth
    isAuthenticated,
    isAuthenticating,
    login,

    // Search
    searchQuery,
    setSearchQuery,
    searchType,
    setSearchType,
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

export type UseDabSearchReturn = ReturnType<typeof useDabSearch>
