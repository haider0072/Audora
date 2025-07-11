"use client"

import type React from "react"
import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { toast } from "@/hooks/use-toast"

import { MetadataExtractor } from "./utils/metadata-extractor"
import { StorageManager } from "./utils/storage"
import { PlaylistStorage } from "./utils/playlist-storage"
import { AlbumArtCache } from "./utils/album-art-cache"
import { useAlbumArtPreloader } from "./hooks/use-album-art-preloader"

import { MobileHeader } from "./components/mobile-header"
import { MobilePlaylistControls } from "./components/mobile-playlist-controls"
import { MobilePlaylist } from "./components/mobile-playlist"
import { MobilePlayerBar } from "./components/mobile-player-bar"
import { MobileEqualizerSheet } from "./components/mobile-equalizer-sheet"
import { MobileLyricsDisplay } from "./components/mobile-lyrics-display"
import { MobileNetworkSharingSheet } from "./components/mobile-network-sharing-sheet"
import { AlbumArtBackground } from "./components/album-art-background"

interface Song {
  id: string
  title?: string
  artist?: string
  album?: string
  year?: string
  genre?: string
  bitrate?: number
  sampleRate?: number
  duration?: number
  isHiRes?: boolean
  albumArt?: string
  fileSize?: number
  format?: string
  file: File
  url: string
}

interface EqualizerBand {
  frequency: number
  gain: number
  label: string
}

