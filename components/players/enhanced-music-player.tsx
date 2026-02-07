"use client"

import type React from "react"
import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { toast } from "@/hooks/use-toast"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Settings,
  FolderOpen,
  Plus,
  Mic,
  Upload,
  Share2,
  Folder,
  Youtube,
} from "lucide-react"

import { EnhancedPlaylist, type Song } from "@/components/enhanced-playlist"
import { RefinedEqualizer, type EqualizerBand } from "@/components/refined-equalizer"
import { AlbumArtBackground } from "@/components/album-art-background"
import { AlbumArtDisplay } from "@/components/album-art-display"
import { StorageManager } from "@/lib/storage"
import { PlaylistStorage } from "@/lib/playlist-storage"
import { PlaylistManager } from "@/components/playlist-manager"
import { AlbumArtCache } from "@/lib/album-art-cache"
import { useAlbumArtPreloader } from "@/hooks/use-album-art-preloader"
import { useFolderSync } from "@/hooks/use-folder-sync"
import { usePlaylistManager } from "@/hooks/use-playlist-manager"
import { useAudioEngine } from "@/hooks/use-audio-engine"
import { useEqualizerManager, DEFAULT_EQUALIZER_BANDS } from "@/hooks/use-equalizer-manager"
import { useFileImporter } from "@/hooks/use-file-importer"
import { LyricsDisplay } from "@/components/lyrics-display"
import { AddMusicControls } from "@/components/add-music-control"
import { YouTubeVideoPlayer } from "@/components/youtube-video-player"

