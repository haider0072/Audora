"use client"

import { useState, useRef, useEffect, useCallback, useMemo, lazy, Suspense } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { toast } from "@/hooks/use-toast"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  Play, Pause, SkipBack, SkipForward,
  Volume2, VolumeX, Settings, Mic, Youtube,
} from "lucide-react"

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
import { AlbumArtCache } from "@/lib/album-art-cache"
import { formatTime, waitForCanPlay } from "@/lib/utils"
import { AddMusicControls } from "@/components/add-music-control"

const LyricsDisplay = lazy(() =>
  import("@/components/lyrics-display").then(mod => ({ default: mod.LyricsDisplay }))
)
const YouTubeVideoPlayer = lazy(() =>
  import("@/components/youtube-video-player").then(mod => ({ default: mod.YouTubeVideoPlayer }))
)

export default function EnhancedMusicPlayer() {
  const [currentBitrate, setCurrentBitrate] = useState<number | undefined>()
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [activeView, setActiveView] = useState<"player" | "lyrics" | "youtube">("player");
  const videoPlayerRef = useRef<{ resetVideo: () => void }>(null);
  const [forceRefreshTrigger, setForceRefreshTrigger] = useState(0);
  const [videoReadyCalled, setVideoReadyCalled] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null)
  const skipToNextRef = useRef<() => void>(() => {})
  const selectSongAbortRef = useRef<AbortController | null>(null)

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
    volume: volume[0], shuffleMode, viewMode, showEqualizer,
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

      setIsTransitioning(true)
      if (currentSong?.url) URL.revokeObjectURL(currentSong.url)
      preloadUpcomingSongs()
      setCurrentSong(song)
      setCurrentBitrate(song.bitrate)
      setIsPlaying(false)
      notifySongSelected(song, isAutoAdvance)

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
    [currentSong, notifySongSelected, initializeAudioContext, preloadUpcomingSongs],
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
      // Audio element not initialized — set up current song
      const audioUrl = URL.createObjectURL(currentSong.file)
      const updatedSong = { ...currentSong, url: audioUrl }
      setCurrentSong(updatedSong)
      audioRef.current.src = audioUrl
      audioRef.current.load()
      
      await waitForCanPlay(audioRef.current)
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

  // Keep skipToNextRef always pointing to the latest skipToNext (bug fix for stale closures)
  // eslint-disable-next-line react-hooks/refs -- intentional: ref updated during render to avoid stale closure in audio ended callback
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

  return (
    <div className="min-h-screen max-h-screen overflow-hidden relative">
      <AlbumArtBackground albumArt={currentSong?.albumArt} songId={currentSong?.id} isTransitioning={isTransitioning} />
      <audio ref={audioRef} preload="metadata" className="hidden" />
      {/* Screen reader announcements for song changes */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {currentSong && `Now playing: ${currentSong.title}${currentSong.artist ? ` by ${currentSong.artist}` : ""}`}
      </div>
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
                          aria-label="Seek position"
                        />
                        <div className="flex justify-between text-sm text-muted-foreground">
                          <span>{formatTime(currentTime)}</span>
                          <span>{formatTime(duration)}</span>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center justify-center gap-4">
                      <Button variant="outline" size="icon" onClick={skipToPrevious} disabled={songs.length === 0} aria-label="Previous track">
                        <SkipBack className="w-4 h-4" />
                      </Button>
                      <Button
                        onClick={togglePlayPause}
                        size="icon"
                        className="w-14 h-14 shadow-lg"
                        disabled={!currentSong}
                        aria-label={isPlaying ? "Pause" : "Play"}
                      >
                        {isPlaying ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7" />}
                      </Button>
                      <Button variant="outline" size="icon" onClick={skipToNext} disabled={songs.length === 0} aria-label="Next track">
                        <SkipForward className="w-4 h-4" />
                      </Button>
                      <Separator orientation="vertical" className="h-8" />
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon" onClick={toggleMute} aria-label={isMuted ? "Unmute" : "Mute"}>
                          {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                        </Button>
                        <Slider value={volume} max={100} step={1} onValueChange={changeVolume} className="w-24" aria-label="Volume" />
                      </div>
                      <Separator orientation="vertical" className="h-8" />
                      <Button
                        variant={showEqualizer ? "default" : "outline"}
                        size="icon"
                        onClick={() => setShowEqualizer(true)}
                        aria-label="Equalizer settings"
                      >
                        <Settings className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setActiveView("lyrics")}
                        disabled={!currentSong}
                        aria-label="Show lyrics"
                      >
                        <Mic className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setActiveView("youtube")}
                        disabled={!currentSong}
                        aria-label="Show video"
                      >
                        <Youtube className="w-4 h-4" />
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
