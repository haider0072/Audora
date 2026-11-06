"use client"

import { useState, useRef, useEffect, useCallback, useId, useLayoutEffect, useMemo, type ReactNode, type RefObject } from "react"
import Image from "next/image"
import { Maximize2, Settings, X } from "lucide-react"

import { toast } from "@/hooks/use-toast"
import { ToastAction } from "@/components/ui/toast"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  focusSheetOnOpen,
} from "@/components/ui/sheet"
import { AddMusicMenu } from "@/components/desktop/add-music-menu"
import { CloudButton, DownloadsButton, SearchButton } from "@/components/desktop/library-tools"
import { NowStage } from "@/components/desktop/now-stage"
import { SearchField } from "@/components/desktop/search-field"
import { SearchPane } from "@/components/desktop/search-pane"
import { SettingsView } from "@/components/desktop/settings-view"
import { SongRoom } from "@/components/desktop/song-room"
import { SongViews, VIEW_SOURCES, type DesktopView } from "@/components/desktop/song-views"
import { UpNext } from "@/components/desktop/up-next"
import { BackHeader, ViewHeader, ViewModeToggle } from "@/components/desktop/view-header"
import { LazyNowView } from "@/components/now/lazy-now-view"
import { NOW_TAB_LABELS } from "@/components/now/now-tabs"
import { TransportButton } from "@/components/player/transport-button"
import { DropOverlay } from "@/components/library/drop-overlay"
import { LibraryPanel } from "@/components/library/library-panel"
import { rowPlayback } from "@/components/library/song-row"
import { StackLayer } from "@/components/stack-layer"
import { useNowPlayer } from "@/components/now/use-now-player"
import { SoundPanel } from "@/components/sound/sound-panel"
import { useBodyClass } from "@/hooks/use-body-class"
import { useDesktopFullscreen } from "@/hooks/use-desktop-fullscreen"
import { useDesktopPane } from "@/hooks/use-desktop-pane"
import { useDesktopSearch } from "@/hooks/use-desktop-search"
import { useSearchShortcut } from "@/hooks/use-search-shortcut"
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
import { AlbumArtCache } from "@/lib/album-art-cache"
import { getAllPresets, type EqPreset, type EqualizerBand } from "@/lib/eq-presets"
import type { LibraryPage } from "@/lib/library-pages"
import { resetPlaybackTime } from "@/lib/playback-time-store"
import { formatCount, formatTotalDuration } from "@/lib/utils"
import { withViewTransition } from "@/lib/view-transition"
import { SyncPanel } from "@/components/sync-panel"
import { CloudLibraryPanel } from "@/components/cloud-library-panel"
import { useCloudLibrary } from "@/hooks/use-cloud-library"
import { useStreamInfoBackfill } from "@/hooks/use-stream-info-backfill"
import { useCloudUploadSync } from "@/hooks/use-cloud-upload-sync"
import { useDownloadTarget } from "@/hooks/use-download-target"
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
  const [showSync, setShowSync] = useState(false);
  const [showCloud, setShowCloud] = useState(false);
  // The Sound sheet, two-device playback and the cloud library open from a
  // menu, the library's tools, Settings or full screen, and hand focus back
  // to what opened them.
  const returnFocus = useReturnFocus()
  const viewIds = useId()

  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchButtonRef = useRef<HTMLButtonElement>(null)
  const settingsToggleRef = useRef<HTMLButtonElement>(null)
  // Full screen's ways in, in a view's head and in the stage's More, and its
  // way out, in the brand's corner.
  const fullscreenButtonRef = useRef<HTMLButtonElement>(null)
  const stageMoreRef = useRef<HTMLButtonElement>(null)
  const fullscreenExitRef = useRef<HTMLButtonElement>(null)
  // A tool in the library's head to hand focus to once the head is back, as
  // the search or Settings closes from the keyboard.
  const focusOnLibrary = useRef<RefObject<HTMLElement> | null>(null)
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

  // The cloud library, which waits for the saved library to be restored, comes
  // before the online search, whose downloads go up to it.
  const { isInitialized, isRestoringPlaylist, restorePlaylist, savePlaylist } = usePlaylistPersistence()
  const cloud = useCloudLibrary({ isReady: isInitialized, songCount: songs.length, setSongs })
  useCloudUploadSync(cloud.refresh)
  const [downloadTarget, setDownloadTarget] = useDownloadTarget()

  // Tidal online search & download
  const tidalSearch = useTidalSearch({
    songs,
    onSongDownloaded: (newSong) => {
      setSongs((prev) => [...prev, newSong])
      // Downloads go up to the cloud library too, so the other devices get them.
      if (newSong.file) cloud.upload([newSong.file])
    },
    downloadTarget,
    cloudReady: cloud.status === "ready",
    onSavedToCloud: cloud.refresh,
    // Whenever a search-result preview starts, silence the main library
    // playback so the two streams don't overlap.
    onPreviewStart: () => {
      if (audioRef.current && !audioRef.current.paused) {
        pause()
      }
    },
  })

  // One search, in the library's head, for the library and online; and the
  // right half, which shows the library or one thing at a time in its place.
  const search = useDesktopSearch(tidalSearch)
  const panes = useDesktopPane(search)
  // On the way out of full screen, focus with nowhere else to go takes a way
  // back in: the button in a view's head while one is open, or More.
  const fullscreenReturn = useCallback(() => fullscreenButtonRef.current ?? stageMoreRef.current, [])
  // Full screen: the frame without the library, the song alone or beside its
  // open view. The search and Settings are the library's, so they close.
  const fullscreen = useDesktopFullscreen({
    exitRef: fullscreenExitRef,
    returnTo: fullscreenReturn,
    onEnter: panes.closeSearchAndSettings,
  })
  const { exitWith: exitFullscreenWith } = fullscreen
  const libraryNavigation = useLibraryNavigation(sortedSongs)
  const { show: showLibraryPage } = libraryNavigation
  const { showLibrary } = panes

  /**
   * Show an artist's or an album's page, from the player or the search: in
   * the library, in place of anything open there, and out of full screen in
   * the same step, so the page opens in sight and takes focus.
   */
  const showInLibrary = useCallback((page: LibraryPage) => {
    exitFullscreenWith(() => {
      showLibrary()
      showLibraryPage(page)
    })
  }, [exitFullscreenWith, showLibrary, showLibraryPage])

  useSearchShortcut(() => {
    // The search is the library's, so it brings the library back, out of
    // full screen in the same step, so the field can take focus.
    exitFullscreenWith(() => {
      if (!search.active) {
        // The field takes focus as it comes out.
        panes.startSearch()
        return
      }
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    })
  })

  // Runs once the library's head is back, so the tool it hands focus to is there.
  useLayoutEffect(() => {
    if (panes.pane !== "library") return
    const target = focusOnLibrary.current
    focusOnLibrary.current = null
    target?.current?.focus()
  }, [panes.pane])

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
  // As the equalizer itself names it.
  const soundPreset = eqPresets.find((preset) => preset.id === activeEqPresetId)?.name ?? "Custom"

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

  useStreamInfoBackfill(songs, setSongs)
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

  // When library playback resumes, kill any preview stream.
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

  const songColors = useSongColors(displaySong)

  const totalDuration = useMemo(() => songs.reduce((total, song) => total + (song.duration || 0), 0), [songs])
  let libraryMeta: string | undefined
  if (isRestoringPlaylist) libraryMeta = "Restoring…"
  else if (songs.length > 0) libraryMeta = `${formatCount(songs.length, "song")} · ${formatTotalDuration(totalDuration)}`
  const downloads = tidalSearch.activeDownloadCount
  // Declared after every memoized callback: the compiler takes a call into
  // returnFocus as able to change what it is given, so declared earlier these
  // would hold the memoized callbacks back from being memoized.
  const openSound = () => returnFocus.open(setShowEqualizer)
  const openSync = () => returnFocus.open(setShowSync)
  const openCloud = () => returnFocus.open(setShowCloud)

  // The right half of the window: the library, or in its place the search's
  // results once something is typed, one of the song's views, or Settings.
  const { pane, view } = panes
  // Full screen with no view open: the song alone, the right half out of
  // sight and so out of reach, as CSS hides it (`[data-solo]`). Hidden by
  // style rather than made inert, so it is back within reach in the same
  // commit that brings it back, before what mounts in it asks for focus.
  const solo = fullscreen.full && pane !== "view"
  const showView = (next: DesktopView | null) => {
    // In full screen a view opening or closing moves the song, so it glides there.
    if (fullscreen.full) withViewTransition(() => panes.setView(next))
    else panes.setView(next)
  }
  const typed = search.query.trim()
  const showResults = pane === "search" && typed !== ""
  // Typed since the last online search: the results offer to look for it.
  const pendingOnline = typed !== "" && typed !== tidalSearch.searchQuery ? typed : undefined
  const viewId = (songView: DesktopView) => `${viewIds}-${songView}`
  const closeSearch = () => {
    search.close()
    // The field goes with the search; the button that brings it back takes focus.
    focusOnLibrary.current = searchButtonRef
  }
  const closeSettings = () => {
    panes.closeSettings()
    // Done goes with Settings; its button in the library's head brings it back.
    focusOnLibrary.current = settingsToggleRef
  }
  const closeView = () => {
    panes.setView(null)
    // Back goes with the view; the word that opened it takes focus.
    if (view) document.getElementById(viewId(view))?.focus()
  }

  let sideHead: ReactNode
  if (pane === "search") {
    sideHead = (
      <SearchField
        value={search.query}
        onChange={search.setQuery}
        onSubmit={search.submit}
        onClose={closeSearch}
        inputRef={searchInputRef}
      />
    )
  } else if (pane === "settings") {
    sideHead = (
      <ViewHeader title="Settings">
        <button type="button" className="text-button" onClick={closeSettings}>
          Done
        </button>
      </ViewHeader>
    )
  } else if (pane === "view" && view) {
    sideHead = (
      <BackHeader to="Library" onBack={closeView} meta={VIEW_SOURCES[view]}>
        <TransportButton
          ref={fullscreenButtonRef}
          label="Full screen"
          size="sm"
          className="round-glass"
          disabled={!displaySong}
          onClick={fullscreen.enter}
        >
          <Maximize2 className="h-4 w-4" />
        </TransportButton>
      </BackHeader>
    )
  } else {
    sideHead = (
      <ViewHeader title="Library" meta={libraryMeta}>
        <ViewModeToggle value={viewMode} onChange={setViewMode} />
        <SearchButton ref={searchButtonRef} onOpen={panes.startSearch} />
        <DownloadsButton count={downloads} onOpen={panes.showOnline} />
        <CloudButton status={cloud.status} onOpen={openCloud} />
        <AddMusicMenu
          busy={libraryBusy}
          syncing={isSyncing}
          fileInputRef={fileInputRef}
          folderInputRef={folderInputRef}
          syncInputRef={syncInputRef}
          onFiles={handleFileUpload}
          onFolder={handleFolderUpload}
          onSync={handleFolderSync}
        />
        <TransportButton ref={settingsToggleRef} label="Settings" size="md" className="tool-button" onClick={panes.toggleSettings}>
          <Settings aria-hidden="true" />
        </TransportButton>
      </ViewHeader>
    )
  }

  return (
    // The desktop sits on ink lit by the song's colours in both themes, so it
    // takes the dark theme's tokens whatever the app theme is.
    <div
      className="dark song-scope desktop-frame"
      style={songColors}
      data-playing={isPlaying || undefined}
      data-full={fullscreen.full || undefined}
      data-solo={solo || undefined}
      data-idle={fullscreen.idle || undefined}
    >
      <SongRoom />
      {/* crossOrigin: cloud songs stream from R2, and Web Audio outputs silence for a cross-origin element without CORS */}
      <audio ref={audioRef} preload="metadata" crossOrigin="anonymous" className="hidden" />
      <audio ref={secondaryAudioRef} preload="metadata" crossOrigin="anonymous" className="hidden" />
      {/* Screen reader announcements for song changes */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {currentSong && `Now playing: ${currentSong.title}${currentSong.artist ? ` by ${currentSong.artist}` : ""}`}
      </div>
      <main className="desktop-body">
        {/* No header bar: the brand sits over the song, the library's tools in
            its own head. In full screen the way out takes the brand's place. */}
        <div className="desktop-corner">
          {fullscreen.full ? (
            <TransportButton
              ref={fullscreenExitRef}
              label="Exit full screen"
              size="md"
              className="round-glass full-exit"
              onClick={fullscreen.exit}
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </TransportButton>
          ) : (
            <Image src="/icon-192x192.png" alt="Audora" width={40} height={40} className="desktop-mark" priority />
          )}
        </div>
        <NowStage
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
          volume={volume}
          isMuted={isMuted}
          onVolumeChange={changeVolume}
          onToggleMute={toggleMute}
          onShowPage={showInLibrary}
          fullscreen={fullscreen.full}
          onToggleFullscreen={fullscreen.toggle}
          moreRef={stageMoreRef}
          onOpenSound={openSound}
          onOpenSync={openSync}
          syncConnected={syncConnected}
          views={<SongViews value={view} onChange={showView} viewId={viewId} />}
        />
        <div className="desktop-side">
          {/* Full screen has no library to head, only the song's open view. */}
          {!fullscreen.full && sideHead}
          {/* The library stays mounted under whatever opens in its place, so it
              comes back where it was left. */}
          <div className="desktop-side-stack">
            <StackLayer covered={showResults || pane === "view" || pane === "settings"} className="desktop-layer desktop-library">
              <UpNext
                queued={now.queue.queued}
                onPlayQueued={now.queue.onPlayQueued}
                playNext={playNext}
                addToQueue={addToQueue}
                onDequeue={now.queue.onDequeue}
                onClear={now.queue.onClear}
              />
              <LibraryPanel
                layout="desktop"
                songs={sortedSongs}
                viewMode={viewMode}
                currentSongId={displaySong?.id}
                playback={rowPlayback(isLoadingSong, isPlaying)}
                loading={isLoadingSongs || isRestoringPlaylist || cloud.status === "loading"}
                importProgress={isLoadingSongs ? loadingProgress : null}
                onSelect={handleSongSelect}
                actions={libraryActions}
                navigation={libraryNavigation}
                emptyAction={addFolderAction}
              />
            </StackLayer>
            {showResults && (
              <div className="desktop-layer">
                <SearchPane
                  query={search.query}
                  songs={sortedSongs}
                  viewMode={viewMode}
                  onViewModeChange={setViewMode}
                  currentSongId={displaySong?.id}
                  playback={rowPlayback(isLoadingSong, isPlaying)}
                  onSelect={handleSongSelect}
                  actions={libraryActions}
                  onShowPage={showInLibrary}
                  online={tidalSearch}
                  pendingQuery={pendingOnline}
                  onSearchPending={search.submit}
                />
              </div>
            )}
            {pane === "view" && view && (
              <section key={view} className="desktop-layer side-view" aria-label={NOW_TAB_LABELS[view]}>
                <LazyNowView tab={view} {...now} />
              </section>
            )}
            {pane === "settings" && (
              <div className="desktop-layer">
                <SettingsView
                  soundPreset={soundPreset}
                  normalization={normalizationEnabled}
                  onOpenSound={openSound}
                  cloudStatus={cloud.status}
                  cloudSongCount={cloud.songCount}
                  onOpenCloud={openCloud}
                  syncConnected={syncConnected}
                  onOpenSync={openSync}
                  downloadTarget={downloadTarget}
                  onDownloadTargetChange={setDownloadTarget}
                  songCount={songs.length}
                  onReset={resetPlaylist}
                />
              </div>
            )}
          </div>
        </div>
      </main>
      {/* The sheet and the dialogs are portalled out of the player, so each carries the song's colours itself. */}
      <Sheet open={showEqualizer} onOpenChange={setShowEqualizer}>
        <SheetContent
          className="song-scope"
          style={songColors}
          onOpenAutoFocus={focusSheetOnOpen}
          onCloseAutoFocus={returnFocus.onCloseAutoFocus}
        >
          <SheetHeader>
            <SheetTitle>Sound</SheetTitle>
            <SheetDescription>The equalizer, its preamp, and loudness normalization.</SheetDescription>
          </SheetHeader>
          <SoundPanel
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
        </SheetContent>
      </Sheet>
      <Dialog open={showSync} onOpenChange={setShowSync}>
        {/* Its panel explains itself, so the dialog has no separate description. */}
        <DialogContent
          className="song-scope"
          style={songColors}
          aria-describedby={undefined}
          onCloseAutoFocus={returnFocus.onCloseAutoFocus}
        >
          <DialogHeader>
            <DialogTitle>Two-device playback</DialogTitle>
          </DialogHeader>
          <SyncPanel sync={sync} />
        </DialogContent>
      </Dialog>
      <Dialog open={showCloud} onOpenChange={setShowCloud}>
        {/* Its panel explains itself, so the dialog has no separate description. */}
        <DialogContent
          className="song-scope"
          style={songColors}
          aria-describedby={undefined}
          onCloseAutoFocus={returnFocus.onCloseAutoFocus}
        >
          <DialogHeader>
            <DialogTitle>Cloud library</DialogTitle>
          </DialogHeader>
          <CloudLibraryPanel cloud={cloud} songs={songs} />
        </DialogContent>
      </Dialog>
      {draggingFiles && <DropOverlay busy={libraryBusy} />}
    </div>
  )
}
