"use client"

import type React from "react"
import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { toast } from "@/hooks/use-toast"

import { AlbumArtCache } from "@/lib/album-art-cache"
import { useAlbumArtPreloader } from "@/hooks/use-album-art-preloader"
import { usePlaylistManager } from "@/hooks/use-playlist-manager"
import { useAudioEngine } from "@/hooks/use-audio-engine"
import { useEqualizerManager, DEFAULT_EQUALIZER_BANDS } from "@/hooks/use-equalizer-manager"
import { useFileImporter } from "@/hooks/use-file-importer"
import { usePlaylistPersistence, useAutoSave } from "@/hooks/use-playlist-persistence"
import type { Song } from "@/components/enhanced-playlist"

import { MobileHeader } from "@/components/mobile-header"
import { MobilePlaylistControls } from "@/components/mobile-playlist-controls"
import { MobilePlaylist } from "@/components/mobile-playlist"
import { MobilePlayerBar } from "@/components/mobile-player-bar"
import { MobileEqualizerSheet } from "@/components/mobile-equalizer-sheet"
import { MobileLyricsDisplay } from "@/components/mobile-lyrics-display"
import { AlbumArtBackground } from "@/components/album-art-background"
import { MobileYouTubeVideoPlayer } from "@/components/mobile-youtube-video-player"

import type { EqualizerBand } from "@/components/refined-equalizer"