export default function MobileMusicPlayer() {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState([80])
  const [isMuted, setIsMuted] = useState(false)
  const [currentSong, setCurrentSong] = useState<Song | null>(null)
  const [songs, setSongs] = useState<Song[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [shuffleMode, setShuffleMode] = useState(false)
  const [viewMode, setViewMode] = useState<"grouped" | "list">("grouped")
  const [showEqualizer, setShowEqualizer] = useState(false)
  const [shuffledQueue, setShuffledQueue] = useState<Song[]>([])
  const [currentShuffleIndex, setCurrentShuffleIndex] = useState(0)
  const [playedSongs, setPlayedSongs] = useState<Set<string>>(new Set())
  const [isLoadingSongs, setIsLoadingSongs] = useState(false)
  const [loadingProgress, setLoadingProgress] = useState({ current: 0, total: 0 })
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)
  const [isRestoringPlaylist, setIsRestoringPlaylist] = useState(false)

  // New state for lyrics and network sharing
  const [showLyrics, setShowLyrics] = useState(false)
  const [showNetworkSharing, setShowNetworkSharing] = useState(false)

  const audioRef = useRef<HTMLAudioElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const processingRef = useRef(false)

  // Use album art preloader hook
  const { preloadUpcomingSongs } = useAlbumArtPreloader(songs, currentSong?.id, 3)

  // Equalizer bands
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

  // Calculate current time in milliseconds for lyrics sync
  const currentTimeMs = useMemo(() => {
    return Math.round(currentTime * 1000)
  }, [currentTime])

  // Create sorted songs list for list mode
  const sortedSongs = useMemo(() => {
    return [...songs].sort((a, b) => {
      const artistA = (a.artist || "Unknown Artist").toLowerCase()
      const artistB = (b.artist || "Unknown Artist").toLowerCase()

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

  // Get the current playlist based on view mode
  const getCurrentPlaylist = useCallback(() => {
    return viewMode === "list" ? sortedSongs : songs
  }, [viewMode, sortedSongs, songs])

  // Filtered songs for search
  const filteredSongs = useMemo(() => {
    const songsToFilter = viewMode === "list" ? sortedSongs : songs

    if (!searchQuery.trim()) return songsToFilter

    const query = searchQuery.toLowerCase()
    return songsToFilter.filter(
      (song) =>
        song.title?.toLowerCase().includes(query) ||
        song.artist?.toLowerCase().includes(query) ||
        song.album?.toLowerCase().includes(query) ||
        song.genre?.toLowerCase().includes(query),
    )
  }, [songs, sortedSongs, searchQuery, viewMode])

  // Grouped songs for grouped view
  const groupedSongs = useMemo(() => {
    if (viewMode === "list") return {}

    const grouped: { [artist: string]: { [album: string]: Song[] } } = {}

    filteredSongs.forEach((song) => {
      const artist = song.artist || "Unknown Artist"
      const album = song.album || "Unknown Album"

      if (!grouped[artist]) {
        grouped[artist] = {}
      }
      if (!grouped[artist][album]) {
        grouped[artist][album] = []
      }
      grouped[artist][album].push(song)
    })

    // Sort artists and albums alphabetically
    const sortedGrouped: { [artist: string]: { [album: string]: Song[] } } = {}
    Object.keys(grouped)
      .sort()
      .forEach((artist) => {
        sortedGrouped[artist] = {}
        Object.keys(grouped[artist])
          .sort()
          .forEach((album) => {
            sortedGrouped[artist][album] = grouped[artist][album].sort((a, b) => {
              return (a.title || "").localeCompare(b.title || "")
            })
          })
      })

    return sortedGrouped
  }, [filteredSongs, viewMode])

  // Format total duration
  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    return `${minutes}:${seconds.toString().padStart(2, "0")}`
  }

  const getTotalDuration = () => {
    return songs.reduce((total, song) => total + (song.duration || 0), 0)
  }

  // Load saved data and restore playlist on component mount
  useEffect(() => {
    const loadSavedData = async () => {
      try {
        setIsRestoringPlaylist(true)

        // Load general settings
        const savedData = StorageManager.loadData()

        // Restore equalizer settings
        if (savedData.equalizerBands) {
          setEqualizerBands(savedData.equalizerBands)
        }

        // Restore player settings
        if (savedData.playerSettings) {
          setVolume([savedData.playerSettings.volume])
          setShuffleMode(savedData.playerSettings.shuffleMode)
          setViewMode(savedData.playerSettings.viewMode)
          setShowLyrics(savedData.playerSettings.showLyrics)
        }

        // Restore playlist from IndexedDB
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

                const song: Song = {
                  ...songMetadata,
                  file,
                  url: "",
                  albumArt,
                }
                restoredSongs.push(song)
              }
            }

            if (restoredSongs.length > 0) {
              setSongs(restoredSongs)

              toast({
                title: "Playlist restored",
                description: `Successfully restored ${restoredSongs.length} song${
                  restoredSongs.length > 1 ? "s" : ""
                } from your previous session.`,
                duration: 3000,
              })

              if (playlistData.currentSongId) {
                const currentSong = restoredSongs.find((song) => song.id === playlistData.currentSongId)
                if (currentSong) {
                  setCurrentSong(currentSong)
                }
              }
            }
          }
        }

        setIsInitialized(true)
      } catch (error) {
        console.error("Error loading saved data:", error)
        toast({
          title: "Error loading playlist",
          description: "Starting fresh.",
          variant: "destructive",
        })
        setIsInitialized(true)
      } finally {
        setIsRestoringPlaylist(false)
      }
    }

    loadSavedData()
  }, [])

  // Save playlist data whenever songs change
  useEffect(() => {
    if (!isInitialized || isRestoringPlaylist) return

    const savePlaylistData = async () => {
      try {
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
          playerSettings: {
            volume: volume[0],
            shuffleMode,
            viewMode,
            showEqualizer,
            showLyrics,
          },
          currentSongId: currentSong?.id,
        })
      } catch (error) {
        console.error("Error saving playlist data:", error)
      }
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
    showLyrics,
    isInitialized,
    isRestoringPlaylist,
  ])

  // Initialize audio context
  const initializeAudioContext = useCallback(() => {
    if (!audioContextRef.current && audioRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
      sourceNodeRef.current = audioContextRef.current.createMediaElementSource(audioRef.current)
      gainNodeRef.current = audioContextRef.current.createGain()
      analyserRef.current = audioContextRef.current.createAnalyser()

      const filters = equalizerBands.map((band, index) => {
        const filter = audioContextRef.current!.createBiquadFilter()
        if (index === 0) {
          filter.type = "lowshelf"
        } else if (index === equalizerBands.length - 1) {
          filter.type = "highshelf"
        } else {
          filter.type = "peaking"
          filter.Q.value = 1
        }
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

  // File handling functions
  const generateSongId = (file: File): string => {
    return `${file.name}-${file.size}-${file.lastModified}`
  }

  const isDuplicateSong = (file: File): boolean => {
    const id = generateSongId(file)
    return songs.some((song) => song.id === id)
  }

  const addSongsToPlaylist = async (files: File[]) => {
    if (processingRef.current) {
      toast({
        title: "Import in progress",
        description: "Please wait for the current import to complete.",
      })
      return
    }

    const supportedFormats = ["mp3", "flac", "wav", "m4a", "aac"]
    const validFiles = files.filter((file) => {
      const extension = file.name.split(".").pop()?.toLowerCase()
      return extension && supportedFormats.includes(extension)
    })

    if (validFiles.length === 0) {
      toast({
        title: "No supported files",
        description: "Please select MP3, FLAC, WAV, M4A, or AAC files.",
        variant: "destructive",
      })
      return
    }

    processingRef.current = true
    setIsLoadingSongs(true)
    setLoadingProgress({ current: 0, total: validFiles.length })

    const newSongs: Song[] = []
    const duplicates: string[] = []
    const errors: string[] = []
    const BATCH_SIZE = 3 // Smaller batch size for mobile

    try {
      for (let i = 0; i < validFiles.length; i += BATCH_SIZE) {
        const batch = validFiles.slice(i, i + BATCH_SIZE)

        const batchPromises = batch.map(async (file, batchIndex) => {
          const globalIndex = i + batchIndex

          try {
            setLoadingProgress({ current: globalIndex + 1, total: validFiles.length })

            if (isDuplicateSong(file)) {
              duplicates.push(file.name)
              return null
            }

            const metadata = await MetadataExtractor.extractMetadata(file)
            const songId = generateSongId(file)

            const song: Song = {
              ...metadata,
              id: songId,
              file,
              url: "",
            }

            await PlaylistStorage.storeSongFile(songId, file)

            if (metadata.albumArt) {
              try {
                await PlaylistStorage.storeAlbumArt(songId, metadata.albumArt)
                await AlbumArtCache.preloadAlbumArt(songId, metadata.albumArt)
              } catch (error) {
                console.error(`Error storing album art for ${file.name}:`, error)
              }
            }

            return song
          } catch (error) {
            console.error(`Error processing ${file.name}:`, error)
            errors.push(file.name)
            return null
          }
        })

        const batchResults = await Promise.allSettled(batchPromises)

        batchResults.forEach((result) => {
          if (result.status === "fulfilled" && result.value) {
            newSongs.push(result.value)
          }
        })

        if (i + BATCH_SIZE < validFiles.length) {
          await new Promise((resolve) => setTimeout(resolve, 150))
        }
      }

      if (newSongs.length > 0) {
        setSongs((prev) => [...prev, ...newSongs])

        toast({
          title: "Songs added successfully",
          description: `Added ${newSongs.length} song${newSongs.length > 1 ? "s" : ""} to playlist.`,
          duration: 3000,
        })
      }

      if (duplicates.length > 0) {
        toast({
          title: "Duplicates ignored",
          description: `${duplicates.length} duplicate song${duplicates.length > 1 ? "s" : ""} were not added.`,
        })
      }

      if (errors.length > 0) {
        toast({
          title: "Some files failed to import",
          description: `${errors.length} file${errors.length > 1 ? "s" : ""} could not be processed.`,
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error during batch processing:", error)
      toast({
        title: "Import error",
        description: "There was an error importing some files.",
        variant: "destructive",
      })
    } finally {
      setIsLoadingSongs(false)
      setLoadingProgress({ current: 0, total: 0 })
      processingRef.current = false
    }
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    if (files.length > 0) {
      await addSongsToPlaylist(files)
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const handleFolderUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    if (files.length > 0) {
      await addSongsToPlaylist(files)
    }
    if (folderInputRef.current) {
      folderInputRef.current.value = ""
    }
  }

  // Player control functions
  const selectSong = async (song: Song, isAutoAdvance = false) => {
    try {
      // Start transition effect
      setIsTransitioning(true)

      // Clean up previous song URL if different
      if (currentSong?.url && currentSong.url !== song.url) {
        URL.revokeObjectURL(currentSong.url)
      }

      // Preload upcoming songs' album art
      setTimeout(() => {
        preloadUpcomingSongs()
      }, 100)

      setCurrentSong(song)
      setIsPlaying(false) // Reset playing state first

      if (audioRef.current) {
        // Stop current playback
        audioRef.current.pause()
        audioRef.current.currentTime = 0

        // Create a fresh URL for the file
        const audioUrl = URL.createObjectURL(song.file)

        // Update the song with the new URL
        const updatedSong = { ...song, url: audioUrl }
        setCurrentSong(updatedSong)

        // Set the audio source
        audioRef.current.src = audioUrl

        // Wait for the audio to be ready
        await new Promise<void>((resolve, reject) => {
          const audio = audioRef.current!

          const onCanPlay = () => {
            audio.removeEventListener("canplay", onCanPlay)
            audio.removeEventListener("error", onError)
            resolve()
          }

          const onError = (e: Event) => {
            audio.removeEventListener("canplay", onCanPlay)
            audio.removeEventListener("error", onError)
            reject(
              new Error(`Failed to load audio: ${(e.target as HTMLAudioElement)?.error?.message || "Unknown error"}`),
            )
          }

          audio.addEventListener("canplay", onCanPlay)
          audio.addEventListener("error", onError)

          // Load the audio
          audio.load()
        })

        // Initialize audio context if needed
        initializeAudioContext()

        // End transition effect
        setTimeout(() => {
          setIsTransitioning(false)
        }, 500)

        // Auto-play the selected song
        try {
          await audioRef.current.play()
          setIsPlaying(true)
        } catch (error) {
          console.error("Error auto-playing song:", error)
          // Don't throw here, just log the error
          setIsPlaying(false)

          toast({
            title: "Playback error",
            description: "Click play to start the song manually.",
            variant: "default",
          })
        }
      }
    } catch (error) {
      console.error("Error selecting song:", error)
      setIsPlaying(false)
      setIsTransitioning(false)

      toast({
        title: "Error loading song",
        description: "Unable to load the selected audio file. Please try another song.",
        variant: "destructive",
      })
    }
  }

  const removeSong = async (songId: string) => {
    try {
      await PlaylistStorage.removeSongFile(songId)
      await PlaylistStorage.removeAlbumArt(songId)
      AlbumArtCache.removeCachedAlbumArt(songId)

      setSongs((prev) => {
        const newSongs = prev.filter((s) => s.id !== songId)

        if (currentSong?.id === songId) {
          if (audioRef.current) {
            audioRef.current.pause()
            audioRef.current.src = ""
          }
          if (currentSong.url) {
            URL.revokeObjectURL(currentSong.url)
          }
          if (currentSong.albumArt && currentSong.albumArt.startsWith("blob:")) {
            URL.revokeObjectURL(currentSong.albumArt)
          }
          setCurrentSong(null)
          setIsPlaying(false)
        }

        return newSongs
      })

      toast({
        title: "Song removed",
        description: "Song has been removed from storage.",
      })
    } catch (error) {
      console.error("Error removing song:", error)
      toast({
        title: "Error removing song",
        description: "There was an error removing the song.",
        variant: "destructive",
      })
    }
  }

  const togglePlayPause = async () => {
    if (!audioRef.current || !currentSong) return

    if (audioContextRef.current?.state === "suspended") {
      await audioContextRef.current.resume()
    }

    if (isPlaying) {
      audioRef.current.pause()
    } else {
      initializeAudioContext()
      try {
        await audioRef.current.play()
      } catch (error) {
        console.error("Error playing audio:", error)
        toast({
          title: "Playback error",
          description: "Unable to play the selected song.",
          variant: "destructive",
        })
        return
      }
    }
    setIsPlaying(!isPlaying)
  }

  const skipToNext = () => {
    const currentPlaylist = getCurrentPlaylist()
    if (currentPlaylist.length === 0) return

    if (!currentSong) {
      selectSong(currentPlaylist[0], true)
      return
    }

    const currentIndex = currentPlaylist.findIndex((song) => song.id === currentSong.id)
    if (currentIndex === -1) {
      selectSong(currentPlaylist[0], true)
      return
    }

    const nextIndex = (currentIndex + 1) % currentPlaylist.length
    selectSong(currentPlaylist[nextIndex], true)
  }

  const skipToPrevious = () => {
    const currentPlaylist = getCurrentPlaylist()
    if (currentPlaylist.length === 0) return

    if (!currentSong) {
      selectSong(currentPlaylist[currentPlaylist.length - 1], false)
      return
    }

    const currentIndex = currentPlaylist.findIndex((song) => song.id === currentSong.id)
    if (currentIndex === -1) {
      selectSong(currentPlaylist[currentPlaylist.length - 1], false)
      return
    }

    const prevIndex = currentIndex === 0 ? currentPlaylist.length - 1 : currentIndex - 1
    selectSong(currentPlaylist[prevIndex], false)
  }

  const handleSeek = (value: number[]) => {
    if (audioRef.current) {
      audioRef.current.currentTime = value[0]
      setCurrentTime(value[0])
    }
  }

  const handleVolumeChange = (value: number[]) => {
    setVolume(value)
    if (audioRef.current) {
      audioRef.current.volume = value[0] / 100
    }
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = value[0] / 100
    }
  }

  const adjustVolume = (delta: number) => {
    const newVolume = Math.max(0, Math.min(100, volume[0] + delta))
    handleVolumeChange([newVolume])
  }

  const toggleMute = () => {
    setIsMuted(!isMuted)
    if (audioRef.current) {
      audioRef.current.muted = !isMuted
    }
  }

  const updateEqualizerBand = (index: number, gain: number) => {
    const newBands = [...equalizerBands]
    newBands[index].gain = gain
    setEqualizerBands(newBands)

    if (filterNodes[index]) {
      filterNodes[index].gain.value = gain
    }
  }

  const resetEqualizer = () => {
    const resetBands = equalizerBands.map((band) => ({ ...band, gain: 0 }))
    setEqualizerBands(resetBands)
    filterNodes.forEach((filter) => {
      filter.gain.value = 0
    })
  }

  const resetPlaylist = async () => {
    try {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ""
      }

      songs.forEach((song) => {
        if (song.url) {
          URL.revokeObjectURL(song.url)
        }
        if (song.albumArt && song.albumArt.startsWith("blob:")) {
          URL.revokeObjectURL(song.albumArt)
        }
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
    } catch (error) {
      console.error("Error resetting playlist:", error)
      throw error
    }
  }

  // Network sharing handlers
  const handleNetworkPlaylistUpdate = useCallback((newSongs: any[]) => {
    // This would be called when receiving playlist updates from network
    console.log("Network playlist update received:", newSongs)
    toast({
      title: "Playlist Updated",
      description: "The shared playlist has been updated by the host.",
    })
  }, [])

  const handleNetworkPlaybackStateUpdate = useCallback(
    (isPlaying: boolean, currentTime: number, currentSong?: string) => {
      // This would be called when receiving playback state updates from network
      console.log("Network playback state update:", { isPlaying, currentTime, currentSong })
    },
    [],
  )

  // Enhanced media key controls for mobile
  useEffect(() => {
    const handleMediaKeys = (e: KeyboardEvent) => {
      // Prevent default behavior for media keys
      const isMediaKey = [
        "MediaPlayPause",
        "MediaTrackNext",
        "MediaTrackPrevious",
        "MediaStop",
        "AudioVolumeUp",
        "AudioVolumeDown",
        "AudioVolumeMute",
      ].includes(e.code)

      // Also handle space bar when focused on body (not in input fields)
      const isSpaceOnBody =
        e.code === "Space" &&
        (e.target === document.body ||
          (e.target as HTMLElement)?.tagName === "BODY" ||
          !(e.target as HTMLElement)?.matches("input, textarea, [contenteditable]"))

      if (isMediaKey || isSpaceOnBody) {
        e.preventDefault()
        e.stopPropagation()

        switch (e.code) {
          case "MediaPlayPause":
          case "Space":
            if (currentSong) {
              togglePlayPause()
            } else if (songs.length > 0) {
              // If no current song but songs exist, play the first one
              selectSong(songs[0], false)
            }
            break

          case "MediaTrackNext":
            if (songs.length > 0) {
              skipToNext()
            }
            break

          case "MediaTrackPrevious":
            if (songs.length > 0) {
              skipToPrevious()
            }
            break

          case "MediaStop":
            if (audioRef.current && currentSong) {
              audioRef.current.pause()
              audioRef.current.currentTime = 0
              setIsPlaying(false)
              setCurrentTime(0)
            }
            break

          case "AudioVolumeUp":
            adjustVolume(5) // Increase by 5%
            break

          case "AudioVolumeDown":
            adjustVolume(-5) // Decrease by 5%
            break

          case "AudioVolumeMute":
            toggleMute()
            break
        }
      }
    }

    // Add event listener with capture to ensure we catch all events
    document.addEventListener("keydown", handleMediaKeys, { capture: true })

    // Also try to register with the Media Session API for better integration
    if ("mediaSession" in navigator && currentSong) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentSong.title || "Unknown Title",
        artist: currentSong.artist || "Unknown Artist",
        album: currentSong.album || "Unknown Album",
        artwork: currentSong.albumArt ? [{ src: currentSong.albumArt, sizes: "256x256", type: "image/jpeg" }] : [],
      })

      navigator.mediaSession.setActionHandler("play", () => {
        if (!isPlaying && currentSong) togglePlayPause()
      })

      navigator.mediaSession.setActionHandler("pause", () => {
        if (isPlaying) togglePlayPause()
      })

      navigator.mediaSession.setActionHandler("nexttrack", () => {
        if (songs.length > 0) skipToNext()
      })

      navigator.mediaSession.setActionHandler("previoustrack", () => {
        if (songs.length > 0) skipToPrevious()
      })

      navigator.mediaSession.setActionHandler("stop", () => {
        if (audioRef.current && currentSong) {
          audioRef.current.pause()
          audioRef.current.currentTime = 0
          setIsPlaying(false)
          setCurrentTime(0)
        }
      })

      // Update playback state
      navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused"
    }

    return () => {
      document.removeEventListener("keydown", handleMediaKeys, { capture: true })

      // Clear media session handlers
      if ("mediaSession" in navigator) {
        navigator.mediaSession.setActionHandler("play", null)
        navigator.mediaSession.setActionHandler("pause", null)
        navigator.mediaSession.setActionHandler("nexttrack", null)
        navigator.mediaSession.setActionHandler("previoustrack", null)
        navigator.mediaSession.setActionHandler("stop", null)
      }
    }
  }, [currentSong, isPlaying, songs, volume])

  // Audio event handlers
  useEffect(() => {
    const audio = audioRef.current
    if (audio) {
      const handleTimeUpdate = () => {
        setCurrentTime(audio.currentTime)
      }

      const handleLoadedMetadata = () => {
        setDuration(audio.duration)
        if (currentSong && !currentSong.duration) {
          setCurrentSong((prev) =>
            prev
              ? {
                  ...prev,
                  duration: audio.duration,
                }
              : null,
          )
        }
      }

      const handleEnded = () => {
        setIsPlaying(false)
        setTimeout(() => {
          skipToNext()
        }, 300)
      }

      audio.addEventListener("timeupdate", handleTimeUpdate)
      audio.addEventListener("loadedmetadata", handleLoadedMetadata)
      audio.addEventListener("ended", handleEnded)

      return () => {
        audio.removeEventListener("timeupdate", handleTimeUpdate)
        audio.removeEventListener("loadedmetadata", handleLoadedMetadata)
        audio.removeEventListener("ended", handleEnded)
      }
    }
  }, [])

  // Cleanup URLs on unmount
  useEffect(() => {
    return () => {
      songs.forEach((song) => {
        if (song.url) {
          URL.revokeObjectURL(song.url)
        }
      })
      AlbumArtCache.clearCache()
    }
  }, [])

  return (
    <div className="min-h-screen relative bg-background">
      {/* Dynamic Background */}
      <AlbumArtBackground albumArt={currentSong?.albumArt} songId={currentSong?.id} isTransitioning={isTransitioning} />

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".flac,.mp3,.wav,.m4a,.aac,audio/flac,audio/mpeg,audio/wav,audio/mp4,audio/aac"
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

      {/* Audio Element */}
      <audio ref={audioRef} preload="metadata" />

      {/* Mobile Layout */}
      <div className="flex flex-col h-screen relative z-10">
        {/* Header */}
        <MobileHeader
          onFileUpload={() => fileInputRef.current?.click()}
          onFolderUpload={() => folderInputRef.current?.click()}
          isLoading={isLoadingSongs || isRestoringPlaylist}
        />

        {/* Playlist Controls */}
        <MobilePlaylistControls
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          shuffleMode={shuffleMode}
          onShuffleToggle={() => setShuffleMode(!shuffleMode)}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onPlaylistReset={resetPlaylist}
          songCount={songs.length}
          totalDuration={formatTime(getTotalDuration())}
        />

        {/* Playlist */}
        <MobilePlaylist
          songs={songs}
          filteredSongs={filteredSongs}
          groupedSongs={groupedSongs}
          currentSong={currentSong}
          viewMode={viewMode}
          onSongSelect={(song) => selectSong(song, false)}
          onSongRemove={removeSong}
          isLoading={isLoadingSongs || isRestoringPlaylist}
          loadingProgress={loadingProgress}
        />

        {/* Player Bar */}
        <MobilePlayerBar
          currentSong={currentSong}
          isPlaying={isPlaying}
          currentTime={currentTime}
          duration={duration}
          onPlayPause={togglePlayPause}
          onSkipPrevious={skipToPrevious}
          onSkipNext={skipToNext}
          onSeek={handleSeek}
          onSettingsClick={() => setShowEqualizer(true)}
          onLyricsClick={() => setShowLyrics(true)}
          onNetworkSharingClick={() => setShowNetworkSharing(true)}
          isTransitioning={isTransitioning}
        />

        {/* Equalizer Sheet */}
        <MobileEqualizerSheet
          isOpen={showEqualizer}
          onOpenChange={setShowEqualizer}
          bands={equalizerBands}
          onBandChange={updateEqualizerBand}
          onReset={resetEqualizer}
          volume={volume}
          onVolumeChange={handleVolumeChange}
          isMuted={isMuted}
          onToggleMute={toggleMute}
        />

        {/* Lyrics Sheet */}
        <MobileLyricsDisplay
          isOpen={showLyrics}
          onOpenChange={setShowLyrics}
          currentSong={currentSong}
          currentTimeMs={currentTimeMs}
          isPlaying={isPlaying}
        />

        {/* Network Sharing Sheet */}
        <MobileNetworkSharingSheet
          isOpen={showNetworkSharing}
          onOpenChange={setShowNetworkSharing}
          songs={songs.map((song) => ({
            id: song.id,
            title: song.title,
            artist: song.artist,
            album: song.album,
            duration: song.duration,
            format: song.format,
            isHiRes: song.isHiRes,
          }))}
          currentSong={currentSong}
          isPlaying={isPlaying}
          currentTime={currentTime}
          onPlaylistUpdate={handleNetworkPlaylistUpdate}
          onPlaybackStateUpdate={handleNetworkPlaybackStateUpdate}
        />
      </div>
    </div>
  )
}

export type { Song }
