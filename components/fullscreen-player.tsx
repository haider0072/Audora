"use client"

import { useEffect, useLayoutEffect, useRef, useState, type TransitionEvent } from "react"
import { ListMusic, Minimize2, Settings, Shuffle, Volume2, VolumeX, X } from "lucide-react"

import { VolumeSlider } from "@/components/player/volume-slider"
import { useInert } from "@/hooks/use-inert"
import { useLibraryNavigation } from "@/hooks/use-library-navigation"
import type { Song } from "@/lib/song"
import { AlbumArtDisplay } from "./album-art-display"
import { AlbumArtBackground } from "./album-art-background"
import { LibraryPanel } from "./library/library-panel"
import { rowPlayback } from "./library/song-row"
import type { LibraryActions } from "./library/use-row-actions"
import { LazyNowPanel } from "./now/lazy-now-panel"
import type { NowPlayerProps } from "./now/now-panel"
import { NOW_TABS, type NowTab } from "./now/now-tabs"
import { PlayButton } from "./player/play-button"
import { QualityLabel } from "./player/quality-label"
import { SeekBar } from "./player/seek-bar"
import { SkipIcon, TransportButton } from "./player/transport-button"

/** The side panel's tabs: the Now panel's, with the library one tap away. */
const SIDE_TABS: readonly NowTab[] = [...NOW_TABS, "library"]
/** As long as the exit transitions below take; the player unmounts once they are done. */
const EXIT_MS = 500
/** Lifts the cover off the song's colours behind it. */
const COVER_SHADOW = { boxShadow: "0 52px 52px -20px hsl(var(--ink-0) / 0.3), 0 4px 20px hsl(var(--ink-0) / 0.1)" }

/** Where `target` has to move, and how much it has to shrink, to sit over `source`. */
function flipFrom(source: DOMRect, target: DOMRect): string {
  const dx = source.left + source.width / 2 - (target.left + target.width / 2)
  const dy = source.top + source.height / 2 - (target.top + target.height / 2)
  return `translate(${dx}px, ${dy}px) scale(${source.width / target.width})`
}

interface FullscreenPlayerProps {
  isOpen: boolean
  onClose: () => void
  currentSong: Song | null
  isPlaying: boolean
  duration: number
  volume: number[]
  isMuted: boolean
  shuffleMode: boolean
  /** A picked song is loading. */
  isLoading: boolean
  songs: Song[]
  sortedSongs: Song[]
  viewMode: "grouped" | "list"
  onPlayPause: () => void
  onSkipNext: () => void
  onSkipPrevious: () => void
  onSeek: (seconds: number) => void
  onVolumeChange: (value: number[]) => void
  onToggleMute: () => void
  onToggleShuffle: () => void
  onSongSelect: (song: Song) => void
  /** What a song's menu in the library can do. */
  libraryActions: LibraryActions
  onShowEqualizer: () => void
  /** What the side panel's lyrics, queue, about and video show. */
  now: NowPlayerProps
  albumArtSourceRect?: DOMRect | null
}

