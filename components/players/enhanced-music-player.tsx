"use client"

import { useState, useRef, useEffect, useCallback, useMemo, lazy, Suspense } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { toast } from "@/hooks/use-toast"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  Play, Pause, SkipBack, SkipForward,
  Volume2, VolumeX, Settings, Mic, Youtube, Sparkles, Shuffle, Maximize2, User,
} from "lucide-react"

import Image from "next/image"
import { EnhancedPlaylist, type Song } from "@/components/enhanced-playlist"
import { RefinedEqualizer, type EqualizerBand } from "@/components/refined-equalizer"
import { AlbumArtBackground } from "@/components/album-art-background"
import { AlbumArtDisplay } from "@/components/album-art-display"
import { PlaylistManager } from "@/components/playlist-manager"
import { useAlbumArtPreloader } from "@/hooks/use-album-art-preloader"
import { useFolderSync } from "@/hooks/use-folder-sync"
import { usePlaylistManager } from "@/hooks/use-playlist-manager"
import { useAudioEngine } from "@/hooks/use-audio-engine"
import { useEqualizerManager, DEFAULT_EQUALIZER_BANDS } from "@/hooks/use-equalizer-manager"
import { useFileImporter } from "@/hooks/use-file-importer"
import { usePlaylistPersistence, useAutoSave } from "@/hooks/use-playlist-persistence"
import { useMediaControls } from "@/hooks/use-media-controls"
import { useTidalSearch } from "@/hooks/use-tidal-search"
import { OnlineSearchSidebar } from "@/components/dab/online-search-sidebar"
import { AlbumArtCache } from "@/lib/album-art-cache"
import { LoudnessAnalyzer } from "@/lib/loudness-analyzer"
import { formatTime, waitForCanPlay } from "@/lib/utils"
import { AddMusicControls } from "@/components/add-music-control"
import { FullscreenPlayer } from "@/components/fullscreen-player"

const LyricsDisplay = lazy(() =>
  import("@/components/lyrics-display").then(mod => ({ default: mod.LyricsDisplay }))
)
const YouTubeVideoPlayer = lazy(() =>
  import("@/components/youtube-video-player").then(mod => ({ default: mod.YouTubeVideoPlayer }))
)
const SongInsightsDisplay = lazy(() =>
  import("@/components/song-insights-display").then(mod => ({ default: mod.SongInsightsDisplay }))
)
const ArtistInfoDisplay = lazy(() =>
  import("@/components/artist-info-display").then(mod => ({ default: mod.ArtistInfoDisplay }))
)

