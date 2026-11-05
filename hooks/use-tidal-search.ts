"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { useOnlineStatus } from "@/hooks/use-online-status"
import { toast } from "@/hooks/use-toast"
import { TidalService, type SearchSource } from "@/lib/tidal-service"
import { MetadataExtractor } from "@/lib/metadata-extractor"
import { PlaylistStorage } from "@/lib/playlist-storage"
import { storedArtRef } from "@/lib/album-art-ref"
import { embedFlacMetadata } from "@/lib/flac-art-embedder"
import { hasRoomFor, StorageFullError, formatBytes } from "@/lib/storage-quota"
import type { Song } from "@/lib/song"
import {
  isDownloadActive,
  type TidalTrack,
  type TidalAlbum,
  type TidalSearchResult,
  type TidalDiscographyResult,
  type DownloadState,
} from "@/lib/tidal-types"

export interface UseTidalSearchOptions {
  songs: Song[]
  onSongDownloaded: (song: Song) => void
  /**
   * Called the moment a preview begins loading/playing. The host player uses
   * this to pause its own library audio so the two don't overlap.
   */
  onPreviewStart?: () => void
}

export type TidalView = "search" | "album" | "artist"
export type TidalQuality = "HI_RES_LOSSLESS" | "LOSSLESS" | "HIGH"
export type SearchType = "all" | "track" | "album" | "artist"

/** What the online search last asked for, so a failure can ask again. */
type OnlineRequest = { kind: "search"; query: string } | { kind: "album" | "artist"; id: string }

/** A search or a page that didn't come back, said plainly, and what was asked for. */
export interface OnlineFailure {
  title: string
  detail: string
  request: OnlineRequest
  /** Asking again could help: the request failed, rather than the store answering that it has nothing. */
  retryable: boolean
}

const TRY_AGAIN = "Check the connection and try again."

const MAX_CONCURRENT_DOWNLOADS = 2