export default function EnhancedMusicPlayer() {
  const [currentBitrate, setCurrentBitrate] = useState<number | undefined>()
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)
  const [isRestoringPlaylist, setIsRestoringPlaylist] = useState(false)
  const [activeView, setActiveView] = useState<"player" | "lyrics" | "youtube">("player");
  const videoPlayerRef = useRef<{ resetVideo: () => void }>(null);
  const [forceRefreshTrigger, setForceRefreshTrigger] = useState(0);
  const [videoReadyCalled, setVideoReadyCalled] = useState(false);

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
    shuffledQueue, setCurrentShuffleIndex, setPlayedSongs,
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

  const handleSync = useCallback(() => {
    setVideoReadyCalled(false);
    videoPlayerRef.current?.resetVideo();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
  }, [setIsPlaying])

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

  // Folder sync hook
  const {
    isSyncing,
    syncProgress,
    syncInputRef,
    handleFolderSync,
  } = useFolderSync({
    songs,
    onSongsAdded: (newSongs) => {
      setSongs((prev) => [...prev, ...newSongs])
      if (newSongs.length === 1) {
        setTimeout(() => {
          setForceRefreshTrigger(prev => prev + 1)
        }, 100)
      }
    },
  })

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
                // Prefer artists[0] for artist if artists exists
                const artist = songMetadata.artists && songMetadata.artists.length > 0 ? songMetadata.artists[0] : songMetadata.artist;
                restoredSongs.push({ ...songMetadata, artist, file, url: "", albumArt })
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
                if (current) {
                  setCurrentSong(current)
                  // Initialize the audio element with the current song
                  if (audioRef.current) {
                    const audioUrl = URL.createObjectURL(current.file)
                    const updatedSong = { ...current, url: audioUrl }
                    setCurrentSong(updatedSong)
                    audioRef.current.src = audioUrl
                    audioRef.current.load()
                  }
                }
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
    [currentSong, shuffleMode, shuffledQueue, initializeAudioContext, preloadUpcomingSongs, activeView],
  )
  
  // Remove syncDelayActive and all related logic
  // In handleVideoReady, always play audio after a delay
  const handleVideoReady = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      setTimeout(() => {
        console.log('handleVideoReady: playing audio after video is ready and delay');
        audioRef.current?.play();
      }, 1000); // 1 second delay after video is playing
    }
  }, []);


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
      setIsPlaying(false)
    } else {
      try {
        if (audioContextRef.current?.state === "suspended") {
          await audioContextRef.current.resume()
        }
        playPromiseRef.current = audioRef.current.play();
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

  // Keep skipToNextRef always pointing to the latest skipToNext (bug fix)
  skipToNextRef.current = skipToNext

  const skipToPrevious = () => {
    const prevSong = getPreviousSong()
    if (prevSong) {
      if (shuffleMode) setCurrentShuffleIndex((prev) => Math.max(0, prev - 1))
      selectSong(prevSong, false)
    }
  }

  const handleSeek = (value: number[]) => {
    seek(value[0])
  }

  const handleVideoSeek = (time: number) => {
    seek(time)
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

  // Enhanced media key controls with comprehensive support
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

      // Additional keyboard shortcuts for enhanced control
      if (e.ctrlKey || e.metaKey) {
        switch (e.code) {
          case "ArrowRight":
            e.preventDefault()
            if (songs.length > 0) skipToNext()
            break

          case "ArrowLeft":
            e.preventDefault()
            if (songs.length > 0) skipToPrevious()
            break

          case "ArrowUp":
            e.preventDefault()
            adjustVolume(5)
            break

          case "ArrowDown":
            e.preventDefault()
            adjustVolume(-5)
            break
        }
      }

      // Function keys for additional control
      switch (e.code) {
        case "F7":
          e.preventDefault()
          if (songs.length > 0) skipToPrevious()
          break

        case "F8":
          e.preventDefault()
          if (currentSong) {
            togglePlayPause()
          } else if (songs.length > 0) {
            selectSong(songs[0], false)
          }
          break

        case "F9":
          e.preventDefault()
          if (songs.length > 0) skipToNext()
          break

        case "F10":
          e.preventDefault()
          toggleMute()
          break

        case "F11":
          e.preventDefault()
          adjustVolume(-5)
          break

        case "F12":
          e.preventDefault()
          adjustVolume(5)
          break
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
  }, [currentSong, isPlaying, songs, volume, activeView])


  useEffect(() => {
    if (activeView !== "youtube") {
      setVideoReadyCalled(false);
    }
  }, [activeView]);

  // Network sharing handlers
  const handleNetworkPlaylistUpdate = useCallback((newSongs: any[]) => {
    let playlistChanged = false;
    setSongs((prevSongs) => {
      if (JSON.stringify(prevSongs) !== JSON.stringify(newSongs)) {
        playlistChanged = true;
        return newSongs;
      }
      return prevSongs;
    });
    // Only show toast after state update, not inside setSongs
    if (playlistChanged) {
      toast({
        title: "Playlist Updated",
        description: "The shared playlist has been updated by the host.",
      });
      if (newSongs.length > 0 && (!newSongs[0].file && !newSongs[0].url)) {
        toast({
          title: "Cannot Play Song",
          description: "This song cannot be played because the file is not available on your device.",
          variant: "destructive",
        });
      }
    }
    // Try to set currentSong to the first song if not already set
    if (newSongs.length > 0 && (!currentSong || !newSongs.find((s) => s.id === currentSong.id))) {
      setCurrentSong(newSongs[0]);
    }
    console.log("Network playlist update received:", newSongs)
  }, [currentSong])

  const handleNetworkPlaybackStateUpdate = useCallback(
    (isPlayingFromHost: boolean, currentTimeFromHost: number, currentSongIdFromHost?: string) => {
      // Find the song by ID if provided
      if (currentSongIdFromHost && songs.length > 0) {
        const song = songs.find((s) => s.id === currentSongIdFromHost);
        if (song && (!currentSong || currentSong.id !== song.id)) {
          setCurrentSong(song);
          if (audioRef.current) {
            audioRef.current.src = song.url || "";
            audioRef.current.currentTime = currentTimeFromHost || 0;
          }
        }
      }
      setIsPlaying(isPlayingFromHost);
      setCurrentTime(currentTimeFromHost);
      // Sync audio element
      if (audioRef.current) {
        audioRef.current.currentTime = currentTimeFromHost || 0;
        if (isPlayingFromHost) {
          audioRef.current.play().catch(() => {});
        } else {
          audioRef.current.pause();
        }
      }
      console.log("Network playback state update:", { isPlayingFromHost, currentTimeFromHost, currentSongIdFromHost })
    },
    [songs, currentSong],
  )

  return (
    <div className="min-h-screen max-h-screen overflow-hidden relative">
      <AlbumArtBackground albumArt={currentSong?.albumArt} songId={currentSong?.id} isTransitioning={isTransitioning} />
      <audio ref={audioRef} preload="metadata" className="hidden" />
      <div className="container mx-auto p-6 relative z-10">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            {isRestoringPlaylist && (
              <Badge variant="secondary">
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
            <AddMusicControls
            isLoadingSongs={isLoadingSongs}
            isRestoringPlaylist={isRestoringPlaylist}
            fileInputRef={fileInputRef}
            folderInputRef={folderInputRef}
            syncInputRef={syncInputRef}
            handleFileUpload={handleFileUpload}
            handleFolderUpload={handleFolderUpload}
            handleFolderSync={handleFolderSync}
            isSyncing={isSyncing}
            loadingProgress={loadingProgress}
            />
            
          </div>
        </div>
        <div className="grid lg:grid-cols-2 gap-6 h-[calc(100vh-70px)] overflow-hidden">
          <div className="flex flex-col gap-6 h-full overflow-hidden">
            {activeView === "lyrics" ? (
              <LyricsDisplay
                isVisible={true}
                onClose={() => setActiveView("player")}
                currentSong={currentSong}
                currentTimeMs={currentTime * 1000}
                forceRefresh={forceRefreshTrigger}
              />
            ) : activeView === "youtube" ? (
              <YouTubeVideoPlayer
                ref={videoPlayerRef}
                currentSong={currentSong}
                isPlaying={isPlaying}
                currentTime={currentTime}
                onPlayPause={togglePlayPause}
                onSeek={handleVideoSeek}
                isVisible={true}
                onClose={() => setActiveView("player")}
                className="h-full"
                onSync={handleSync}
                onVideoReady={handleVideoReady}
                forceRefresh={forceRefreshTrigger}
              />
            ) : (
              <>
                <Card className="bg-transparent border-none shadow-none">
                  <CardHeader>
                    <CardTitle>Player Controls</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    
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
                        <Slider value={volume} max={100} step={1} onValueChange={changeVolume} className="w-24" />
                      </div>
                      <Separator orientation="vertical" className="h-8" />
                      <Button
                        variant={showEqualizer ? "default" : "outline"}
                        size="icon"
                        onClick={() => setShowEqualizer(true)}
                      >
                        <Settings className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setActiveView("lyrics")}
                        disabled={!currentSong}
                      >
                        <Mic className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setActiveView("youtube")}
                        disabled={!currentSong}
                      >
                        <Youtube className="w-4 h-4" />
                      </Button>
                    </div>
                    {/* <Dialog open={showNetworkSharing} onOpenChange={setShowNetworkSharing}>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Network Sharing</DialogTitle>
                        </DialogHeader>
                        <NetworkSharingPanel
                      songs={songs}
                      currentSong={currentSong}
                      isPlaying={isPlaying}
                      currentTime={currentTime}
                      onPlaylistUpdate={handleNetworkPlaylistUpdate}
                      onPlaybackStateUpdate={handleNetworkPlaybackStateUpdate}
                      />
                      </DialogContent>
                    </Dialog> */}
                    

                    {/* Keyboard shortcuts info */}
                    <div className="text-xs text-muted-foreground text-center space-y-1">
                      <p>Media keys: Play/Pause • Next/Previous • Volume Up/Down • Mute</p>
                      <p>Shortcuts: Space (play/pause) • F7-F12 (media controls) • Ctrl/Cmd + arrows</p>
                    </div>
                  </CardContent>
                </Card>
                <Dialog open={showEqualizer} onOpenChange={setShowEqualizer}>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Equalizer</DialogTitle>
                    </DialogHeader>
                    <RefinedEqualizer
                    bands={equalizerBands}
                    onBandChange={updateEqualizerBand}
                    onReset={resetEqualizer}/>
                  </DialogContent>
                </Dialog>
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
