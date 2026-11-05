"use client"

import { Fragment, useState, useRef, useEffect, useCallback, useMemo } from "react"
import { X } from "lucide-react"

import { toast } from "@/hooks/use-toast"
import { ToastAction } from "@/components/ui/toast"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DesktopSidebar, type DesktopView } from "@/components/desktop/desktop-sidebar"
import { PlayerBar } from "@/components/desktop/player-bar"
import { SearchField, ViewHeader, ViewModeToggle } from "@/components/desktop/view-header"
import { TransportButton } from "@/components/player/transport-button"
import { DropOverlay } from "@/components/library/drop-overlay"
import { LibraryPanel } from "@/components/library/library-panel"
import { rowPlayback } from "@/components/library/song-row"
import { LazyNowPanel } from "@/components/now/lazy-now-panel"
import type { NowTab } from "@/components/now/now-tabs"
import { useNowPlayer } from "@/components/now/use-now-player"
import { RefinedEqualizer, type EqualizerBand } from "@/components/refined-equalizer"
import { AlbumArtBackground } from "@/components/album-art-background"
import { PlaylistManager } from "@/components/playlist-manager"
import { useBodyClass } from "@/hooks/use-body-class"
import { useReturnFocus } from "@/hooks/use-return-focus"
import { useAlbumArtPreloader } from "@/hooks/use-album-art-preloader"
import { useFolderSync } from "@/hooks/use-folder-sync"
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
import { OnlineSearchSidebar } from "@/components/dab/online-search-sidebar"
import { AlbumArtCache } from "@/lib/album-art-cache"
import { getAllPresets, type EqPreset } from "@/lib/eq-presets"
import type { LibraryPage } from "@/lib/library-pages"
import { resetPlaybackTime } from "@/lib/playback-time-store"
import { formatCount, formatTotalDuration } from "@/lib/utils"
import { AddMusicControls } from "@/components/add-music-control"
import { FullscreenPlayer } from "@/components/fullscreen-player"
import { SyncPanel } from "@/components/sync-panel"
import { CloudLibraryPanel } from "@/components/cloud-library-panel"
import { useCloudLibrary } from "@/hooks/use-cloud-library"
import { useStreamInfoBackfill } from "@/hooks/use-stream-info-backfill"
import { useCloudUploadSync } from "@/hooks/use-cloud-upload-sync"
import { useDeviceSync } from "@/hooks/use-device-sync"
import type { SyncPlaybackAdapter } from "@/hooks/use-sync-playback"
import { findTrackByKey, trackLabel, trackSyncKey } from "@/lib/sync/song-match"
import { releaseMediaUrl } from "@/lib/media-source"

/** Auto-advance crossfade (song ends on its own). 0 = gapless, no overlap. */
const CROSSFADE_AUTO_SECONDS = 0
/** Manual track-change crossfade (Next/Prev/pick) — short & snappy. */
const CROSSFADE_MANUAL_SECONDS = 0.4