export default function MobileMusicPlayer() {
  const [searchQuery, setSearchQuery] = useState("")
  const [isTransitioning, setIsTransitioning] = useState(false)

  const audioRef = useRef<HTMLAudioElement>(null)
  const skipToNextRef = useRef<() => void>(() => {})

  // Stable onEnded callback using ref — THIS FIXES THE STALE CLOSURE BUG
  const handleEnded = useCallback(() => {
    skipToNextRef.current()
  }, [])

  const [equalizerBands, setEqualizerBands] = useState<EqualizerBand[]>(DEFAULT_EQUALIZER_BANDS)

  const {
    isPlaying, setIsPlaying, currentTime, setCurrentTime,
    duration, setDuration, volume, setVolume, isMuted,
    filterNodes, audioContextRef, playPromiseRef, gainNodeRef,
    initializeAudioContext, play, pause, seek,
    changeVolume, toggleMute, adjustVolume,
  } = useAudioEngine({
    audioRef,
    equalizerBands,
    onEnded: handleEnded,
  })

  const {
    songs, setSongs, currentSong, setCurrentSong,
    shuffleMode, setShuffleMode, viewMode, setViewMode,
    sortedSongs, getNextSong, getPreviousSong, toggleShuffle,
    removeSong, resetPlaylist,
  } = usePlaylistManager({
    onCurrentSongRemoved: () => {
      pause()
      if (audioRef.current) audioRef.current.src = ""
    },
    onPlaylistReset: () => {
      pause()
      if (audioRef.current) audioRef.current.src = ""
      setCurrentTime(0)
      setDuration(0)
    },
  })

  const {
    showEqualizer, setShowEqualizer,
    updateBand: updateEqualizerBand, resetEqualizer,
  } = useEqualizerManager({ equalizerBands, setEqualizerBands, filterNodes })

  // New state for lyrics and network sharing
  const [showLyrics, setShowLyrics] = useState(false)
  const [showNetworkSharing, setShowNetworkSharing] = useState(false)
  const [forceRefreshTrigger, setForceRefreshTrigger] = useState(0)
  const [showVideo, setShowVideo] = useState(false)

  // Use album art preloader hook
  const { preloadUpcomingSongs } = useAlbumArtPreloader(songs, currentSong?.id, 3)

  const {
    isLoadingSongs, loadingProgress, fileInputRef, folderInputRef,
    handleFileUpload, handleFolderUpload,
  } = useFileImporter({
    songs,
    onSongsAdded: (newSongs) => {
      setSongs((prev) => [...prev, ...newSongs])
      if (newSongs.length === 1) {
        setTimeout(() => setForceRefreshTrigger(prev => prev + 1), 100)
      }
    },
  })

  const { isInitialized, isRestoringPlaylist, restorePlaylist, savePlaylist } = usePlaylistPersistence()

  // Calculate current time in milliseconds for lyrics sync
  const currentTimeMs = useMemo(() => {
    return Math.round(currentTime * 1000)
  }, [currentTime])

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

  // Restore playlist on mount
  useEffect(() => {
    restorePlaylist().then(({ songs: restoredSongs, currentSong: current, settings }) => {
      if (settings.equalizerBands) setEqualizerBands(settings.equalizerBands)
      if (settings.volume !== undefined) setVolume([settings.volume])
      if (settings.shuffleMode !== undefined) setShuffleMode(settings.shuffleMode)
      if (settings.viewMode) setViewMode(settings.viewMode)
      if (settings.showEqualizer !== undefined) setShowEqualizer(settings.showEqualizer)

      if (restoredSongs.length > 0) {
        setSongs(restoredSongs)
        if (current) {
          setCurrentSong(current)
          if (audioRef.current) {
            const audioUrl = URL.createObjectURL(current.file)
            setCurrentSong({ ...current, url: audioUrl })
            audioRef.current.src = audioUrl
            audioRef.current.load()
          }
        }
      }
    })
  }, [])

  // Auto-save playlist data
  const persistenceData = useMemo(() => ({
    songs, currentSongId: currentSong?.id, equalizerBands,
    volume: volume[0], shuffleMode, viewMode, showEqualizer,
  }), [songs, currentSong?.id, equalizerBands, volume, shuffleMode, viewMode, showEqualizer])

  useAutoSave(persistenceData, isInitialized, isRestoringPlaylist, savePlaylist)



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


  const togglePlayPause = async () => {
    if (!audioRef.current || !currentSong) return

    if (audioContextRef.current?.state === "suspended") {
      await audioContextRef.current.resume()
    }

    // Check if audio element is properly initialized
    if (!audioRef.current.src && currentSong.file) {
      console.log("Audio element not initialized, setting up current song...")
      const audioUrl = URL.createObjectURL(currentSong.file)
      const updatedSong = { ...currentSong, url: audioUrl }
      setCurrentSong(updatedSong)
      audioRef.current.src = audioUrl
      audioRef.current.load()
      
      // Wait for the audio to be ready before playing
      await new Promise<void>((resolve, reject) => {
        const onCanPlay = () => {
          audioRef.current?.removeEventListener("canplay", onCanPlay)
          audioRef.current?.removeEventListener("error", onError)
          resolve()
        }
        const onError = (e: Event) => {
          audioRef.current?.removeEventListener("canplay", onCanPlay)
          audioRef.current?.removeEventListener("error", onError)
          reject(new Error(`Failed to load audio: ${(e.target as HTMLAudioElement)?.error?.message || "Unknown error"}`))
        }
        audioRef.current?.addEventListener("canplay", onCanPlay)
        audioRef.current?.addEventListener("error", onError)
      })
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
    const nextSong = getNextSong()
    if (nextSong) selectSong(nextSong, true)
  }

  // Keep skipToNextRef always pointing to the latest skipToNext (bug fix)
  skipToNextRef.current = skipToNext

  const skipToPrevious = () => {
    const prevSong = getPreviousSong()
    if (prevSong) selectSong(prevSong, false)
  }

  const handleSeek = (value: number[]) => {
    seek(value[0])
  }

  const handleVideoSeek = (time: number) => {
    seek(time)
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
        {...({ webkitdirectory: "" } as any)}
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
          onShuffleToggle={toggleShuffle}
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
          onVideoClick={() => setShowVideo(true)}
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
          onVolumeChange={changeVolume}
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
          forceRefresh={forceRefreshTrigger}
        />

        {/* Video Player Sheet */}
        <MobileYouTubeVideoPlayer
          currentSong={currentSong}
          isPlaying={isPlaying}
          currentTime={currentTime}
          onPlayPause={togglePlayPause}
          onSeek={handleVideoSeek}
          isOpen={showVideo}
          onOpenChange={setShowVideo}
          forceRefresh={forceRefreshTrigger}
        />

        {/* Network Sharing Sheet */}
        {/* <MobileNetworkSharingSheet
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
        /> */}
      </div>
    </div>
  )
}

