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
import { useFileDrop } from "@/hooks/use-file-drop"
import { useFileImporter } from "@/hooks/use-file-importer"
import { useLibraryNavigation } from "@/hooks/use-library-navigation"
import { usePlaylistPersistence, useAutoSave } from "@/hooks/use-playlist-persistence"
import { useMediaControls } from "@/hooks/use-media-controls"
import { useTidalSearch } from "@/hooks/use-tidal-search"

import { MobileHeader } from "@/components/mobile-header"
import { MobilePlaylistControls } from "@/components/mobile-playlist-controls"
import { DropOverlay } from "@/components/library/drop-overlay"
import { LibraryPanel } from "@/components/library/library-panel"
import { rowPlayback } from "@/components/library/song-row"
import { MobilePlayerBar } from "@/components/mobile-player-bar"
import { MobileEqualizerSheet } from "@/components/mobile-equalizer-sheet"
import { AlbumArtBackground } from "@/components/album-art-background"
import { LazyNowPanel } from "@/components/now/lazy-now-panel"
import type { NowTab } from "@/components/now/now-tabs"
import { useNowPlayer } from "@/components/now/use-now-player"
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
import { releaseMediaUrl } from "@/lib/media-source"

import type { EqualizerBand } from "@/components/refined-equalizer"
import { formatTotalDuration } from "@/lib/utils"
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
    duration, setDuration, volume, isMuted,
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
    songs, setSongs, currentSong,
    shuffleMode, setShuffleMode, viewMode, setViewMode,
    sortedSongs, peekNextSong,
    toggleShuffle, removeSong, resetPlaylist, playNext, addToQueue,
  } = playlist
  const libraryActions = useMemo(() => ({ playNext, addToQueue, removeSong }), [playNext, addToQueue, removeSong])
  const libraryNavigation = useLibraryNavigation(sortedSongs, searchQuery)

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

  // Lyrics, the queue, about and video share one sheet, opened at the tab asked for.
  const [showNow, setShowNow] = useState(false)
  const [nowTab, setNowTab] = useState<NowTab>("lyrics")
  const openNow = useCallback((tab: NowTab) => {
    setNowTab(tab)
    setShowNow(true)
  }, [])

  // Use album art preloader hook
  const { preloadUpcomingSongs } = useAlbumArtPreloader(songs, currentSong?.id, 3)

  const {
    isLoadingSongs, loadingProgress, fileInputRef, folderInputRef,
    handleFileUpload, handleFolderUpload, addSongsToPlaylist,
  } = useFileImporter({
    songs,
    onSongsAdded: (newSongs) => setSongs((prev) => [...prev, ...newSongs]),
  })

  const { isInitialized, isRestoringPlaylist, restorePlaylist, savePlaylist } = usePlaylistPersistence()
  const cloud = useCloudLibrary({ isReady: isInitialized, songCount: songs.length, setSongs })
  useStreamInfoBackfill(songs, setSongs)
  useCloudUploadSync(cloud.refresh)
  useWarmNextSong(currentSong?.id, isPlaying, peekNextSong)

  const totalDuration = useMemo(() => {
    return songs.reduce((total, song) => total + (song.duration || 0), 0)
  }, [songs])

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
    selectSong, handleSongSelect, playFromQueue, resumeSession, startPlayback, togglePlayPause, skipToNext, skipToPrevious,
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

  // Restore playlist on mount
  useEffect(() => {
    restorePlaylist().then(({ songs: restoredSongs, currentSong: current, savedSongId, settings }) => {
      if (settings.equalizerBands) setEqualizerBands(settings.equalizerBands)
      if (settings.eqPresets) setCustomEqPresets(settings.eqPresets)
      setActiveEqPresetId(settings.activeEqPresetId)
      if (settings.normalizationEnabled !== undefined) setNormalizationEnabledState(settings.normalizationEnabled)
      if (settings.preampDb !== undefined) setPreampDbState(settings.preampDb)
      // Through the engine, so a saved volume of 0 comes back muted.
      if (settings.volume !== undefined) changeVolume([settings.volume])
      if (settings.shuffleMode !== undefined) setShuffleMode(settings.shuffleMode)
      if (settings.viewMode) setViewMode(settings.viewMode)
      if (settings.showEqualizer !== undefined) setShowEqualizer(settings.showEqualizer)

      if (restoredSongs.length > 0) setSongs(restoredSongs)
      resumeSession(current, savedSongId)
    })
  }, [])

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

  const now = useNowPlayer({
    playlist,
    displaySong,
    isLoading: isLoadingSong,
    isPlaying,
    pause,
    onSeek: handleSeek,
    onSelect: handleSongSelect,
    onPlayQueued: playFromQueue,
    layout: "phone",
  })



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

  // A phone has nothing to drag from, but a narrow desktop window gets this
  // layout too.
  const libraryBusy = isLoadingSongs || isRestoringPlaylist
  const draggingFiles = useFileDrop({ onDrop: addSongsToPlaylist, busy: libraryBusy })
  const addSongsAction = useMemo(
    () => ({ label: "Add songs", onClick: () => fileInputRef.current?.click() }),
    [fileInputRef],
  )

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
          totalDuration={formatTotalDuration(totalDuration)}
          sidebarMode={sidebarMode}
          onSidebarModeChange={setSidebarMode}
          activeDownloadCount={tidalSearch.activeDownloadCount}
        />

        {/* Playlist or Online Search */}
        {sidebarMode === "online" ? (
          <div className="flex-1 overflow-hidden px-4 py-2">
            <OnlineSearchSidebar dab={tidalSearch} layout="phone" />
          </div>
        ) : (
          <LibraryPanel
            layout="phone"
            songs={sortedSongs}
            viewMode={viewMode}
            query={searchQuery}
            currentSongId={displaySong?.id}
            playback={rowPlayback(isLoadingSong, isPlaying)}
            loading={isLoadingSongs || isRestoringPlaylist || cloud.status === "loading"}
            importProgress={isLoadingSongs ? loadingProgress : null}
            onSelect={handleSongSelect}
            actions={libraryActions}
            navigation={libraryNavigation}
            emptyAction={addSongsAction}
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
          onOpenNow={openNow}
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

        {/* Portalled out of the player, so it carries the song's colours itself. */}
        <Sheet open={showNow} onOpenChange={setShowNow}>
          <SheetContent
            side="bottom"
            className="song-scope flex h-[85dvh] flex-col gap-0 p-0"
            style={songColors}
            data-playing={isPlaying || undefined}
            aria-describedby={undefined}
          >
            <SheetHeader className="space-y-0 px-5 pb-1 pr-12 pt-4 text-left">
              <SheetTitle className="truncate text-base">{displaySong?.title || "Now playing"}</SheetTitle>
              {displaySong?.artist && <p className="truncate text-sm text-muted-foreground">{displaySong.artist}</p>}
            </SheetHeader>
            <div className="flex min-h-0 flex-1 flex-col px-3 pb-[env(safe-area-inset-bottom)]">
              <LazyNowPanel layout="sheet" tab={nowTab} onTabChange={setNowTab} {...now} />
            </div>
          </SheetContent>
        </Sheet>

      </div>
      {draggingFiles && <DropOverlay busy={libraryBusy} />}
    </div>
  )
}

