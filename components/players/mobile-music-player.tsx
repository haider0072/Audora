"use client"

import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { toast } from "@/hooks/use-toast"

import { AlbumArtCache } from "@/lib/album-art-cache"
import { LoudnessAnalyzer } from "@/lib/loudness-analyzer"
import { useAlbumArtPreloader } from "@/hooks/use-album-art-preloader"
import { usePlaylistManager } from "@/hooks/use-playlist-manager"
import { useAudioEngine } from "@/hooks/use-audio-engine"
import { useEqualizerManager, DEFAULT_EQUALIZER_BANDS } from "@/hooks/use-equalizer-manager"
import { useFileImporter } from "@/hooks/use-file-importer"
import { usePlaylistPersistence, useAutoSave } from "@/hooks/use-playlist-persistence"
import { useMediaControls } from "@/hooks/use-media-controls"
import { useTidalSearch } from "@/hooks/use-tidal-search"
import type { Song } from "@/components/enhanced-playlist"

import { MobileHeader } from "@/components/mobile-header"
import { MobilePlaylistControls } from "@/components/mobile-playlist-controls"
import { MobilePlaylist } from "@/components/mobile-playlist"
import { MobilePlayerBar } from "@/components/mobile-player-bar"
import { MobileEqualizerSheet } from "@/components/mobile-equalizer-sheet"
import { MobileLyricsDisplay } from "@/components/mobile-lyrics-display"
import { AlbumArtBackground } from "@/components/album-art-background"
import { MobileYouTubeVideoPlayer } from "@/components/mobile-youtube-video-player"
import { MobileSongInsights } from "@/components/mobile-song-insights"
import { MobileArtistInfo } from "@/components/mobile-artist-info"
import { OnlineSearchSidebar } from "@/components/dab/online-search-sidebar"

import type { EqualizerBand } from "@/components/refined-equalizer"
import { formatTime, waitForCanPlay } from "@/lib/utils"

export default function MobileMusicPlayer() {
  const [searchQuery, setSearchQuery] = useState("")
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [sidebarMode, setSidebarMode] = useState<"library" | "online">("library")

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

  // New state for lyrics and network sharing
  const [showLyrics, setShowLyrics] = useState(false)
  const [forceRefreshTrigger, setForceRefreshTrigger] = useState(0)
  const [showVideo, setShowVideo] = useState(false)
  const [showInsights, setShowInsights] = useState(false)
  const [showArtist, setShowArtist] = useState(false)

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

  const totalDuration = useMemo(() => {
    return songs.reduce((total, song) => total + (song.duration || 0), 0)
  }, [songs])

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

  // Player control functions
  const selectSong = useCallback(async (song: Song, isAutoAdvance = false) => {
    // Abort any previous in-flight selectSong call
    selectSongAbortRef.current?.abort()
    const abort = new AbortController()
    selectSongAbortRef.current = abort

    // Gapless fast path: if this song was preloaded, do instant swap
    if (isAutoAdvance && isPreloaded && pendingPreloadRef.current?.id === song.id) {
      applyNormalization(song.gainCorrection ?? 0)
      const swapped = swapToPreloaded()
      if (swapped) {
        if (currentSong?.url) URL.revokeObjectURL(currentSong.url)
        setCurrentSong(song)
        setIsPlaying(true)
        notifySongSelected(song, isAutoAdvance)
        setTimeout(() => preloadUpcomingSongs(), 100)
        pendingPreloadRef.current = null
        return
      }
    }

    pendingPreloadRef.current = null

    // Lazy loudness analysis — runs in background on first play
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

    try {
      setIsTransitioning(true)

      if (currentSong?.url && currentSong.url !== song.url) {
        URL.revokeObjectURL(currentSong.url)
      }

      setTimeout(() => preloadUpcomingSongs(), 100)

      setCurrentSong(song)
      setIsPlaying(false)
      notifySongSelected(song, isAutoAdvance)
      applyNormalization(song.gainCorrection ?? 0)

      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.currentTime = 0

        const audioUrl = URL.createObjectURL(song.file)
        const updatedSong = { ...song, url: audioUrl }
        setCurrentSong(updatedSong)
        audioRef.current.src = audioUrl

        audioRef.current.load()
        await waitForCanPlay(audioRef.current)

        if (abort.signal.aborted) return

        initializeAudioContext()

        setTimeout(() => {
          if (!abort.signal.aborted) setIsTransitioning(false)
        }, 500)

        try {
          await audioRef.current.play()
          if (!abort.signal.aborted) setIsPlaying(true)
        } catch (error) {
          if (!abort.signal.aborted) {
            console.error("Error auto-playing song:", error)
            setIsPlaying(false)
            toast({ title: "Playback error", description: "Click play to start the song manually.", variant: "default" })
          }
        }
      }
    } catch (error) {
      if (!abort.signal.aborted) {
        console.error("Error selecting song:", error)
        setIsPlaying(false)
        setIsTransitioning(false)
        toast({ title: "Error loading song", description: "Unable to load the selected audio file.", variant: "destructive" })
      }
    }
  }, [currentSong, notifySongSelected, initializeAudioContext, preloadUpcomingSongs, setIsPlaying, setCurrentSong, isPreloaded, swapToPreloaded, resetGaplessState, applyNormalization])


  const togglePlayPause = async () => {
    if (!currentSong) return

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
      initializeAudioContext()
      try {
        await play()
      } catch (error) {
        console.error("Error playing audio:", error)
        setIsPlaying(false)
        toast({ title: "Playback error", description: "Unable to play the selected song.", variant: "destructive" })
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
  })


  // Tidal online search & download
  const tidalSearch = useTidalSearch({
    songs,
    onSongDownloaded: (newSong) => {
      setSongs((prev) => [...prev, newSong])
    },
  })

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

      {/* Audio Elements (dual for gapless playback) */}
      <audio ref={audioRef} preload="metadata" />
      <audio ref={secondaryAudioRef} preload="metadata" />

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
          totalDuration={formatTime(totalDuration)}
          sidebarMode={sidebarMode}
          onSidebarModeChange={setSidebarMode}
          activeDownloadCount={tidalSearch.activeDownloadCount}
        />

        {/* Playlist or Online Search */}
        {sidebarMode === "online" ? (
          <div className="flex-1 overflow-hidden px-4 py-2">
            <OnlineSearchSidebar dab={tidalSearch} />
          </div>
        ) : (
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
        )}

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
          onVideoClick={() => setShowVideo(true)}
          onInsightsClick={() => setShowInsights(true)}
          onArtistClick={() => setShowArtist(true)}
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

        {/* AI Song Insights Sheet */}
        <MobileSongInsights
          isOpen={showInsights}
          onOpenChange={setShowInsights}
          currentSong={currentSong}
        />

        {/* Artist Info Sheet */}
        <MobileArtistInfo
          isOpen={showArtist}
          onOpenChange={setShowArtist}
          currentSong={currentSong}
        />

      </div>
    </div>
  )
}