export default function EnhancedMusicPlayer() {
  // The desktop is always night, and its menus and dialogs open in the body, outside it.
  useBodyClass("dark")
  // The Now panel opens as a column beside the library, and keeps the tab last opened.
  const [nowOpen, setNowOpen] = useState(false)
  const [nowTab, setNowTab] = useState<NowTab>("lyrics")
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [albumArtSourceRect, setAlbumArtSourceRect] = useState<DOMRect | null>(null);
  const [view, setView] = useState<DesktopView>("library")
  const [showSync, setShowSync] = useState(false);
  const [showCloud, setShowCloud] = useState(false);
  // The equalizer, two-device playback and the cloud library open from a
  // menu, the sidebar or full screen, and hand focus back to what opened them.
  const returnFocus = useReturnFocus()
  const [searchQuery, setSearchQuery] = useState("")

  const coverRef = useRef<HTMLButtonElement>(null)
  const nowToggleRef = useRef<HTMLButtonElement>(null)
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
  const { show: showLibraryPage } = libraryNavigation

  /** Show an artist's or an album's page, from the player. */
  const showInLibrary = useCallback((page: LibraryPage) => {
    setView("library")
    showLibraryPage(page)
  }, [showLibraryPage])

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

  // Folder sync hook
  const {
    isSyncing,
    syncProgress,
    syncInputRef,
    handleFolderSync,
  } = useFolderSync({
    songs,
    onSongsAdded: (newSongs) => setSongs((prev) => [...prev, ...newSongs]),
    onSongsRemoved: (removedIds) => {
      const count = removedIds.length
      toast({
        title: `${count} song(s) no longer in folder`,
        description: "These songs were removed from the sync folder. Remove them from your library?",
        action: (
          <ToastAction
            altText="Remove songs"
            onClick={() => {
              removedIds.forEach((id) => removeSong(id))
            }}
          >
            Remove
          </ToastAction>
        ),
      })
    },
  })

  // Auto-save playlist data
  const persistenceData = useMemo(() => ({
    songs, currentSongId: currentSong?.id, equalizerBands,
    eqPresets: customEqPresets, activeEqPresetId,
    volume: volume[0], shuffleMode, viewMode, showEqualizer, crossfadeDuration: CROSSFADE_AUTO_SECONDS,
    normalizationEnabled, preampDb,
  }), [songs, currentSong?.id, equalizerBands, customEqPresets, activeEqPresetId, volume, shuffleMode, viewMode, showEqualizer, normalizationEnabled, preampDb])

  useAutoSave(persistenceData, isInitialized, isRestoringPlaylist, savePlaylist)

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

  /**
   * The seam between this player and the sync engine. Everything the engine
   * needs to observe or drive goes through here, which is what keeps the
   * synchronization logic free of player internals and usable by the mobile
   * shell too.
   */
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
    // Autoplay policy is satisfied: joining or hosting is a click, and that
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

  // Announce transport changes once React has committed them. Broadcasting at
  // each call site instead would report the state being replaced rather than
  // the one that took effect.
  useEffect(() => {
    if (isHosting) syncBroadcast()
  }, [isPlaying, currentSong?.id, isHosting, syncBroadcast])

  const libraryBusy = isLoadingSongs || isRestoringPlaylist || isSyncing
  const draggingFiles = useFileDrop({ onDrop: addSongsToPlaylist, busy: libraryBusy })
  const addFolderAction = useMemo(
    () => ({ label: "Add a folder", onClick: () => folderInputRef.current?.click() }),
    [folderInputRef],
  )

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
    layout: "desktop",
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
    enableExtendedShortcuts: true,
  })

  // Tidal online search & download
  const tidalSearch = useTidalSearch({
    songs,
    onSongDownloaded: (newSong) => {
      setSongs((prev) => [...prev, newSong])
    },
    // Whenever a search-result preview starts, silence the main library
    // playback so the two streams don't overlap.
    onPreviewStart: () => {
      if (audioRef.current && !audioRef.current.paused) {
        pause()
      }
    },
  })

  // And the inverse: when library playback resumes, kill any preview stream.
  useEffect(() => {
    if (isPlaying && tidalSearch.previewTrackId) {
      tidalSearch.stopPreview()
    }
  }, [isPlaying, tidalSearch.previewTrackId, tidalSearch.stopPreview])

  // Cleanup Object URLs and caches on unmount
  useEffect(() => {
    return () => {
      songs.forEach((song) => releaseMediaUrl(song.url))
      AlbumArtCache.clearCache()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- intentional: cleanup only on unmount

  const handleOpenFullscreen = useCallback(() => {
    if (coverRef.current) {
      setAlbumArtSourceRect(coverRef.current.getBoundingClientRect())
    }
    setIsFullscreen(true)
  }, [])

  const songColors = useSongColors(displaySong)

  const totalDuration = useMemo(() => songs.reduce((total, song) => total + (song.duration || 0), 0), [songs])
  let libraryMeta: string | undefined
  if (isRestoringPlaylist) libraryMeta = "Restoring…"
  else if (songs.length > 0) libraryMeta = `${formatCount(songs.length, "song")} · ${formatTotalDuration(totalDuration)}`
  const downloads = tidalSearch.activeDownloadCount

  return (
    // The desktop sits on artwork darkened to ink in both themes, so it takes
    // the dark theme's tokens whatever the app theme is.
    <div
      className="dark song-scope relative h-dvh overflow-hidden text-foreground"
      style={songColors}
      data-playing={isPlaying || undefined}
    >
      <AlbumArtBackground albumArt={displaySong?.albumArt} songId={displaySong?.id} isTransitioning={isLoadingSong} />
      {/* crossOrigin: cloud songs stream from R2, and Web Audio outputs silence for a cross-origin element without CORS */}
      <audio ref={audioRef} preload="metadata" crossOrigin="anonymous" className="hidden" />
      <audio ref={secondaryAudioRef} preload="metadata" crossOrigin="anonymous" className="hidden" />
      {/* Screen reader announcements for song changes */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {currentSong && `Now playing: ${currentSong.title}${currentSong.artist ? ` by ${currentSong.artist}` : ""}`}
      </div>
      <div className="desktop-shell">
        <DesktopSidebar
          view={view}
          onViewChange={setView}
          downloads={downloads}
          cloudStatus={cloud.status}
          onOpenCloud={() => returnFocus.open(setShowCloud)}
        />
        <main className="desktop-main">
          {/* Keyed, so a view mounts afresh rather than taking over the other's
              header: the online search field takes focus as its view opens. */}
          {view === "library" ? (
            <Fragment key="library">
              <ViewHeader title="Library" meta={libraryMeta}>
                <SearchField label="Search your library" value={searchQuery} onChange={setSearchQuery} />
                <ViewModeToggle value={viewMode} onChange={setViewMode} />
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
                <PlaylistManager
                  songCount={songs.length}
                  songs={songs.map((s) => ({ id: s.id, title: s.title, artist: s.artist, albumArt: s.albumArt }))}
                  onPlaylistReset={resetPlaylist}
                />
              </ViewHeader>
              <div className="desktop-view">
                <LibraryPanel
                  layout="desktop"
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
                  emptyAction={addFolderAction}
                />
              </div>
            </Fragment>
          ) : (
            <Fragment key="online">
              <ViewHeader title="Search online" meta={downloads > 0 ? `${formatCount(downloads, "song")} downloading` : undefined}>
                <SearchField
                  label="Search online"
                  value={tidalSearch.searchQuery}
                  onChange={tidalSearch.setSearchQuery}
                  onSubmit={tidalSearch.search}
                  autoFocus
                />
              </ViewHeader>
              <div className="desktop-view" data-view="online">
                <OnlineSearchSidebar dab={tidalSearch} hideSearch />
              </div>
            </Fragment>
          )}
        </main>
        {nowOpen && (
          <aside className="desktop-now" aria-label="Now playing">
            <LazyNowPanel
              layout="side"
              tab={nowTab}
              onTabChange={setNowTab}
              {...now}
              trailing={
                <TransportButton
                  label="Close the panel"
                  size="xs"
                  onClick={() => {
                    // This button goes with the panel; focus moves to the one that brings it back.
                    nowToggleRef.current?.focus()
                    setNowOpen(false)
                  }}
                >
                  <X className="h-4 w-4" />
                </TransportButton>
              }
            />
          </aside>
        )}
        <PlayerBar
          song={displaySong}
          isPlaying={isPlaying}
          isLoading={isLoadingSong}
          direction={changeDirection}
          duration={isLoadingSong ? (displaySong?.duration ?? 0) : duration}
          canSkip={songs.length > 0}
          shuffle={shuffleMode}
          onToggleShuffle={toggleShuffle}
          onPlayPause={() => void togglePlayPause()}
          onSkipPrevious={skipToPrevious}
          onSkipNext={skipToNext}
          onSeek={handleSeek}
          onShowPage={showInLibrary}
          coverRef={coverRef}
          onOpenFullscreen={handleOpenFullscreen}
          nowOpen={nowOpen}
          onToggleNow={() => setNowOpen((open) => !open)}
          nowToggleRef={nowToggleRef}
          volume={volume}
          isMuted={isMuted}
          onVolumeChange={changeVolume}
          onToggleMute={toggleMute}
          onOpenSound={() => returnFocus.open(setShowEqualizer)}
          onOpenSync={() => returnFocus.open(setShowSync)}
          syncConnected={syncConnected}
        />
      </div>
      <Dialog open={showEqualizer} onOpenChange={setShowEqualizer}>
        <DialogContent onCloseAutoFocus={returnFocus.onCloseAutoFocus}>
          <DialogHeader>
            <DialogTitle>Equalizer</DialogTitle>
          </DialogHeader>
          <RefinedEqualizer
            bands={equalizerBands}
            onBandChange={handleBandChange}
            onReset={handleEqReset}
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
        </DialogContent>
      </Dialog>
      <Dialog open={showSync} onOpenChange={setShowSync}>
        <DialogContent onCloseAutoFocus={returnFocus.onCloseAutoFocus}>
          <DialogHeader>
            <DialogTitle>Two-device playback</DialogTitle>
          </DialogHeader>
          <SyncPanel sync={sync} />
        </DialogContent>
      </Dialog>
      <Dialog open={showCloud} onOpenChange={setShowCloud}>
        <DialogContent onCloseAutoFocus={returnFocus.onCloseAutoFocus}>
          <DialogHeader>
            <DialogTitle>Cloud library</DialogTitle>
          </DialogHeader>
          <CloudLibraryPanel cloud={cloud} songs={songs} />
        </DialogContent>
      </Dialog>
      <FullscreenPlayer
        isOpen={isFullscreen}
        onClose={() => setIsFullscreen(false)}
        currentSong={displaySong}
        isPlaying={isPlaying}
        isLoading={isLoadingSong}
        duration={duration}
        volume={volume}
        isMuted={isMuted}
        shuffleMode={shuffleMode}
        songs={songs}
        sortedSongs={sortedSongs}
        viewMode={viewMode}
        onPlayPause={togglePlayPause}
        onSkipNext={skipToNext}
        onSkipPrevious={skipToPrevious}
        onSeek={handleSeek}
        onVolumeChange={changeVolume}
        onToggleMute={toggleMute}
        onToggleShuffle={toggleShuffle}
        onSongSelect={handleSongSelect}
        libraryActions={libraryActions}
        onShowEqualizer={() => returnFocus.open(setShowEqualizer)}
        now={now}
        albumArtSourceRect={albumArtSourceRect}
      />
      {draggingFiles && <DropOverlay busy={libraryBusy} />}
    </div>
  )
}