export default function EnhancedMusicPlayer() {
  const [currentBitrate, setCurrentBitrate] = useState<number | undefined>()
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [activeView, setActiveView] = useState<"player" | "lyrics" | "youtube" | "insights" | "artist">("player");
  const videoPlayerRef = useRef<{ resetVideo: () => void }>(null);
  const [forceRefreshTrigger, setForceRefreshTrigger] = useState(0);
  const [videoReadyCalled, setVideoReadyCalled] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [albumArtSourceRect, setAlbumArtSourceRect] = useState<DOMRect | null>(null);
  const [sidebarMode, setSidebarMode] = useState<"library" | "online">("library");

  const albumArtRef = useRef<HTMLDivElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const secondaryAudioRef = useRef<HTMLAudioElement>(null)
  const skipToNextRef = useRef<() => void>(() => {})
  const selectSongAbortRef = useRef<AbortController | null>(null)
  const pendingPreloadRef = useRef<Song | null>(null)

  // Stable onEnded callback using ref — THIS FIXES THE STALE CLOSURE BUG
  const handleEnded = useCallback(() => {
    skipToNextRef.current()
  }, [])

  // Stable onNearEnd callback using ref (needs access to getNextSong)
  const nearEndHandlerRef = useRef<() => void>(() => {})
  const handleNearEnd = useCallback(() => {
    nearEndHandlerRef.current()
  }, [])

  const [equalizerBands, setEqualizerBands] = useState<EqualizerBand[]>(DEFAULT_EQUALIZER_BANDS)

  const {
    isPlaying, setIsPlaying, currentTime, setCurrentTime,
    duration, setDuration, volume, setVolume, isMuted,
    filterNodes, audioContextRef, playPromiseRef, gainNodeRef,
    initializeAudioContext, play, pause, seek,
    changeVolume, toggleMute, adjustVolume, applyNormalization,
    preloadNextSong, swapToPreloaded, resetGaplessState, isPreloaded,
  } = useAudioEngine({
    audioRef,
    secondaryAudioRef,
    equalizerBands,
    onEnded: handleEnded,
    onNearEnd: handleNearEnd,
  })

  const {
    songs, setSongs, currentSong, setCurrentSong,
    shuffleMode, setShuffleMode, viewMode, setViewMode,
    sortedSongs, getNextSong, getPreviousSong, notifySongSelected,
    toggleShuffle, removeSong, resetPlaylist,
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

  const { isInitialized, isRestoringPlaylist, restorePlaylist, savePlaylist } = usePlaylistPersistence()

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
    volume: volume[0], shuffleMode, viewMode, showEqualizer, crossfadeDuration: 0,
  }), [songs, currentSong?.id, equalizerBands, volume, shuffleMode, viewMode, showEqualizer])

  useAutoSave(persistenceData, isInitialized, isRestoringPlaylist, savePlaylist)

  const selectSong = useCallback(
    async (song: Song, isAutoAdvance = false) => {
      // Abort any previous in-flight selectSong call
      selectSongAbortRef.current?.abort()
      const abort = new AbortController()
      selectSongAbortRef.current = abort

      if (playPromiseRef.current) {
        try {
          await playPromiseRef.current
        } catch (e) {
          if ((e as DOMException).name !== "AbortError") {
            console.error("Play promise error:", e)
          }
        }
      }

      if (abort.signal.aborted) return

      // Gapless fast path: if this song was preloaded, do instant swap
      if (isAutoAdvance && isPreloaded && pendingPreloadRef.current?.id === song.id) {
        applyNormalization(song.gainCorrection ?? 0)
        const swapped = swapToPreloaded()
        if (swapped) {
          if (currentSong?.url) URL.revokeObjectURL(currentSong.url)
          setCurrentSong(song)
          setCurrentBitrate(song.bitrate)
          setIsPlaying(true)
          notifySongSelected(song, isAutoAdvance)
          preloadUpcomingSongs()
          pendingPreloadRef.current = null
          return
        }
      }

      pendingPreloadRef.current = null

      // Lazy loudness analysis — runs in background on first play (deferred from import
      // to avoid OfflineAudioContext throttling when tab is in background)
      if (song.loudnessLUFS == null && song.file) {
        LoudnessAnalyzer.analyze(song.file).then((loudness) => {
          setSongs((prev) =>
            prev.map((s) =>
              s.id === song.id
                ? { ...s, loudnessLUFS: loudness.lufs, gainCorrection: loudness.gainCorrection }
                : s
            )
          )
          applyNormalization(loudness.gainCorrection)
        }).catch(() => { /* non-critical */ })
      }

      // Reset gapless state so we load into primary audio element
      resetGaplessState()

      setIsTransitioning(true)
      if (currentSong?.url) URL.revokeObjectURL(currentSong.url)
      preloadUpcomingSongs()
      setCurrentSong(song)
      setCurrentBitrate(song.bitrate)
      setIsPlaying(false)
      notifySongSelected(song, isAutoAdvance)
      applyNormalization(song.gainCorrection ?? 0)

      if (audioRef.current) {
        audioRef.current.pause()
        const audioUrl = URL.createObjectURL(song.file)
        const updatedSong = { ...song, url: audioUrl }
        setCurrentSong(updatedSong)
        audioRef.current.src = audioUrl
        audioRef.current.load()

        try {
          await waitForCanPlay(audioRef.current)

          if (abort.signal.aborted) return

          initializeAudioContext()
          playPromiseRef.current = audioRef.current.play()
          await playPromiseRef.current
          if (!abort.signal.aborted) setIsPlaying(true)
        } catch (error) {
          if (!abort.signal.aborted) {
            if ((error as DOMException).name !== "AbortError") {
              console.error("Error playing song:", error)
              toast({ title: "Playback Error", variant: "destructive" })
            }
            setIsPlaying(false)
          }
        } finally {
          if (!abort.signal.aborted) setIsTransitioning(false)
        }
      }
    },
    [currentSong, notifySongSelected, initializeAudioContext, preloadUpcomingSongs, isPreloaded, swapToPreloaded, resetGaplessState, applyNormalization],
  )
  
  // Remove syncDelayActive and all related logic
  // In handleVideoReady, always play audio after a delay
  const handleVideoReady = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      setTimeout(() => {
        // Play audio after video is ready
        audioRef.current?.play();
      }, 1000); // 1 second delay after video is playing
    }
  }, []);

  const togglePlayPause = async () => {
    if (!currentSong) return

    if (playPromiseRef.current) {
      try {
        await playPromiseRef.current
      } catch (e) {
        if ((e as DOMException).name !== "AbortError") {
          console.error("Play promise error on toggle:", e)
        }
      }
    }

    // Check if audio element is properly initialized (e.g. after restore)
    if (audioRef.current && !audioRef.current.src && currentSong.file) {
      resetGaplessState() // ensure we're on primary
      const audioUrl = URL.createObjectURL(currentSong.file)
      const updatedSong = { ...currentSong, url: audioUrl }
      setCurrentSong(updatedSong)
      audioRef.current.src = audioUrl
      audioRef.current.load()
      await waitForCanPlay(audioRef.current)
    }

    if (isPlaying) {
      pause()
    } else {
      try {
        initializeAudioContext()
        await play()
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

  // Keep skipToNextRef always pointing to the latest skipToNext (bug fix for stale closures)
  // eslint-disable-next-line react-hooks/refs -- intentional: ref updated during render to avoid stale closure in audio ended callback
  skipToNextRef.current = skipToNext

  // Keep nearEndHandlerRef pointing to the latest handler (preloads next song for gapless)
  nearEndHandlerRef.current = () => {
    const nextSong = getNextSong()
    if (nextSong) {
      pendingPreloadRef.current = nextSong
      preloadNextSong(nextSong.file)
    }
  }

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

  const formatBitrate = (bitrate?: number) => {
    if (!bitrate) return "Unknown"
    return bitrate >= 1000 ? `${(bitrate / 1000).toFixed(1)}M` : `${Math.round(bitrate)}k`
  }

  const currentTimeMs = useMemo(() => Math.round(currentTime * 1000), [currentTime])

  useMediaControls({
    currentSong, isPlaying, songs, audioRef,
    onPlayPause: togglePlayPause,
    onSkipNext: skipToNext,
    onSkipPrevious: skipToPrevious,
    onStop: () => {
      if (audioRef.current && currentSong) {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
        setIsPlaying(false)
        setCurrentTime(0)
      }
    },
    onVolumeAdjust: adjustVolume,
    onToggleMute: toggleMute,
    onPlayFirstSong: () => { if (songs.length > 0) selectSong(songs[0], false) },
    enableExtendedShortcuts: true,
  })

  // Tidal online search & download
  const tidalSearch = useTidalSearch({
    songs,
    onSongDownloaded: (newSong) => {
      setSongs((prev) => [...prev, newSong])
    },
  })

  // Cleanup Object URLs and caches on unmount
  useEffect(() => {
    return () => {
      songs.forEach((song) => {
        if (song.url) URL.revokeObjectURL(song.url)
      })
      AlbumArtCache.clearCache()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- intentional: cleanup only on unmount

  useEffect(() => {
    if (activeView !== "youtube") {
      setVideoReadyCalled(false);
    }
  }, [activeView]);

  const handleOpenFullscreen = useCallback(() => {
    if (albumArtRef.current) {
      setAlbumArtSourceRect(albumArtRef.current.getBoundingClientRect())
    }
    setIsFullscreen(true)
  }, [])

  return (
    <div className="min-h-screen max-h-screen overflow-hidden relative">
      <AlbumArtBackground albumArt={currentSong?.albumArt} songId={currentSong?.id} isTransitioning={isTransitioning} />
      <audio ref={audioRef} preload="metadata" className="hidden" />
      <audio ref={secondaryAudioRef} preload="metadata" className="hidden" />
      {/* Screen reader announcements for song changes */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {currentSong && `Now playing: ${currentSong.title}${currentSong.artist ? ` by ${currentSong.artist}` : ""}`}
      </div>
      <div className="container mx-auto py-6 relative z-10">
        <div className="flex items-center justify-between mb-6 px-6">
          <div className="flex items-center gap-3">
            <Image src="/icon-192x192.png" alt="Audora" width={32} height={32} className="rounded-lg" />
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
              <Suspense fallback={null}>
                <LyricsDisplay
                  isVisible={true}
                  onClose={() => setActiveView("player")}
                  currentSong={currentSong}
                  currentTimeMs={currentTime * 1000}
                  forceRefresh={forceRefreshTrigger}
                />
              </Suspense>
            ) : activeView === "youtube" ? (
              <Suspense fallback={null}>
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
              </Suspense>
            ) : activeView === "insights" ? (
              <Suspense fallback={null}>
                <SongInsightsDisplay
                  isVisible={true}
                  onClose={() => setActiveView("player")}
                  currentSong={currentSong}
                />
              </Suspense>
            ) : activeView === "artist" ? (
              <Suspense fallback={null}>
                <ArtistInfoDisplay
                  isVisible={true}
                  onClose={() => setActiveView("player")}
                  currentSong={currentSong}
                />
              </Suspense>
            ) : (
              <>
                <Card className="bg-transparent border-none shadow-none">
                  <CardContent className="space-y-6 pt-6">
                    
                    {currentSong && (
                      <div className="space-y-6">
                        <div className="flex gap-6">
                          <div ref={albumArtRef} className="flex-shrink-0">
                            <AlbumArtDisplay
                              songId={currentSong.id}
                              albumArt={currentSong.albumArt}
                              title={`${currentSong.title} album art`}
                              isTransitioning={isTransitioning}
                              className="shadow-2xl shadow-black/30 w-64 h-64"
                            />
                          </div>
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
                          aria-label="Seek position"
                        />
                        <div className="flex justify-between text-sm text-muted-foreground">
                          <span>{formatTime(currentTime)}</span>
                          <span>{formatTime(duration)}</span>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center justify-center gap-4">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={skipToPrevious} disabled={songs.length === 0} aria-label="Previous track">
                        <SkipBack className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        onClick={togglePlayPause}
                        size="icon"
                        className="w-11 h-11 shadow-lg"
                        disabled={!currentSong}
                        aria-label={isPlaying ? "Pause" : "Play"}
                      >
                        {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={skipToNext} disabled={songs.length === 0} aria-label="Next track">
                        <SkipForward className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant={shuffleMode ? "default" : "ghost"}
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={toggleShuffle}
                        aria-label={shuffleMode ? "Disable shuffle" : "Enable shuffle"}
                      >
                        <Shuffle className="w-3.5 h-3.5" />
                      </Button>
                      <div className="flex-1" />
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setShowEqualizer(true)} aria-label="Equalizer settings">
                          <Settings className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setActiveView("lyrics")} disabled={!currentSong} aria-label="Show lyrics">
                          <Mic className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setActiveView("youtube")} disabled={!currentSong} aria-label="Show video">
                          <Youtube className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setActiveView("insights")} disabled={!currentSong} aria-label="Song insights">
                          <Sparkles className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setActiveView("artist")} disabled={!currentSong} aria-label="Artist info">
                          <User className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      <Separator orientation="vertical" className="h-6" />
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={toggleMute} aria-label={isMuted ? "Unmute" : "Mute"}>
                          {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                        </Button>
                        <Slider value={volume} max={100} step={1} onValueChange={changeVolume} className="w-24 [&_[role=slider]]:h-3.5 [&_[role=slider]]:w-3.5 [&_[role=slider]]:opacity-0 [&_[role=slider]]:transition-all [&_[role=slider]]:duration-200 [&_[role=slider]]:ease-out hover:[&_[role=slider]]:opacity-100 [&>span:first-child]:h-1" aria-label="Volume" />
                      </div>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={handleOpenFullscreen} disabled={!currentSong} aria-label="Fullscreen">
                        <Maximize2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
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
              isLoading={isLoadingSongs || isRestoringPlaylist}
              loadingProgress={loadingProgress}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              sortedSongs={sortedSongs}
              sidebarMode={sidebarMode}
              onSidebarModeChange={setSidebarMode}
              activeDownloadCount={tidalSearch.activeDownloadCount}
              onlineSearchContent={<OnlineSearchSidebar dab={tidalSearch} />}
            />
          </div>
        </div>
      </div>
      <FullscreenPlayer
        isOpen={isFullscreen}
        onClose={() => setIsFullscreen(false)}
        currentSong={currentSong}
        isPlaying={isPlaying}
        currentTime={currentTime}
        duration={duration}
        volume={volume}
        isMuted={isMuted}
        shuffleMode={shuffleMode}
        isTransitioning={isTransitioning}
        songs={songs}
        sortedSongs={sortedSongs}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onPlayPause={togglePlayPause}
        onSkipNext={skipToNext}
        onSkipPrevious={skipToPrevious}
        onSeek={handleSeek}
        onVolumeChange={changeVolume}
        onToggleMute={toggleMute}
        onToggleShuffle={toggleShuffle}
        onSongSelect={(song) => selectSong(song, false)}
        onSongRemove={removeSong}
        onShowEqualizer={() => setShowEqualizer(true)}
        onShowLyrics={() => setActiveView("lyrics")}
        onShowYoutube={() => setActiveView("youtube")}
        onShowInsights={() => setActiveView("insights")}
        onShowArtist={() => setActiveView("artist")}
        albumArtSourceRect={albumArtSourceRect}
      />
    </div>
  )
}
