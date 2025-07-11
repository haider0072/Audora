"use client"

import type React from "react"
import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { toast } from "@/hooks/use-toast"
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Settings,
  Music,
  FolderOpen,
  Plus,
  Mic,
} from "lucide-react"

import { MetadataExtractor } from "./utils/metadata-extractor"
import { EnhancedPlaylist, type Song } from "./components/enhanced-playlist"
import { RefinedEqualizer, type EqualizerBand } from "./components/refined-equalizer"
import { AlbumArtBackground } from "./components/album-art-background"
import { AlbumArtDisplay } from "./components/album-art-display"
import { StorageManager } from "./utils/storage"
import { PlaylistStorage } from "./utils/playlist-storage"
import { PlaylistManager } from "./components/playlist-manager"
import { AlbumArtCache } from "./utils/album-art-cache"
import { useAlbumArtPreloader } from "./hooks/use-album-art-preloader"
import { LyricsDisplay } from "./components/lyrics-display"

export default function EnhancedMusicPlayer() {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState([80])
  const [isMuted, setIsMuted] = useState(false)
  const [currentSong, setCurrentSong] = useState<Song | null>(null)
  const [songs, setSongs] = useState<Song[]>([])
  const [showEqualizer, setShowEqualizer] = useState(false)
  const [currentBitrate, setCurrentBitrate] = useState<number | undefined>()
  const [shuffleMode, setShuffleMode] = useState(false)
  const [viewMode, setViewMode] = useState<"grouped" | "list">("grouped")
  const [shuffledQueue, setShuffledQueue] = useState<Song[]>([])
  const [currentShuffleIndex, setCurrentShuffleIndex] = useState(0)
  const [playedSongs, setPlayedSongs] = useState<Set<string>>(new Set())
  const [isLoadingSongs, setIsLoadingSongs] = useState(false)
  const [loadingProgress, setLoadingProgress] = useState({ current: 0, total: 0 })
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)
  const [isRestoringPlaylist, setIsRestoringPlaylist] = useState(false)
  const [showLyrics, setShowLyrics] = useState(false)

  const audioRef = useRef<HTMLAudioElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const processingRef = useRef(false)
  const playPromiseRef = useRef<Promise<void> | null>(null)

  const { preloadUpcomingSongs } = useAlbumArtPreloader(songs, currentSong?.id, 3)

  const [equalizerBands, setEqualizerBands] = useState<EqualizerBand[]>([
    { frequency: 32, gain: 0, label: "32Hz" },
    { frequency: 64, gain: 0, label: "64Hz" },
    { frequency: 125, gain: 0, label: "125Hz" },
    { frequency: 250, gain: 0, label: "250Hz" },
    { frequency: 500, gain: 0, label: "500Hz" },
    { frequency: 1000, gain: 0, label: "1kHz" },
    { frequency: 2000, gain: 0, label: "2kHz" },
    { frequency: 4000, gain: 0, label: "4kHz" },
    { frequency: 8000, gain: 0, label: "8kHz" },
    { frequency: 16000, gain: 0, label: "16kHz" },
  ])

  const [filterNodes, setFilterNodes] = useState<BiquadFilterNode[]>([])

  useEffect(() => {
    const loadSavedData = async () => {
      try {
        setIsRestoringPlaylist(true)
        const savedData = StorageManager.loadData()
        if (savedData.equalizerBands) {
          setEqualizerBands(savedData.equalizerBands)
        }
        if (savedData.playerSettings) {
          setVolume([savedData.playerSettings.volume])
          setShuffleMode(savedData.playerSettings.shuffleMode)
          setViewMode(savedData.playerSettings.viewMode)
          setShowEqualizer(savedData.playerSettings.showEqualizer)
        }

        const playlistData = PlaylistStorage.loadPlaylistMetadata()
        if (playlistData && playlistData.songs.length > 0) {
          const validSongs = await PlaylistStorage.validateStoredFiles(playlistData.songs)
          if (validSongs.length > 0) {
            const restoredSongs: Song[] = []
            for (const songMetadata of validSongs) {
              const file = await PlaylistStorage.getSongFile(songMetadata.id)
              if (file) {
                let albumArt = songMetadata.albumArt
                if (songMetadata.albumArt && songMetadata.albumArt.startsWith("blob:")) {
                  const restoredAlbumArt = await PlaylistStorage.getAlbumArt(songMetadata.id)
                  if (restoredAlbumArt) {
                    albumArt = restoredAlbumArt
                    await AlbumArtCache.preloadAlbumArt(songMetadata.id, restoredAlbumArt)
                  } else {
                    albumArt = undefined
                  }
                }
                restoredSongs.push({ ...songMetadata, file, url: "", albumArt })
              }
            }
            if (restoredSongs.length > 0) {
              setSongs(restoredSongs)
              toast({
                title: "Playlist restored",
                description: `Restored ${restoredSongs.length} song(s).`,
              })
              if (playlistData.currentSongId) {
                const current = restoredSongs.find((s) => s.id === playlistData.currentSongId)
                if (current) setCurrentSong(current)
              }
            }
          }
        }
        setIsInitialized(true)
      } catch (error) {
        console.error("Error loading saved data:", error)
        setIsInitialized(true)
      } finally {
        setIsRestoringPlaylist(false)
      }
    }
    loadSavedData()
  }, [])

  useEffect(() => {
    if (!isInitialized || isRestoringPlaylist) return
    const savePlaylistData = () => {
      const serializableSongs = songs.map((song) => ({
        id: song.id,
        title: song.title,
        artist: song.artist,
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
        fileName: song.file.name,
        fileLastModified: song.file.lastModified,
        fileType: song.file.type,
      }))
      PlaylistStorage.savePlaylistMetadata(serializableSongs, currentSong?.id)
      StorageManager.saveData({
        songs: serializableSongs,
        equalizerBands,
        playerSettings: { volume: volume[0], shuffleMode, viewMode, showEqualizer },
        currentSongId: currentSong?.id,
      })
    }
    const timeoutId = setTimeout(savePlaylistData, 1000)
    return () => clearTimeout(timeoutId)
  }, [
    songs,
    currentSong?.id,
    equalizerBands,
    volume,
    shuffleMode,
    viewMode,
    showEqualizer,
    isInitialized,
    isRestoringPlaylist,
  ])

  const sortedSongs = useMemo(() => {
    return [...songs].sort((a, b) => {
      const artistA = (a.artist || "Unknown Artist").toLowerCase()
      const artistB = (b.artist || "Unknown Artist").toLowerCase()
      if (artistA === artistB) {
        const albumA = (a.album || "Unknown Album").toLowerCase()
        const albumB = (b.album || "Unknown Album").toLowerCase()
        if (albumA === albumB) return (a.title || "").localeCompare(b.title || "")
        return albumA.localeCompare(albumB)
      }
      return artistA.localeCompare(artistB)
    })
  }, [songs])

  const getCurrentPlaylist = useCallback(
    () => (viewMode === "list" ? sortedSongs : songs),
    [viewMode, sortedSongs, songs],
  )

  const generateShuffledQueue = useCallback((songList: Song[], currentSongId?: string) => {
    if (songList.length === 0) return []
    let availableSongs = [...songList]
    if (currentSongId) availableSongs = availableSongs.filter((song) => song.id !== currentSongId)
    for (let i = availableSongs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[availableSongs[i], availableSongs[j]] = [availableSongs[j], availableSongs[i]]
    }
    return availableSongs
  }, [])

  const toggleShuffle = () => {
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
  }

  const resetPlaylist = async () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ""
    }
    songs.forEach((song) => {
      if (song.url) URL.revokeObjectURL(song.url)
      if (song.albumArt && song.albumArt.startsWith("blob:")) URL.revokeObjectURL(song.albumArt)
    })
    AlbumArtCache.clearCache()
    setSongs([])
    setCurrentSong(null)
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    setShuffledQueue([])
    setCurrentShuffleIndex(0)
    setPlayedSongs(new Set())
    await PlaylistStorage.clearPlaylist()
  }

  const getNextSong = useCallback((): Song | null => {
    const currentPlaylist = getCurrentPlaylist()
    if (currentPlaylist.length === 0) return null
    if (shuffleMode) {
      if (currentShuffleIndex < shuffledQueue.length) return shuffledQueue[currentShuffleIndex]
      const newQueue = generateShuffledQueue(currentPlaylist)
      setShuffledQueue(newQueue)
      setCurrentShuffleIndex(0)
      setPlayedSongs(new Set())
      return newQueue.length > 0 ? newQueue[0] : null
    }
    if (!currentSong) return currentPlaylist[0] || null
    const currentIndex = currentPlaylist.findIndex((s) => s.id === currentSong.id)
    if (currentIndex === -1) return currentPlaylist[0] || null
    return currentPlaylist[(currentIndex + 1) % currentPlaylist.length]
  }, [getCurrentPlaylist, shuffleMode, shuffledQueue, currentShuffleIndex, currentSong, generateShuffledQueue])

  const getPreviousSong = useCallback((): Song | null => {
    const currentPlaylist = getCurrentPlaylist()
    if (currentPlaylist.length === 0) return null
    if (shuffleMode) {
      if (currentShuffleIndex > 1) return shuffledQueue[currentShuffleIndex - 2]
      return null
    }
    if (!currentSong) return currentPlaylist[currentPlaylist.length - 1] || null
    const currentIndex = currentPlaylist.findIndex((s) => s.id === currentSong.id)
    if (currentIndex === -1) return currentPlaylist[currentPlaylist.length - 1] || null
    return currentPlaylist[currentIndex === 0 ? currentPlaylist.length - 1 : currentIndex - 1]
  }, [getCurrentPlaylist, shuffleMode, shuffledQueue, currentShuffleIndex, currentSong])

  const initializeAudioContext = useCallback(() => {
    if (!audioContextRef.current && audioRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
      sourceNodeRef.current = audioContextRef.current.createMediaElementSource(audioRef.current)
      gainNodeRef.current = audioContextRef.current.createGain()
      analyserRef.current = audioContextRef.current.createAnalyser()
      const filters = equalizerBands.map((band, index) => {
        const filter = audioContextRef.current!.createBiquadFilter()
        filter.type = index === 0 ? "lowshelf" : index === equalizerBands.length - 1 ? "highshelf" : "peaking"
        if (filter.type === "peaking") filter.Q.value = 1
        filter.frequency.value = band.frequency
        filter.gain.value = band.gain
        return filter
      })
      setFilterNodes(filters)
      let currentNode = sourceNodeRef.current
      filters.forEach((filter) => {
        currentNode.connect(filter)
        currentNode = filter
      })
      currentNode.connect(gainNodeRef.current!)
      gainNodeRef.current!.connect(analyserRef.current!)
      analyserRef.current!.connect(audioContextRef.current.destination)
    }
  }, [equalizerBands])

  const addSongsToPlaylist = async (files: File[]) => {
    if (processingRef.current) return toast({ title: "Import in progress" })
    const supportedFormats = ["mp3", "flac", "wav", "m4a", "aac"]
    const validFiles = files.filter((f) => supportedFormats.includes(f.name.split(".").pop()?.toLowerCase() || ""))
    if (validFiles.length === 0) return toast({ title: "No supported files", variant: "destructive" })

    processingRef.current = true
    setIsLoadingSongs(true)
    setLoadingProgress({ current: 0, total: validFiles.length })

    const newSongs: Song[] = [],
      duplicates: string[] = [],
      errors: string[] = []
    const generateSongId = (file: File) => `${file.name}-${file.size}-${file.lastModified}`
    const existingIds = new Set(songs.map((s) => s.id))

    for (let i = 0; i < validFiles.length; i += 5) {
      const batch = validFiles.slice(i, i + 5)
      const batchPromises = batch.map(async (file, batchIndex) => {
        const globalIndex = i + batchIndex
        setLoadingProgress({ current: globalIndex + 1, total: validFiles.length })
        const songId = generateSongId(file)
        if (existingIds.has(songId)) {
          duplicates.push(file.name)
          return null
        }
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
          errors.push(file.name)
          return null
        }
      })
      const batchResults = await Promise.all(batchPromises)
      newSongs.push(...batchResults.filter((s): s is Song => s !== null))
    }

    if (newSongs.length > 0) {
      setSongs((prev) => [...prev, ...newSongs])
      toast({ title: `Added ${newSongs.length} new song(s).` })
    }
    if (duplicates.length > 0) toast({ title: `Ignored ${duplicates.length} duplicate(s).` })
    if (errors.length > 0) toast({ title: `Failed to process ${errors.length} file(s).`, variant: "destructive" })

    setIsLoadingSongs(false)
    processingRef.current = false
  }

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    if (files.length > 0) addSongsToPlaylist(files)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleFolderUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    if (files.length > 0) addSongsToPlaylist(files)
    if (folderInputRef.current) folderInputRef.current.value = ""
  }

  const selectSong = useCallback(
    async (song: Song, isAutoAdvance = false) => {
      if (playPromiseRef.current) {
        try {
          await playPromiseRef.current
        } catch (e) {
          if ((e as DOMException).name !== "AbortError") {
            console.error("Play promise error:", e)
          }
        }
      }

      setIsTransitioning(true)
      if (currentSong?.url) URL.revokeObjectURL(currentSong.url)
      preloadUpcomingSongs()
      setCurrentSong(song)
      setCurrentBitrate(song.bitrate)
      setIsPlaying(false)

      if (shuffleMode) {
        if (isAutoAdvance) {
          setCurrentShuffleIndex((prev) => prev + 1)
        } else {
          const songIndex = shuffledQueue.findIndex((s) => s.id === song.id)
          if (songIndex !== -1) setCurrentShuffleIndex(songIndex)
        }
        setPlayedSongs((prev) => new Set(prev).add(song.id))
      }

      if (audioRef.current) {
        audioRef.current.pause()
        const audioUrl = URL.createObjectURL(song.file)
        const updatedSong = { ...song, url: audioUrl }
        setCurrentSong(updatedSong)
        audioRef.current.src = audioUrl
        audioRef.current.load()

        try {
          await new Promise<void>((resolve, reject) => {
            const onCanPlay = () => {
              audioRef.current?.removeEventListener("canplay", onCanPlay)
              resolve()
            }
            audioRef.current?.addEventListener("canplay", onCanPlay)
            audioRef.current?.addEventListener("error", reject)
          })

          initializeAudioContext()
          playPromiseRef.current = audioRef.current.play()
          await playPromiseRef.current
          setIsPlaying(true)
        } catch (error) {
          if ((error as DOMException).name !== "AbortError") {
            console.error("Error playing song:", error)
            toast({ title: "Playback Error", variant: "destructive" })
          }
          setIsPlaying(false)
        } finally {
          setIsTransitioning(false)
        }
      }
    },
    [currentSong, shuffleMode, shuffledQueue, initializeAudioContext, preloadUpcomingSongs],
  )

  const removeSong = async (songId: string) => {
    await PlaylistStorage.removeSongFile(songId)
    await PlaylistStorage.removeAlbumArt(songId)
    AlbumArtCache.removeCachedAlbumArt(songId)
    setSongs((prev) => {
      const newSongs = prev.filter((s) => s.id !== songId)
      if (shuffleMode) setShuffledQueue((prevQ) => prevQ.filter((s) => s.id !== songId))
      if (currentSong?.id === songId) {
        if (audioRef.current) {
          audioRef.current.pause()
          audioRef.current.src = ""
        }
        if (currentSong.url) URL.revokeObjectURL(currentSong.url)
        setCurrentSong(null)
        setIsPlaying(false)
      }
      return newSongs
    })
    toast({ title: "Song removed" })
  }

  const togglePlayPause = async () => {
    if (!audioRef.current || !currentSong) return

    if (playPromiseRef.current) {
      try {
        await playPromiseRef.current
      } catch (e) {
        if ((e as DOMException).name !== "AbortError") {
          console.error("Play promise error on toggle:", e)
        }
      }
    }

    if (isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
    } else {
      try {
        if (audioContextRef.current?.state === "suspended") {
          await audioContextRef.current.resume()
        }
        playPromiseRef.current = audioRef.current.play()
        await playPromiseRef.current
        setIsPlaying(true)
      } catch (error) {
        if ((error as DOMException).name !== "AbortError") {
          console.error("Error playing audio:", error)
          toast({ title: "Playback Error", variant: "destructive" })
        }
        setIsPlaying(false)
      }
    }
  }

  const skipToNext = () => {
    const nextSong = getNextSong()
    if (nextSong) selectSong(nextSong, true)
  }

  const skipToPrevious = () => {
    const prevSong = getPreviousSong()
    if (prevSong) {
      if (shuffleMode) setCurrentShuffleIndex((prev) => Math.max(0, prev - 1))
      selectSong(prevSong, false)
    }
  }

  const handleSeek = (value: number[]) => {
    if (audioRef.current) audioRef.current.currentTime = value[0]
  }

  const handleVolumeChange = (value: number[]) => {
    setVolume(value)
    if (audioRef.current) audioRef.current.volume = value[0] / 100
    if (gainNodeRef.current) gainNodeRef.current.gain.value = value[0] / 100
  }

  const toggleMute = () => {
    setIsMuted(!isMuted)
    if (audioRef.current) audioRef.current.muted = !isMuted
  }

  const updateEqualizerBand = (index: number, gain: number) => {
    const newBands = [...equalizerBands]
    newBands[index].gain = gain
    setEqualizerBands(newBands)
    if (filterNodes[index]) filterNodes[index].gain.value = gain
  }

  const resetEqualizer = () => {
    const resetBands = equalizerBands.map((band) => ({ ...band, gain: 0 }))
    setEqualizerBands(resetBands)
    filterNodes.forEach((filter) => (filter.gain.value = 0))
  }

  const formatTime = (time: number) => {
    if (isNaN(time)) return "0:00"
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    return `${minutes}:${seconds.toString().padStart(2, "0")}`
  }

  const formatBitrate = (bitrate?: number) => {
    if (!bitrate) return "Unknown"
    return bitrate >= 1000 ? `${(bitrate / 1000).toFixed(1)}M` : `${Math.round(bitrate)}k`
  }

  const currentTimeMs = useMemo(() => Math.round(currentTime * 1000), [currentTime])

  // Media key controls
  useEffect(() => {
    const handleMediaKeys = (e: KeyboardEvent) => {
      if (e.code === "MediaPlayPause" || (e.code === "Space" && e.target === document.body)) {
        e.preventDefault()
        togglePlayPause()
      } else if (e.code === "MediaTrackNext") {
        e.preventDefault()
        skipToNext()
      } else if (e.code === "MediaTrackPrevious") {
        e.preventDefault()
        skipToPrevious()
      }
    }

    document.addEventListener("keydown", handleMediaKeys)
    return () => document.removeEventListener("keydown", handleMediaKeys)
  }, [currentSong, isPlaying])

  useEffect(() => {
    const audio = audioRef.current
    if (audio) {
      const onTimeUpdate = () => setCurrentTime(audio.currentTime)
      const onLoadedMetadata = () => setDuration(audio.duration)
      const onEnded = () => skipToNext()
      audio.addEventListener("timeupdate", onTimeUpdate)
      audio.addEventListener("loadedmetadata", onLoadedMetadata)
      audio.addEventListener("ended", onEnded)
      return () => {
        audio.removeEventListener("timeupdate", onTimeUpdate)
        audio.removeEventListener("loadedmetadata", onLoadedMetadata)
        audio.removeEventListener("ended", onEnded)
      }
    }
  }, [currentSong])

  return (
    <div className="min-h-screen max-h-screen overflow-hidden relative">
      <AlbumArtBackground albumArt={currentSong?.albumArt} songId={currentSong?.id} isTransitioning={isTransitioning} />
      <audio ref={audioRef} preload="metadata" className="hidden" />
      <div className="container mx-auto p-6 relative z-10">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Music className="w-8 h-8" />
            <h1 className="text-3xl font-bold">Enhanced Music Player</h1>
            {isRestoringPlaylist && (
              <Badge variant="secondary" className="ml-2">
                Restoring...
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-4">
            <PlaylistManager
              songCount={songs.length}
              songs={songs.map((s) => ({ id: s.id, title: s.title, artist: s.artist, albumArt: s.albumArt }))}
              onPlaylistReset={resetPlaylist}
            />
          </div>
        </div>
        <div className="grid lg:grid-cols-2 gap-6 h-[calc(100vh-120px)] overflow-hidden">
          <div className="flex flex-col gap-6 h-full overflow-hidden">
            {showLyrics ? (
              <LyricsDisplay
                isVisible={showLyrics}
                onClose={() => setShowLyrics(false)}
                currentSong={currentSong}
                currentTimeMs={currentTimeMs}
              />
            ) : (
              <>
                <Card className="bg-transparent border-none shadow-none">
                  <CardHeader>
                    <CardTitle>Player Controls</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center gap-4">
                        <Button
                          onClick={() => fileInputRef.current?.click()}
                          variant="outline"
                          className="gap-2"
                          disabled={isLoadingSongs || isRestoringPlaylist}
                        >
                          <Plus className="w-4 h-4" />
                          Add Songs
                        </Button>
                        <Button
                          onClick={() => folderInputRef.current?.click()}
                          variant="outline"
                          className="gap-2"
                          disabled={isLoadingSongs || isRestoringPlaylist}
                        >
                          <FolderOpen className="w-4 h-4" />
                          Add Folder
                        </Button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".flac,.mp3,.wav,.m4a,.aac"
                          multiple
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                        <input
                          ref={folderInputRef}
                          type="file"
                          webkitdirectory=""
                          multiple
                          onChange={handleFolderUpload}
                          className="hidden"
                        />
                      </div>
                      {(isLoadingSongs || isRestoringPlaylist) && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span>{isRestoringPlaylist ? "Restoring playlist..." : "Processing songs..."}</span>
                            {!isRestoringPlaylist && (
                              <span>
                                {loadingProgress.current} / {loadingProgress.total}
                              </span>
                            )}
                          </div>
                          <div className="w-full bg-muted rounded-full h-2">
                            <div
                              className={`bg-primary h-2 rounded-full transition-all duration-300 ${isRestoringPlaylist ? "animate-pulse" : ""}`}
                              style={{
                                width: isRestoringPlaylist
                                  ? "100%"
                                  : `${(loadingProgress.current / loadingProgress.total) * 100}%`,
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                    {currentSong && (
                      <div className="space-y-6">
                        <div className="flex gap-6">
                          <AlbumArtDisplay
                            songId={currentSong.id}
                            albumArt={currentSong.albumArt}
                            title={`${currentSong.title} album art`}
                            isTransitioning={isTransitioning}
                            className="shadow-2xl shadow-black/30 flex-shrink-0 w-64 h-64"
                          />
                          <div
                            className={`flex-1 space-y-3 transition-all duration-500 ease-out ${isTransitioning ? "translate-x-4 opacity-70" : "translate-x-0 opacity-100"}`}
                          >
                            <div className="space-y-2">
                              <h2 className="text-2xl font-bold line-clamp-2 leading-tight">{currentSong.title}</h2>
                              {currentSong.artist && (
                                <p className="text-xl text-muted-foreground font-medium">{currentSong.artist}</p>
                              )}
                              {currentSong.album && (
                                <p className="text-lg text-muted-foreground">{currentSong.album}</p>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {currentSong.isHiRes && (
                                <Badge
                                  variant="secondary"
                                  className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100 shadow-sm"
                                >
                                  Hi-Res Audio
                                </Badge>
                              )}
                              <Badge variant="outline" className="shadow-sm">
                                {currentSong.format}
                              </Badge>
                              {currentBitrate && (
                                <Badge variant="outline" className="shadow-sm">
                                  {formatBitrate(currentBitrate)}bps
                                </Badge>
                              )}
                              {currentSong.sampleRate && (
                                <Badge variant="outline" className="shadow-sm">
                                  {(currentSong.sampleRate / 1000).toFixed(1)}kHz
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    {duration > 0 && (
                      <div className="space-y-2">
                        <Slider
                          value={[currentTime]}
                          max={duration}
                          step={1}
                          onValueChange={handleSeek}
                          className="w-full"
                        />
                        <div className="flex justify-between text-sm text-muted-foreground">
                          <span>{formatTime(currentTime)}</span>
                          <span>{formatTime(duration)}</span>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center justify-center gap-4">
                      <Button variant="outline" size="icon" onClick={skipToPrevious} disabled={songs.length === 0}>
                        <SkipBack className="w-4 h-4" />
                      </Button>
                      <Button
                        onClick={togglePlayPause}
                        size="icon"
                        className="w-14 h-14 shadow-lg"
                        disabled={!currentSong}
                      >
                        {isPlaying ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7" />}
                      </Button>
                      <Button variant="outline" size="icon" onClick={skipToNext} disabled={songs.length === 0}>
                        <SkipForward className="w-4 h-4" />
                      </Button>
                      <Separator orientation="vertical" className="h-8" />
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon" onClick={toggleMute}>
                          {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                        </Button>
                        <Slider value={volume} max={100} step={1} onValueChange={handleVolumeChange} className="w-24" />
                      </div>
                      <Separator orientation="vertical" className="h-8" />
                      <Button
                        variant={showEqualizer ? "default" : "outline"}
                        size="icon"
                        onClick={() => setShowEqualizer(!showEqualizer)}
                      >
                        <Settings className="w-4 h-4" />
                      </Button>
                      <Button
                        variant={showLyrics ? "default" : "outline"}
                        size="icon"
                        onClick={() => setShowLyrics(!showLyrics)}
                        disabled={!currentSong}
                      >
                        <Mic className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
                {showEqualizer && (
                  <RefinedEqualizer
                    bands={equalizerBands}
                    onBandChange={updateEqualizerBand}
                    onReset={resetEqualizer}
                  />
                )}
              </>
            )}
          </div>
          <div className="h-full bg-transparent overflow-hidden">
            <EnhancedPlaylist
              songs={songs}
              currentSong={currentSong}
              onSongSelect={(song) => selectSong(song, false)}
              onSongRemove={removeSong}
              onPlaylistReset={resetPlaylist}
              shuffleMode={shuffleMode}
              onShuffleToggle={toggleShuffle}
              isLoading={isLoadingSongs || isRestoringPlaylist}
              loadingProgress={loadingProgress}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              sortedSongs={sortedSongs}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
