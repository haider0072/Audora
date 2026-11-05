"use client"

import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { Slider } from "@/components/ui/slider"
import { toast } from "@/hooks/use-toast"
import { ToastAction } from "@/components/ui/toast"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  Volume2, VolumeX, Settings, Shuffle, Maximize2,
  Search, Music, List, ListMusic, Globe, Library, MonitorSpeaker, Cloud,
} from "lucide-react"

import Image from "next/image"
import { Wordmark } from "@/components/brand/wordmark"
import { PlayButton } from "@/components/player/play-button"
import { QualityLabel } from "@/components/player/quality-label"
import { RollingText } from "@/components/player/rolling-text"
import { SeekBar } from "@/components/player/seek-bar"
import { SkipIcon, TransportButton } from "@/components/player/transport-button"
import { DropOverlay } from "@/components/library/drop-overlay"
import { LibraryPanel } from "@/components/library/library-panel"
import { rowPlayback } from "@/components/library/song-row"
import { LazyNowPanel } from "@/components/now/lazy-now-panel"
import type { NowTab } from "@/components/now/now-tabs"
import { useNowPlayer } from "@/components/now/use-now-player"
import { RefinedEqualizer, type EqualizerBand } from "@/components/refined-equalizer"
import { AlbumArtBackground } from "@/components/album-art-background"
import { AlbumArtDisplay } from "@/components/album-art-display"
import { PlaylistManager } from "@/components/playlist-manager"
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
import { albumPage, artistPage, type LibraryPage } from "@/lib/library-pages"
import { resetPlaybackTime } from "@/lib/playback-time-store"
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

/** The artist and album under the title open their pages in the library. */
const PAGE_LINK_CLASS = "hover:text-foreground hover:underline underline-offset-2 transition-colors duration-attack ease-attack"

