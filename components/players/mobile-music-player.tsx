"use client"

import { useState, useRef, useEffect, useCallback, useMemo } from "react"

import { AlbumArtCache } from "@/lib/album-art-cache"
import { getAllPresets, type EqPreset } from "@/lib/eq-presets"
import { useAlbumArtPreloader } from "@/hooks/use-album-art-preloader"
import { usePlaylistManager } from "@/hooks/use-playlist-manager"
import { useWarmNextSong } from "@/hooks/use-warm-next-song"
import { useAudioEngine } from "@/hooks/use-audio-engine"
import { usePlaybackController, useTransportEvents } from "@/hooks/use-playback-controller"
import { useSongColors } from "@/hooks/use-song-colors"
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { SyncPanel } from "@/components/sync-panel"
import { CloudLibraryPanel } from "@/components/cloud-library-panel"
import { useCloudLibrary } from "@/hooks/use-cloud-library"
import { useStreamInfoBackfill } from "@/hooks/use-stream-info-backfill"
import { useCloudUploadSync } from "@/hooks/use-cloud-upload-sync"
import { useDeviceSync } from "@/hooks/use-device-sync"
import type { SyncPlaybackAdapter } from "@/hooks/use-sync-playback"
import { findTrackByKey, trackLabel, trackSyncKey } from "@/lib/sync/song-match"
import { createMediaUrl, releaseMediaUrl, songSource } from "@/lib/media-source"

import type { EqualizerBand } from "@/components/refined-equalizer"
import { formatTime } from "@/lib/utils"
import { resetPlaybackTime } from "@/lib/playback-time-store"

/** Auto-advance crossfade (song ends on its own). 0 = gapless, no overlap. */
const CROSSFADE_AUTO_SECONDS = 0
/** Manual track-change crossfade (Next/Prev/pick) — short & snappy. */
const CROSSFADE_MANUAL_SECONDS = 0.4