export function FullscreenPlayer({
  isOpen,
  onClose,
  currentSong,
  isPlaying,
  duration,
  volume,
  isMuted,
  shuffleMode,
  isLoading,
  songs,
  sortedSongs,
  viewMode,
  onPlayPause,
  onSkipNext,
  onSkipPrevious,
  onSeek,
  onVolumeChange,
  onToggleMute,
  onToggleShuffle,
  onSongSelect,
  libraryActions,
  onShowEqualizer,
  now,
  albumArtSourceRect,
}: FullscreenPlayerProps) {
  // Opening mounts the player at once; it shows a frame later, so its entrance
  // transitions have a start to run from. Closing hides it at once, and it
  // unmounts once the exit transitions are done.
  const [mounted, setMounted] = useState(false)
  const [entered, setEntered] = useState(false)
  if (isOpen && !mounted) setMounted(true)
  const visible = isOpen && entered
  // The side panel slides in and out; its content stays while it slides away,
  // and goes once it is out of sight, so a closed panel does no work.
  const [sideOpen, setSideOpen] = useState(false)
  const [sideMounted, setSideMounted] = useState(false)
  const [sideTab, setSideTab] = useState<NowTab>("lyrics")
  const sideRef = useRef<HTMLDivElement>(null)
  // Taken from the panel once it is drawn, which is when `mounted` turns true.
  useInert(sideRef, mounted && !sideOpen)
  const libraryNavigation = useLibraryNavigation(sortedSongs)

  // FLIP animation refs
  const albumArtAnimRef = useRef<HTMLDivElement>(null)
  const hasAnimatedInRef = useRef(false)

  useEffect(() => {
    if (!mounted) return
    if (isOpen) {
      // Two frames: the first paints the start state, the second moves off it.
      let inner = 0
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setEntered(true))
      })
      return () => {
        cancelAnimationFrame(outer)
        cancelAnimationFrame(inner)
      }
    }
    const timer = setTimeout(() => {
      setMounted(false)
      setEntered(false)
      setSideOpen(false)
      setSideMounted(false)
      hasAnimatedInRef.current = false
    }, EXIT_MS)
    return () => clearTimeout(timer)
  }, [isOpen, mounted])

  // FLIP: Position album art at source rect before first paint
  useLayoutEffect(() => {
    if (!mounted || hasAnimatedInRef.current) return
    const el = albumArtAnimRef.current
    if (!el || !albumArtSourceRect) return
    el.style.transition = "none"
    el.style.transform = flipFrom(albumArtSourceRect, el.getBoundingClientRect())
  }, [mounted, albumArtSourceRect])

  // FLIP: Animate album art in when visible, out when closing
  useEffect(() => {
    if (!mounted) return
    const el = albumArtAnimRef.current
    if (!el || !albumArtSourceRect) return

    if (visible) {
      // Animate IN: from source position to center. Opened again while it was
      // still leaving, it comes back from wherever it had got to.
      hasAnimatedInRef.current = true
      requestAnimationFrame(() => {
        el.style.transition = "transform 600ms cubic-bezier(0.25, 0.1, 0.25, 1)"
        el.style.transform = "none"
      })
    } else if (hasAnimatedInRef.current) {
      // Animate OUT: from center back to source position
      el.style.transition = "transform 500ms cubic-bezier(0.25, 0.1, 0.25, 1)"
      el.style.transform = flipFrom(albumArtSourceRect, el.getBoundingClientRect())
    }
  }, [mounted, visible, albumArtSourceRect])

  // Escape leaves full screen, unless something inside it took the key first:
  // a song's menu closing, or a library page going back.
  useEffect(() => {
    if (!isOpen) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) onClose()
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [isOpen, onClose])

  if (!mounted) return null

  const toggleSide = () => {
    if (!sideOpen) setSideMounted(true)
    setSideOpen(!sideOpen)
  }
  const sideSlid = (event: TransitionEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && !sideOpen) setSideMounted(false)
  }
  const cover = currentSong && (
    <AlbumArtDisplay
      songId={currentSong.id}
      albumArt={currentSong.albumArt}
      title={`${currentSong.title} album art`}
      isTransitioning={isLoading}
      className="w-80 h-80 lg:w-96 lg:h-96"
      style={COVER_SHADOW}
    />
  )

  return (
    // Always night: the dark theme's colours, and the song's colours for ink, whatever the app's theme.
    <div className="song-scope dark fixed inset-0 z-50 bg-black text-foreground">
      {/* Background - instant on open, fades out on close */}
      <div className={`absolute inset-0 ${!isOpen && mounted ? "transition-opacity duration-500 ease-out opacity-0" : ""}`}>
        <AlbumArtBackground
          albumArt={currentSong?.albumArt}
          songId={currentSong?.id}
          isTransitioning={isLoading}
          positioning="absolute"
        />
      </div>

      {/* Header */}
      <div
        className={`
          absolute top-0 left-0 right-0 h-14 flex items-center justify-between px-6 z-20
          transition-all duration-500 ease-out delay-100
          ${visible ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0"}
        `}
      >
        <TransportButton label="Exit fullscreen" size="xs" onClick={onClose}>
          <Minimize2 className="h-4 w-4" />
        </TransportButton>
        <span className="text-sm text-muted-foreground font-medium truncate max-w-md">
          {currentSong?.artist || ""}
        </span>
      </div>

      {/* Main content - centered album art */}
      <div
        className={`
          absolute inset-0 flex items-center justify-center pb-20 pt-14 z-10
          transition-all duration-500 ease-out
          ${sideOpen ? "pr-[380px]" : "pr-0"}
        `}
      >
        {currentSong ? (
          <div className="flex flex-col items-center gap-6">
            {/* The cover flies over from the player's when its place there is known, or grows in place. */}
            {albumArtSourceRect ? (
              <div ref={albumArtAnimRef} style={{ willChange: "transform" }}>
                {cover}
              </div>
            ) : (
              <div
                className={`
                  transition-all duration-700 ease-out
                  ${visible ? "scale-100 opacity-100" : "scale-75 opacity-0"}
                `}
              >
                {cover}
              </div>
            )}
            {/* Title and album - fade in with delay */}
            <div
              className={`
                text-center space-y-1 transition-all duration-500 ease-out delay-200
                ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}
              `}
            >
              <h2 className="text-2xl font-bold truncate max-w-md">{currentSong.title}</h2>
              {currentSong.album && (
                <p className="text-sm text-muted-foreground">{currentSong.album}</p>
              )}
              <QualityLabel song={currentSong} withBitrate className="pt-1" />
            </div>
          </div>
        ) : (
          <div className={`text-muted-foreground text-lg transition-opacity duration-500 ${visible ? "opacity-100" : "opacity-0"}`}>
            No song playing
          </div>
        )}
      </div>

      {/* The side panel: lyrics, the queue, about, video, and the library. */}
      <div
        className={`
          absolute top-0 right-0 bottom-[72px] w-[380px] bg-background/60 backdrop-blur-md border-l border-foreground/10 z-20
          transition-transform
          ${sideOpen ? "translate-x-0 duration-decay ease-decay" : "translate-x-full duration-release ease-release"}
        `}
        ref={sideRef}
        onTransitionEnd={sideSlid}
      >
        {sideMounted && (
          <LazyNowPanel
            layout="side"
            tabs={SIDE_TABS}
            tab={sideTab}
            onTabChange={setSideTab}
            {...now}
            library={
              <LibraryPanel
                layout="desktop"
                songs={sortedSongs}
                viewMode={viewMode}
                currentSongId={currentSong?.id}
                playback={rowPlayback(isLoading, isPlaying)}
                onSelect={onSongSelect}
                actions={libraryActions}
                navigation={libraryNavigation}
              />
            }
            trailing={
              <TransportButton label="Close the panel" size="xs" onClick={toggleSide}>
                <X className="h-4 w-4" />
              </TransportButton>
            }
          />
        )}
      </div>

      {/* Bottom bar */}
      <div
        className={`
          absolute bottom-0 left-0 right-0 h-[72px] bg-black/80 backdrop-blur-md border-t border-foreground/10
          flex items-center px-4 gap-4 z-20
          transition-all duration-500 ease-out delay-150
          ${visible ? "translate-y-0 opacity-100" : "translate-y-full opacity-0"}
        `}
      >
        {/* Left: Song info */}
        <div className="flex items-center gap-3 w-[240px] flex-shrink-0">
          {currentSong && (
            <>
              <AlbumArtDisplay
                songId={currentSong.id}
                albumArt={currentSong.albumArt}
                thumbnail={currentSong.albumArtThumb}
                title={`${currentSong.title} album art`}
                size="small"
                className="flex-shrink-0"
              />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{currentSong.title}</p>
                <p className="text-xs text-muted-foreground truncate">{currentSong.artist || "Unknown Artist"}</p>
              </div>
            </>
          )}
        </div>

        {/* Center: Controls + Seekbar */}
        <div className="flex-1 flex flex-col items-center gap-1 max-w-2xl mx-auto">
          {/* Controls */}
          <div className="flex items-center gap-3">
            <TransportButton label="Shuffle" size="sm" pressed={shuffleMode} onClick={onToggleShuffle}>
              <Shuffle className="h-3.5 w-3.5" />
            </TransportButton>
            <TransportButton label="Previous track" size="sm" onClick={onSkipPrevious} disabled={songs.length === 0}>
              <SkipIcon direction="back" size="sm" />
            </TransportButton>
            <PlayButton size="sm" isPlaying={isPlaying} isLoading={isLoading} onClick={onPlayPause} disabled={!currentSong} />
            <TransportButton label="Next track" size="sm" onClick={onSkipNext} disabled={songs.length === 0}>
              <SkipIcon direction="forward" size="sm" />
            </TransportButton>
            {/* Balances the shuffle button so play sits at the centre. */}
            <div className="h-9 w-9" aria-hidden="true" />
          </div>
          {/* While a pick loads, the bar already belongs to it: empty, at its length. */}
          <SeekBar
            className="w-full"
            duration={isLoading ? (currentSong?.duration ?? 0) : duration}
            onSeek={onSeek}
            isPlaying={isPlaying}
            disabled={isLoading}
            timesPosition="sides"
          />
        </div>

        {/* Right: Utility buttons + Volume */}
        <div className="flex items-center gap-1 w-[240px] flex-shrink-0 justify-end">
          <TransportButton label="Equalizer settings" size="xs" onClick={onShowEqualizer}>
            <Settings className="h-4 w-4" />
          </TransportButton>
          <TransportButton
            label="Now playing"
            title="Lyrics, queue, about, video and the library"
            size="xs"
            pressed={sideOpen}
            onClick={toggleSide}
          >
            <ListMusic className="h-4 w-4" />
          </TransportButton>
          <div className="flex items-center gap-1 ml-1">
            <TransportButton label={isMuted ? "Unmute" : "Mute"} size="xs" onClick={onToggleMute}>
              {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </TransportButton>
            <VolumeSlider value={volume} onValueChange={onVolumeChange} muted={isMuted} className="w-20" />
          </div>
        </div>
      </div>
    </div>
  )
}