export default function EnhancedMusicPlayer() {
  // The Now panel takes the cover's place, and keeps the tab last opened.
  const [nowOpen, setNowOpen] = useState(false)
  const [nowTab, setNowTab] = useState<NowTab>("lyrics")
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [albumArtSourceRect, setAlbumArtSourceRect] = useState<DOMRect | null>(null);
  const [sidebarMode, setSidebarMode] = useState<"library" | "online">("library");
  const [showSync, setShowSync] = useState(false);
  const [showCloud, setShowCloud] = useState(false);
  const [searchQuery, setSearchQuery] = useState("")

  const albumArtRef = useRef<HTMLDivElement>(null)
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
    setSidebarMode("library")
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
      if (settings.volume !== undefined) setVolume([settings.volume])
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
    if (albumArtRef.current) {
      setAlbumArtSourceRect(albumArtRef.current.getBoundingClientRect())
    }
    setIsFullscreen(true)
  }, [])

  const songColors = useSongColors(displaySong)

  return (
    // The desktop player sits on artwork darkened to ink in both themes, so it
    // takes the dark theme's tokens whatever the app theme is.
    <div
      className="dark song-scope min-h-screen max-h-screen overflow-hidden relative text-foreground"
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
      <div className="container mx-auto py-6 relative z-10">
        <div className="relative flex items-center justify-between mb-6 px-6">
          {/* Left: Logo */}
          <div className="flex items-center gap-3">
            <Image src="/icon-192x192.png" alt="Audora" width={32} height={32} className="rounded-lg" />
            {/* Below 1280 px the centred search pill leaves no room beside the icon. */}
            <Wordmark aria-hidden="true" className="hidden text-2xl text-white xl:inline" />
            {isRestoringPlaylist && <span className="type-data text-muted-foreground">Restoring…</span>}
          </div>

          {/* Center: Search + Controls — truly centered via absolute */}
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 w-[620px]">
            {/* Expanded search pill */}
            <div className="relative flex items-center h-12 bg-black/30 backdrop-blur-md border border-white/10 rounded-full overflow-hidden flex-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              <div className="flex-shrink-0 w-12 h-12 flex items-center justify-center">
                <Search className="w-4 h-4 text-white/50" />
              </div>
              <input
                value={sidebarMode === "online" ? tidalSearch.searchQuery : searchQuery}
                onChange={(e) =>
                  sidebarMode === "online"
                    ? tidalSearch.setSearchQuery(e.target.value)
                    : setSearchQuery(e.target.value)
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" && sidebarMode === "online") {
                    e.preventDefault()
                    tidalSearch.search()
                  }
                }}
                placeholder={sidebarMode === "library" ? "Search songs, artists..." : "Search online..."}
                className="flex-1 bg-transparent outline-none text-sm text-white placeholder:text-white/35 min-w-0"
              />
              <div className="flex items-center gap-1 px-2 flex-shrink-0">
                <button
                  onClick={() => setSidebarMode("library")}
                  className={`p-2 rounded-full transition-all duration-200 ${sidebarMode === "library" ? "text-white" : "text-white/40 hover:text-white/70"}`}
                  title="My Library"
                >
                  <Library className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setSidebarMode("online")}
                  className={`relative p-2 rounded-full transition-all duration-200 ${sidebarMode === "online" ? "text-white" : "text-white/40 hover:text-white/70"}`}
                  title="Search Online"
                >
                  <Globe className="w-3.5 h-3.5" />
                  {tidalSearch.activeDownloadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 h-3.5 min-w-[14px] px-0.5 text-[9px] font-bold bg-blue-500 text-white rounded-full flex items-center justify-center">
                      {tidalSearch.activeDownloadCount}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* View toggle — animated sliding pill */}
            {(
              <div className="relative flex items-center h-12 bg-black/30 backdrop-blur-md border border-white/10 rounded-full p-1 flex-shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                {/* Sliding pill */}
                <div
                  className={`absolute top-1 w-10 h-10 bg-white/30 rounded-full transition-transform duration-300 ease-in-out shadow-sm ${
                    viewMode === "list" ? "translate-x-10" : "translate-x-0"
                  }`}
                />
                <button
                  onClick={() => setViewMode("grouped")}
                  className={`relative z-10 w-10 h-10 flex items-center justify-center rounded-full transition-colors duration-200 ${
                    viewMode === "grouped" ? "text-white drop-shadow-sm" : "text-white/40 hover:text-white/65"
                  }`}
                  title="Grouped view"
                >
                  <Music className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={`relative z-10 w-10 h-10 flex items-center justify-center rounded-full transition-colors duration-200 ${
                    viewMode === "list" ? "text-white drop-shadow-sm" : "text-white/40 hover:text-white/65"
                  }`}
                  title="List view"
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
            )}

          </div>

          {/* Right: Actions */}
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
          <div className="flex flex-col h-full overflow-hidden px-6 pb-6 pt-2">
            {nowOpen ? (
              <LazyNowPanel layout="column" tab={nowTab} onTabChange={setNowTab} {...now} />
            ) : displaySong ? (
              <div className="flex-1 min-h-0 min-w-0 flex items-center justify-center [container-type:size]">
                <div ref={albumArtRef} className="aspect-square h-[min(100cqw,100cqh)]">
                  <AlbumArtDisplay
                    songId={displaySong.id}
                    albumArt={displaySong.albumArt}
                    title={`${displaySong.title} album art`}
                    isTransitioning={isLoadingSong}
                    className="!w-full !h-full shadow-2xl shadow-black/30"
                  />
                </div>
              </div>
            ) : (
              <div className="flex-1" />
            )}

            {displaySong && (
              <div className="flex flex-shrink-0 items-center gap-4 min-w-0 pt-4 pb-2">
                {/* With the panel open, the cover sits beside the title. */}
                {nowOpen && (
                  <div ref={albumArtRef} className="flex-shrink-0">
                    <AlbumArtDisplay
                      songId={displaySong.id}
                      albumArt={displaySong.albumArt}
                      thumbnail={displaySong.albumArtThumb}
                      title={`${displaySong.title} album art`}
                      size="medium"
                      rounded="rounded-lg"
                      isTransitioning={isLoadingSong}
                    />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-2xl font-semibold leading-tight tracking-[-0.02em]">
                    <RollingText text={displaySong.title || "Unknown title"} direction={changeDirection} />
                  </h2>
                  <p className="mt-1 text-base text-muted-foreground">
                    <RollingText
                      text={[displaySong.artist, displaySong.album].filter(Boolean).join(" \u2014 ")}
                      direction={changeDirection}
                    >
                      {displaySong.artist && (
                        <button
                          type="button"
                          onClick={() => showInLibrary(artistPage(displaySong))}
                          className={PAGE_LINK_CLASS}
                          title={`Go to ${displaySong.artist}`}
                        >
                          {displaySong.artist}
                        </button>
                      )}
                      {displaySong.artist && displaySong.album && " \u2014 "}
                      {displaySong.album && (
                        <button
                          type="button"
                          onClick={() => showInLibrary(albumPage(displaySong))}
                          className={PAGE_LINK_CLASS}
                          title={`Go to ${displaySong.album}`}
                        >
                          {displaySong.album}
                        </button>
                      )}
                    </RollingText>
                  </p>
                  <QualityLabel song={displaySong} withBitrate className="mt-2" />
                </div>
              </div>
            )}

            <div className="flex-shrink-0 space-y-2">
              {/* While a pick loads, the bar already belongs to it: empty, at its length. */}
              <SeekBar
                duration={isLoadingSong ? (displaySong?.duration ?? 0) : duration}
                onSeek={handleSeek}
                isPlaying={isPlaying}
                disabled={isLoadingSong}
              />

              {/* Transport: shuffle, prev, play, next */}
              <div className="flex items-center justify-center gap-5">
                <TransportButton label="Shuffle" size="sm" pressed={shuffleMode} onClick={toggleShuffle}>
                  <Shuffle className="h-4 w-4" />
                </TransportButton>
                <TransportButton label="Previous track" onClick={skipToPrevious} disabled={songs.length === 0}>
                  <SkipIcon direction="back" />
                </TransportButton>
                <PlayButton
                  isPlaying={isPlaying}
                  isLoading={isLoadingSong}
                  onClick={() => void togglePlayPause()}
                  disabled={!displaySong}
                />
                <TransportButton label="Next track" onClick={skipToNext} disabled={songs.length === 0}>
                  <SkipIcon direction="forward" />
                </TransportButton>
                {/* Balances the shuffle button so play sits at the centre. */}
                <div className="h-9 w-9" aria-hidden="true" />
              </div>

              {/* Secondary controls */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <TransportButton label="Equalizer settings" size="xs" onClick={() => setShowEqualizer(true)}>
                    <Settings className="h-4 w-4" />
                  </TransportButton>
                  <TransportButton
                    label="Play on two devices"
                    size="xs"
                    className={syncConnected ? "text-primary" : undefined}
                    onClick={() => setShowSync(true)}
                  >
                    <MonitorSpeaker className="h-4 w-4" />
                  </TransportButton>
                  <TransportButton
                    label="Cloud library"
                    size="xs"
                    className={cloud.status === "ready" ? "text-primary" : undefined}
                    onClick={() => setShowCloud(true)}
                  >
                    <Cloud className="h-4 w-4" />
                  </TransportButton>
                </div>
                <div className="flex items-center gap-1">
                  <TransportButton
                    label="Now playing"
                    title="Lyrics, queue, about and video"
                    size="xs"
                    pressed={nowOpen}
                    onClick={() => setNowOpen((open) => !open)}
                  >
                    <ListMusic className="h-4 w-4" />
                  </TransportButton>
                  <TransportButton label={isMuted ? "Unmute" : "Mute"} size="xs" onClick={toggleMute}>
                    {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  </TransportButton>
                  <Slider value={volume} max={100} step={1} onValueChange={changeVolume} className="w-20 [&_[role=slider]]:h-3.5 [&_[role=slider]]:w-3.5 [&_[role=slider]]:opacity-0 [&_[role=slider]]:transition-all [&_[role=slider]]:duration-200 [&_[role=slider]]:ease-out hover:[&_[role=slider]]:opacity-100 [&>span:first-child]:h-1" aria-label="Volume" />
                  <TransportButton label="Fullscreen" size="xs" onClick={handleOpenFullscreen} disabled={!currentSong}>
                    <Maximize2 className="h-4 w-4" />
                  </TransportButton>
                </div>
              </div>
            </div>
          </div>
          <div className="h-full bg-transparent overflow-hidden">
            {sidebarMode === "online" ? (
              <div className="flex h-full flex-col px-6">
                <div className="min-h-0 flex-1">
                  <OnlineSearchSidebar dab={tidalSearch} hideSearch />
                </div>
              </div>
            ) : (
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
            )}
          </div>
        </div>
      </div>
      <Dialog open={showEqualizer} onOpenChange={setShowEqualizer}>
        <DialogContent>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Two-device playback</DialogTitle>
          </DialogHeader>
          <SyncPanel sync={sync} />
        </DialogContent>
      </Dialog>
      <Dialog open={showCloud} onOpenChange={setShowCloud}>
        <DialogContent>
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
        onShowEqualizer={() => setShowEqualizer(true)}
        now={now}
        albumArtSourceRect={albumArtSourceRect}
      />
      {draggingFiles && <DropOverlay busy={libraryBusy} />}
    </div>
  )
}