export function useTidalSearch(options: UseTidalSearchOptions) {
  const { songs, onSongDownloaded, onPreviewStart } = options
  const onPreviewStartRef = useRef(onPreviewStart)
  useEffect(() => {
    onPreviewStartRef.current = onPreviewStart
  }, [onPreviewStart])

  // Search state
  const [searchQuery, setSearchQuery] = useState("")
  const [searchType, setSearchTypeState] = useState<SearchType>("all")
  const [searchResults, setSearchResults] = useState<TidalSearchResult | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  // Only the latest search may land: an earlier one that answers late is dropped.
  const searchSeq = useRef(0)

  // Source preference (auto = merge Qobuz+Amazon, otherwise pin to one).
  // Lazy-init from localStorage so the choice survives reloads.
  const [searchSource, setSearchSourceState] = useState<SearchSource>(() => {
    if (typeof window === "undefined") return "auto"
    const saved = window.localStorage.getItem("audora_search_source")
    return saved === "qobuz" || saved === "amazon" ? saved : "auto"
  })

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

  // Paste-a-link resolve state (separate from `downloads` because resolution
  // happens before we have a track ID to key the download map by).
  const [isResolvingUrl, setIsResolvingUrl] = useState(false)

  // Quality preference
  const [quality, setQuality] = useState<TidalQuality>("HI_RES_LOSSLESS")

  // Preview-play state. We stream straight from the Lucida endpoint without
  // ever persisting to IndexedDB so the library stays clean.
  const previewAudioRef = useRef<HTMLAudioElement | null>(null)
  const [previewTrackId, setPreviewTrackId] = useState<string | null>(null)
  const [previewIsPlaying, setPreviewIsPlaying] = useState(false)
  const [previewIsLoading, setPreviewIsLoading] = useState(false)

  const stopPreview = useCallback(() => {
    const audio = previewAudioRef.current
    if (audio) {
      audio.pause()
      audio.removeAttribute("src")
      audio.load()
    }
    setPreviewTrackId(null)
    setPreviewIsPlaying(false)
    setPreviewIsLoading(false)
  }, [])

  const togglePreview = useCallback(
    (track: TidalTrack) => {
      if (typeof window === "undefined") return

      // Lazy-init the singleton audio element on first interaction so SSR
      // doesn't touch `Audio`, and so a user gesture is in scope when we
      // call play() — autoplay policy needs that.
      if (!previewAudioRef.current) {
        const a = new Audio()
        a.preload = "none"
        a.addEventListener("playing", () => {
          setPreviewIsPlaying(true)
          setPreviewIsLoading(false)
        })
        a.addEventListener("pause", () => setPreviewIsPlaying(false))
        a.addEventListener("ended", () => {
          setPreviewIsPlaying(false)
          setPreviewTrackId(null)
        })
        a.addEventListener("waiting", () => setPreviewIsLoading(true))
        a.addEventListener("canplay", () => setPreviewIsLoading(false))
        a.addEventListener("error", () => {
          setPreviewIsPlaying(false)
          setPreviewIsLoading(false)
          toast({ title: "Preview failed to load", variant: "destructive" })
        })
        previewAudioRef.current = a
      }

      const audio = previewAudioRef.current

      // Same track → toggle play/pause without re-fetching.
      if (previewTrackId === track.id) {
        if (audio.paused) {
          onPreviewStartRef.current?.()
          audio.play().catch(() => setPreviewIsLoading(false))
        } else {
          audio.pause()
        }
        return
      }

      // Switching tracks — tell the host to pause its library audio first.
      onPreviewStartRef.current?.()
      audio.pause()
      audio.src = TidalService.getStreamUrl(track.id, quality)
      setPreviewTrackId(track.id)
      setPreviewIsLoading(true)
      setPreviewIsPlaying(false)
      audio.play().catch(() => {
        setPreviewIsLoading(false)
        toast({ title: "Preview failed to start", variant: "destructive" })
      })
    },
    [previewTrackId, quality]
  )

  // Cleanup on unmount — kill any in-flight preview stream.
  useEffect(() => {
    return () => {
      const audio = previewAudioRef.current
      if (audio) {
        audio.pause()
        audio.removeAttribute("src")
        audio.load()
      }
    }
  }, [])

  // What went wrong last, until the next request
  const [error, setError] = useState<OnlineFailure | null>(null)

  const isOnline = useOnlineStatus()

  // Search. A type or source given here wins over the chosen one, so a
  // change of either can search at once, before its state has landed.
  const search = useCallback(
    async (query: string = searchQuery, choice: { type?: SearchType; source?: SearchSource } = {}) => {
      const q = query.trim()
      if (!q) return

      const seq = ++searchSeq.current
      setIsSearching(true)
      setError(null)

      const request: OnlineRequest = { kind: "search", query: q }
      try {
        const data = await TidalService.search(q, choice.type ?? searchType, 20, choice.source ?? searchSource)
        if (seq !== searchSeq.current) return
        if (data) {
          setSearchResults(data)
          setNavigationStack([])
          setCurrentView("search")
        } else {
          // The service answers null for a search that failed, and has logged why.
          setError({ title: "Couldn't search online", detail: TRY_AGAIN, request, retryable: true })
        }
      } catch (err) {
        if (seq !== searchSeq.current) return
        if (err instanceof Error && err.message.startsWith("rate_limited:")) {
          const seconds = Number(err.message.split(":")[1]) || 10
          setError({ title: "Too many searches at once", detail: `Try again in ${seconds} seconds.`, request, retryable: true })
        } else {
          console.error("Online search failed:", err)
          setError({ title: "Couldn't search online", detail: TRY_AGAIN, request, retryable: true })
        }
      } finally {
        if (seq === searchSeq.current) setIsSearching(false)
      }
    },
    [searchQuery, searchType, searchSource]
  )

  // Results for one kind can't show another: look again for what is asked.
  const setSearchType = useCallback(
    (type: SearchType) => {
      setSearchTypeState(type)
      if (searchResults && searchResults.searchType !== "all" && searchResults.searchType !== type) {
        void search(searchResults.query, { type })
      }
    },
    [searchResults, search]
  )

  // Results come from where they were asked for: another source looks again.
  const setSearchSource = useCallback(
    (source: SearchSource) => {
      if (source === searchSource) return
      setSearchSourceState(source)
      try {
        window.localStorage.setItem("audora_search_source", source)
      } catch {
        // localStorage may be disabled — preference just won't persist.
      }
      if (searchResults) void search(searchResults.query, { source })
    },
    [searchSource, searchResults, search]
  )

  // View album detail
  const viewAlbum = useCallback(async (albumId: string) => {
    setIsLoadingDetail(true)
    setError(null)

    const request: OnlineRequest = { kind: "album", id: albumId }
    try {
      const data = await TidalService.getAlbum(albumId)
      if (!data) {
        setError({ title: "This album isn't available", detail: "The store didn't send its songs.", request, retryable: false })
        return
      }
      setSelectedAlbum(data)
      setNavigationStack((prev) => [...prev, currentView])
      setCurrentView("album")
    } catch (err) {
      console.error("Album failed to load:", err)
      setError({ title: "Couldn't open the album", detail: TRY_AGAIN, request, retryable: true })
    } finally {
      setIsLoadingDetail(false)
    }
  }, [currentView])

  // View artist discography
  const viewArtist = useCallback(async (artistId: string) => {
    setIsLoadingDetail(true)
    setError(null)

    const request: OnlineRequest = { kind: "artist", id: artistId }
    try {
      const data = await TidalService.getDiscography(artistId)
      if (!data) {
        setError({ title: "This artist isn't available", detail: "The store didn't send their albums.", request, retryable: false })
        return
      }
      setSelectedArtist(data)
      setNavigationStack((prev) => [...prev, currentView])
      setCurrentView("artist")
    } catch (err) {
      console.error("Artist failed to load:", err)
      setError({ title: "Couldn't open the artist", detail: TRY_AGAIN, request, retryable: true })
    } finally {
      setIsLoadingDetail(false)
    }
  }, [currentView])

  // Ask again for what failed, where asking again could help
  const retry = useCallback(() => {
    if (!error?.retryable) return
    const { request } = error
    if (request.kind === "search") void search(request.query)
    else if (request.kind === "album") void viewAlbum(request.id)
    else void viewArtist(request.id)
  }, [error, search, viewAlbum, viewArtist])

  // Where Back goes from the page open now
  const previousView: TidalView = navigationStack[navigationStack.length - 1] ?? "search"

  // Go back in navigation
  const goBack = useCallback(() => {
    setNavigationStack((stack) => stack.slice(0, -1))
    setCurrentView(previousView)
  }, [previousView])

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

      let createdArtUrl: string | null = null

      try {
        const streamUrl = TidalService.getStreamUrl(track.id, quality)
        const res = await fetch(streamUrl, { signal: controller.signal })

        if (!res.ok) {
          throw new Error(`Download failed: ${res.status}`)
        }

        const contentLength = Number(res.headers.get("content-length") || 0)

        // Pre-flight quota check: refuse before streaming body
        if (contentLength > 0) {
          const roomCheck = await hasRoomFor(contentLength)
          if (!roomCheck.ok) {
            controller.abort()
            const shortfall = formatBytes(roomCheck.shortfall)
            updateDownload(track.id, {
              status: "error",
              error: `Storage full: need ${shortfall} more`,
            })
            toast({
              title: `Storage full: need ${shortfall}`,
              variant: "destructive",
            })
            return
          }
        }

        const reader = res.body?.getReader()
        if (!reader) throw new Error("No response body")

        const chunks: BlobPart[] = []
        let receivedLength = 0
        let reportedProgress = -1

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          chunks.push(value)
          receivedLength += value.length

          const progress = contentLength > 0
            ? Math.round((receivedLength / contentLength) * 100)
            : 0
          // One update per network chunk would re-render the player hundreds
          // of times a second; one per percent is all a progress ring shows.
          if (progress === reportedProgress) continue
          reportedProgress = progress

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

        // Loudness analysis intentionally NOT run here: decoding a full
        // hi-res FLAC into RAM per download caused 200MB+ memory spikes.
        // The player analyzes lazily on first play, and only while
        // normalization is enabled.

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
              createdArtUrl = artObjUrl
              await PlaylistStorage.storeAlbumArt(songId, artObjUrl)
              // See the matching note in the DAB path: the URL was only a
              // vehicle for the bytes, and a reference is what the song keeps.
              song.albumArt = storedArtRef(songId)
              URL.revokeObjectURL(artObjUrl)
              createdArtUrl = null
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

        onSongDownloaded(song)

        updateDownload(track.id, { status: "complete" })
        toast({ title: `Downloaded: ${track.title}` })
      } catch (err) {
        // Revoke album art URL if one was created but download failed
        if (createdArtUrl) {
          URL.revokeObjectURL(createdArtUrl)
        }

        if (err instanceof Error && err.name === "AbortError") {
          updateDownload(track.id, { status: "cancelled" })
          return
        }

        if (err instanceof StorageFullError) {
          const shortfall = err.shortfallLabel
          console.error(`Download error for ${track.title}: storage full (need ${shortfall}):`, err)
          updateDownload(track.id, {
            status: "error",
            error: `Storage full: need ${shortfall}`,
          })
          toast({
            title: `Storage full: need ${shortfall}`,
            variant: "destructive",
          })
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


  /**
   * Bring a track that is already on disk back into the playlist.
   *
   * Audio can outlive its playlist entry — metadata cleared, a restore
   * interrupted, an import that never finished. Re-fetching bytes we already
   * hold is pure waste, and refusing outright would strand the user with a
   * track they own but cannot add.
   */
  const restoreStoredTrack = useCallback(
    async (songId: string, track: TidalTrack): Promise<boolean> => {
      const file = await PlaylistStorage.getSongFile(songId)
      if (!file) return false

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
          format: file.type.includes("flac") ? "FLAC" : "AAC",
          fileSize: file.size,
        }
      }

      // Referenced, not resolved: an object URL here would outlive the moment
      // it was needed and pin its blob until the page went away.
      const albumArt = storedArtRef(songId)

      onSongDownloaded({
        ...metadata,
        id: songId,
        title: track.title,
        artist: track.artist,
        album: track.albumTitle,
        genre: track.genre || metadata.genre,
        file,
        fileSize: file.size,
        url: "",
        albumArt,
      })

      return true
    },
    [onSongDownloaded]
  )

  // Download a single track
  const downloadTrack = useCallback(
    async (track: TidalTrack) => {
      if (isInLibrary(track.id)) {
        toast({ title: "Already in library" })
        return
      }

      // React state can disagree with what is actually stored. Recover the
      // existing bytes rather than paying for them twice; fall through to a
      // real download if the record turns out to be unusable.
      const songId = `tidal-${track.id}`
      if (await PlaylistStorage.hasSongFile(songId)) {
        if (await restoreStoredTrack(songId, track)) {
          toast({ title: `Restored from storage: ${track.title}` })
          return
        }
      }

      const existing = downloads.get(track.id)
      if (existing && isDownloadActive(existing)) {
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
    [isInLibrary, downloads, processQueue, restoreStoredTrack]
  )

  // Download from a pasted streaming URL (Amazon / Qobuz / Tidal / Deezer /
  // etc.). Resolves the link to a full track, then hands off to the normal
  // download queue so progress, art-embed, IndexedDB and playlist all behave
  // identically to a search-result download.
  const downloadFromUrl = useCallback(
    async (rawUrl: string): Promise<boolean> => {
      const url = rawUrl.trim()
      if (!url) return false

      if (!/^https?:\/\//i.test(url)) {
        toast({ title: "Enter a valid link (http/https)", variant: "destructive" })
        return false
      }

      setIsResolvingUrl(true)
      try {
        const track = await TidalService.resolveUrl(url)

        if (isInLibrary(track.id)) {
          toast({ title: "Already in library" })
          return false
        }

        downloadTrack(track)
        toast({ title: `Added: ${track.title}` })
        return true
      } catch (err) {
        toast({
          title: err instanceof Error ? err.message : "Could not resolve this link",
          variant: "destructive",
        })
        return false
      } finally {
        setIsResolvingUrl(false)
      }
    },
    [isInLibrary, downloadTrack]
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

  // Count active downloads
  const activeDownloadCount = Array.from(downloads.values()).filter(isDownloadActive).length

  return {
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
    previousView,
    selectedAlbum,
    selectedArtist,
    isLoadingDetail,
    viewAlbum,
    viewArtist,
    goBack,

    // Downloads
    downloads,
    downloadTrack,
    downloadFromUrl,
    isResolvingUrl,
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
    retry,

    // Online
    isOnline,

    // Preview-play
    previewTrackId,
    previewIsPlaying,
    previewIsLoading,
    togglePreview,
    stopPreview,
  }
}

export type UseTidalSearchReturn = ReturnType<typeof useTidalSearch>