export default function MobileMusicPlayer() {
  const [searchQuery, setSearchQuery] = useState("")
  const [sidebarMode, setSidebarMode] = useState<"library" | "online">("library")
  const [showSync, setShowSync] = useState(false)
  const [showCloud, setShowCloud] = useState(false)

  const audioRef = useRef<HTMLAudioElement>(null)
  const secondaryAudioRef = useRef<HTMLAudioElement>(null)
  // Mirrors the sync role for the auto-advance guard in the playback
  // controller, which is created before the session exists.
  const isFollowingRef = useRef(false)
  const transportEvents = useTransportEvents()

  const [equalizerBands, setEqualizerBands] = useState<EqualizerBand[]>(DEFAULT_EQUALIZER_BANDS)
  const [normalizationEnabled, setNormalizationEnabledState] = useState(false)
  const [preampDb, setPreampDbState] = useState(0)
  const [customEqPresets, setCustomEqPresets] = useState<EqPreset[]>([])
  const [activeEqPresetId, setActiveEqPresetId] = useState<string | undefined>(undefined)

  const engine = useAudioEngine({
    audioRef,
    secondaryAudioRef,
    equalizerBands,
    onEnded: transportEvents.onEnded,
    onNearEnd: transportEvents.onNearEnd,
    crossfadeDuration: CROSSFADE_AUTO_SECONDS,
    manualCrossfadeDuration: CROSSFADE_MANUAL_SECONDS,
    // Crossfade-start fires before the track ends: advance early so the two
    // overlap. Same path as onEnded, which then has nothing left to do.
    onCrossfadeStart: transportEvents.onEnded,
  })
  const {
    isPlaying, setIsPlaying,
    duration, setDuration, volume, setVolume, isMuted,
    filterNodes, audioContextRef,
    pause, seek,
    changeVolume, toggleMute, adjustVolume,
    setNormalizationEnabled: engineSetNormalizationEnabled,
    setPreamp: engineSetPreamp,
    setPlaybackRate, getPosition,
  } = engine

  const playlist = usePlaylistManager({
    onCurrentSongRemoved: () => {
      pause()
      if (audioRef.current) audioRef.current.src = ""
    },
    onPlaylistReset: () => {
      pause()
      if (audioRef.current) audioRef.current.src = ""
      resetPlaybackTime()
      setDuration(0)
    },
  })
  const {
    songs, setSongs, currentSong, setCurrentSong,
    shuffleMode, setShuffleMode, viewMode, setViewMode,
    sortedSongs, peekNextSong,
    toggleShuffle, removeSong, resetPlaylist, playNext,
  } = playlist

  const {
    showEqualizer, setShowEqualizer,
    updateBand: updateEqualizerBand, applyBands, resetEqualizer,
  } = useEqualizerManager({ equalizerBands, setEqualizerBands, filterNodes })

  // Keep the engine's normalization/preamp in sync with player state
  // (the engine gates the actual gain by these — see updateGainStructure).
  useEffect(() => {
    engineSetNormalizationEnabled(normalizationEnabled)
  }, [normalizationEnabled, engineSetNormalizationEnabled])

  useEffect(() => {
    engineSetPreamp(preampDb)
  }, [preampDb, engineSetPreamp])

  const eqPresets = useMemo(() => getAllPresets(customEqPresets), [customEqPresets])

  // Manual band edits detach from the selected preset.
  const handleBandChange = useCallback((index: number, gain: number) => {
    updateEqualizerBand(index, gain)
    setActiveEqPresetId(undefined)
  }, [updateEqualizerBand])

  const handleEqReset = useCallback(() => {
    resetEqualizer()
    setPreampDbState(0)
    setActiveEqPresetId("flat")
  }, [resetEqualizer])

  const handlePresetSelect = useCallback((preset: EqPreset) => {
    applyBands(preset.gains)
    setPreampDbState(preset.preamp)
    setActiveEqPresetId(preset.id)
  }, [applyBands])

  const handlePresetSave = useCallback((name: string) => {
    const preset: EqPreset = {
      id: `custom-${Date.now().toString(36)}`,
      name,
      gains: equalizerBands.map((b) => b.gain),
      preamp: preampDb,
    }
    // Same-name save replaces the existing custom preset.
    setCustomEqPresets((prev) => [...prev.filter((p) => p.name !== name), preset])
    setActiveEqPresetId(preset.id)
  }, [equalizerBands, preampDb])

  const handlePresetDelete = useCallback((id: string) => {
    setCustomEqPresets((prev) => prev.filter((p) => p.id !== id))
    setActiveEqPresetId((prev) => (prev === id ? undefined : prev))
  }, [])

  // New state for lyrics and network sharing
  const [showLyrics, setShowLyrics] = useState(false)
  const [forceRefreshTrigger, setForceRefreshTrigger] = useState(0)
  const [showVideo, setShowVideo] = useState(false)
  const [showInsights, setShowInsights] = useState(false)
  const [showArtist, setShowArtist] = useState(false)

  useEffect(() => {
    if (showVideo && isPlaying) {
      pause();
    }
  }, [showVideo, isPlaying, pause]);

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
  const cloud = useCloudLibrary({ isReady: isInitialized, songCount: songs.length, setSongs })
  useStreamInfoBackfill(songs, setSongs)
  useCloudUploadSync(cloud.refresh)
  useWarmNextSong(currentSong?.id, isPlaying, peekNextSong)

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

    const parseYear = (y?: string): number => {
      if (!y) return Infinity
      const match = y.match(/\d{4}/)
      return match ? parseInt(match[0], 10) : Infinity
    }
    const parseTrack = (t?: string): number => {
      if (!t) return Infinity
      const n = parseInt(t, 10)
      return Number.isNaN(n) ? Infinity : n
    }

    const grouped: { [artist: string]: { [album: string]: Song[] } } = {}
    const artistKeyToDisplay = new Map<string, string>()
    const albumKeyToDisplay = new Map<string, string>()
    const albumYearByDisplayKey = new Map<string, number>()

    filteredSongs.forEach((song) => {
      const artistRaw = (song.artist || "Unknown Artist").trim()
      const albumRaw = (song.album || "Unknown Album").trim()
      const artistKey = artistRaw.toLowerCase()
      const albumKey = `${artistKey}::${albumRaw.toLowerCase()}`

      if (!artistKeyToDisplay.has(artistKey)) {
        artistKeyToDisplay.set(artistKey, artistRaw)
      }
      if (!albumKeyToDisplay.has(albumKey)) {
        albumKeyToDisplay.set(albumKey, albumRaw)
      }
      const artistDisplay = artistKeyToDisplay.get(artistKey)!
      const albumDisplay = albumKeyToDisplay.get(albumKey)!
      const displayPairKey = `${artistDisplay}::${albumDisplay}`

      const songYear = parseYear(song.year)
      const existingYear = albumYearByDisplayKey.get(displayPairKey)
      if (existingYear === undefined || (existingYear === Infinity && songYear !== Infinity)) {
        albumYearByDisplayKey.set(displayPairKey, songYear)
      }

      if (!grouped[artistDisplay]) {
        grouped[artistDisplay] = {}
      }
      if (!grouped[artistDisplay][albumDisplay]) {
        grouped[artistDisplay][albumDisplay] = []
      }
      grouped[artistDisplay][albumDisplay].push(song)
    })

    // Sort artists alphabetically; albums by year (oldest first, missing last); songs by track number
    const sortedGrouped: { [artist: string]: { [album: string]: Song[] } } = {}
    Object.keys(grouped)
      .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
      .forEach((artist) => {
        sortedGrouped[artist] = {}
        Object.keys(grouped[artist])
          .sort((a, b) => {
            const yA = albumYearByDisplayKey.get(`${artist}::${a}`) ?? Infinity
            const yB = albumYearByDisplayKey.get(`${artist}::${b}`) ?? Infinity
            if (yA !== yB) return yA - yB
            return a.toLowerCase().localeCompare(b.toLowerCase())
          })
          .forEach((album) => {
            sortedGrouped[artist][album] = grouped[artist][album].sort((a, b) => {
              const tA = parseTrack(a.trackNumber)
              const tB = parseTrack(b.trackNumber)
              if (tA !== tB) return tA - tB
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
      if (settings.eqPresets) setCustomEqPresets(settings.eqPresets)
      setActiveEqPresetId(settings.activeEqPresetId)
      if (settings.normalizationEnabled !== undefined) setNormalizationEnabledState(settings.normalizationEnabled)
      if (settings.preampDb !== undefined) setPreampDbState(settings.preampDb)
      if (settings.volume !== undefined) setVolume([settings.volume])
      if (settings.shuffleMode !== undefined) setShuffleMode(settings.shuffleMode)
      if (settings.viewMode) setViewMode(settings.viewMode)
      if (settings.showEqualizer !== undefined) setShowEqualizer(settings.showEqualizer)

      if (restoredSongs.length > 0) {
        setSongs(restoredSongs)
        if (current) {
          setCurrentSong(current)
          const source = songSource(current)
          if (audioRef.current && source) {
            const audioUrl = createMediaUrl(source)
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
    eqPresets: customEqPresets, activeEqPresetId,
    volume: volume[0], shuffleMode, viewMode, showEqualizer, crossfadeDuration: CROSSFADE_AUTO_SECONDS,
    normalizationEnabled, preampDb,
  }), [songs, currentSong?.id, equalizerBands, customEqPresets, activeEqPresetId, volume, shuffleMode, viewMode, showEqualizer, normalizationEnabled, preampDb])

  useAutoSave(persistenceData, isInitialized, isRestoringPlaylist, savePlaylist)

  // Player control functions
  const {
    selectSong, handleSongSelect, startPlayback, togglePlayPause, skipToNext, skipToPrevious,
    displaySong, isLoading: isLoadingSong, direction: changeDirection,
  } = usePlaybackController({
    audioRef,
    engine,
    playlist,
    normalizationEnabled,
    preloadUpcomingSongs,
    isFollowingRef,
    events: transportEvents,
  })

  // --- Multi-device sync --------------------------------------------------

  /** The seam between this player and the sync engine; see the desktop shell. */
  const syncAdapter = useMemo<SyncPlaybackAdapter>(() => ({
    getTrackKey: () => trackSyncKey(currentSong),
    getTrackLabel: () => trackLabel(currentSong),
    getPosition,
    isPlaying: () => isPlaying,
    getOutputLatency: () => audioContextRef.current?.outputLatency ?? 0,
    selectTrackByKey: async (key) => {
      const song = findTrackByKey(songs, key)
      if (!song) return false
      await selectSong(song)
      return true
    },
    // Autoplay policy is satisfied: joining or hosting is a tap, and that
    // activation covers the document for the rest of the session.
    play: () => { void startPlayback() },
    pause,
    seek,
    setRate: setPlaybackRate,
  }), [currentSong, songs, isPlaying, getPosition, audioContextRef, selectSong, startPlayback, pause, seek, setPlaybackRate])

  const sync = useDeviceSync({ adapter: syncAdapter })
  const { isConnected: syncConnected, role: syncRole, broadcast: syncBroadcast } = sync
  const isHosting = syncConnected && syncRole === "host"

  useEffect(() => {
    isFollowingRef.current = sync.isFollowing
  }, [sync.isFollowing])

  // Announce transport changes once React has committed them.
  useEffect(() => {
    if (isHosting) syncBroadcast()
  }, [isPlaying, currentSong?.id, isHosting, syncBroadcast])

  const handleSeek = useCallback((seconds: number) => {
    seek(seconds)
    // Seeks are not visible to the effect above, so they announce themselves.
    if (isHosting) syncBroadcast()
  }, [seek, isHosting, syncBroadcast])



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
        resetPlaybackTime()
      }
    },
    onVolumeAdjust: adjustVolume,
    onToggleMute: toggleMute,
    onPlayFirstSong: () => { if (songs.length > 0) void selectSong(songs[0]) },
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
      songs.forEach((song) => releaseMediaUrl(song.url))
      AlbumArtCache.clearCache()
    }
  }, [])

  const songColors = useSongColors(displaySong)

  return (
    <div className="song-scope min-h-screen relative bg-background" style={songColors} data-playing={isPlaying || undefined}>
      {/* Dynamic Background */}
      <AlbumArtBackground albumArt={displaySong?.albumArt} songId={displaySong?.id} isTransitioning={isLoadingSong} />

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
      {/* crossOrigin: cloud songs stream from R2, and Web Audio outputs silence for a cross-origin element without CORS */}
      <audio ref={audioRef} preload="metadata" crossOrigin="anonymous" />
      <audio ref={secondaryAudioRef} preload="metadata" crossOrigin="anonymous" />

      {/* Mobile Layout */}
      <div className="flex flex-col h-dvh relative z-10">
        {/* Header */}
        <MobileHeader
          onFileUpload={() => fileInputRef.current?.click()}
          onFolderUpload={() => folderInputRef.current?.click()}
          isLoading={isLoadingSongs || isRestoringPlaylist}
          onOpenSync={() => setShowSync(true)}
          syncActive={syncConnected}
          onOpenCloud={() => setShowCloud(true)}
          cloudActive={cloud.status === "ready"}
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
            currentSong={displaySong}
            viewMode={viewMode}
            onSongSelect={handleSongSelect}
            onSongRemove={removeSong}
            onSongPlayNext={playNext}
            isLoading={isLoadingSongs || isRestoringPlaylist}
            loadingProgress={loadingProgress}
          />
        )}

        {/* Player Bar */}
        <MobilePlayerBar
          currentSong={displaySong}
          isPlaying={isPlaying}
          isLoading={isLoadingSong}
          direction={changeDirection}
          duration={isLoadingSong ? (displaySong?.duration ?? 0) : duration}
          volume={volume}
          isMuted={isMuted}
          onVolumeChange={changeVolume}
          onToggleMute={toggleMute}
          onPlayPause={togglePlayPause}
          onSkipPrevious={skipToPrevious}
          onSkipNext={skipToNext}
          onSeek={handleSeek}
          onSettingsClick={() => setShowEqualizer(true)}
          onLyricsClick={() => setShowLyrics(true)}
          onVideoClick={() => setShowVideo(true)}
          onInsightsClick={() => setShowInsights(true)}
          onArtistClick={() => setShowArtist(true)}
        />

        {/* Two-device playback — its own sheet so the live readout only
            subscribes while it is open. */}
        <Sheet open={showSync} onOpenChange={setShowSync}>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Two-device playback</SheetTitle>
            </SheetHeader>
            <div className="pt-4">
              <SyncPanel sync={sync} />
            </div>
          </SheetContent>
        </Sheet>

        <Sheet open={showCloud} onOpenChange={setShowCloud}>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Cloud library</SheetTitle>
            </SheetHeader>
            <div className="pt-4">
              <CloudLibraryPanel cloud={cloud} songs={songs} />
            </div>
          </SheetContent>
        </Sheet>

        {/* Equalizer Sheet */}
        <MobileEqualizerSheet
          isOpen={showEqualizer}
          onOpenChange={setShowEqualizer}
          bands={equalizerBands}
          onBandChange={handleBandChange}
          onReset={handleEqReset}
          volume={volume}
          onVolumeChange={changeVolume}
          isMuted={isMuted}
          onToggleMute={toggleMute}
          preampDb={preampDb}
          onPreampChange={setPreampDbState}
          normalizationEnabled={normalizationEnabled}
          onNormalizationChange={setNormalizationEnabledState}
          presets={eqPresets}
          activePresetId={activeEqPresetId}
          onPresetSelect={handlePresetSelect}
          onPresetSave={handlePresetSave}
          onPresetDelete={handlePresetDelete}
        />

        {/* Lyrics Sheet */}
        <MobileLyricsDisplay
          isOpen={showLyrics}
          onOpenChange={setShowLyrics}
          currentSong={currentSong}
          isPlaying={isPlaying}
          forceRefresh={forceRefreshTrigger}
        />

        {/* Video Player Sheet */}
        <MobileYouTubeVideoPlayer
          currentSong={currentSong}
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

