"use client"

import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import {
  Play, Pause, SkipBack, SkipForward,
  Volume2, VolumeX, Settings, Mic, Youtube, Sparkles,
  Shuffle, Minimize2, ListMusic, X, User,
} from "lucide-react"
import { AlbumArtDisplay } from "./album-art-display"
import { AlbumArtBackground } from "./album-art-background"
import { EnhancedPlaylist, type Song } from "./enhanced-playlist"
import { formatTime } from "@/lib/utils"
import { useState, useEffect, useLayoutEffect, useCallback, useRef } from "react"

interface FullscreenPlayerProps {
  isOpen: boolean
  onClose: () => void
  currentSong: Song | null
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number[]
  isMuted: boolean
  shuffleMode: boolean
  isTransitioning: boolean
  songs: Song[]
  sortedSongs: Song[]
  viewMode: "grouped" | "list"
  onViewModeChange: (mode: "grouped" | "list") => void
  onPlayPause: () => void
  onSkipNext: () => void
  onSkipPrevious: () => void
  onSeek: (value: number[]) => void
  onVolumeChange: (value: number[]) => void
  onToggleMute: () => void
  onToggleShuffle: () => void
  onSongSelect: (song: Song) => void
  onSongRemove: (songId: string) => void
  onSongPlayNext: (song: Song) => void
  onShowEqualizer: () => void
  onShowLyrics: () => void
  onShowYoutube: () => void
  onShowInsights: () => void
  onShowArtist: () => void
  albumArtSourceRect?: DOMRect | null
}

export function FullscreenPlayer({
  isOpen,
  onClose,
  currentSong,
  isPlaying,
  currentTime,
  duration,
  volume,
  isMuted,
  shuffleMode,
  isTransitioning,
  songs,
  sortedSongs,
  viewMode,
  onViewModeChange,
  onPlayPause,
  onSkipNext,
  onSkipPrevious,
  onSeek,
  onVolumeChange,
  onToggleMute,
  onToggleShuffle,
  onSongSelect,
  onSongRemove,
  onSongPlayNext,
  onShowEqualizer,
  onShowLyrics,
  onShowYoutube,
  onShowInsights,
  onShowArtist,
  albumArtSourceRect,
}: FullscreenPlayerProps) {
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)
  const [showPlaylist, setShowPlaylist] = useState(false)

  // FLIP animation refs
  const albumArtAnimRef = useRef<HTMLDivElement>(null)
  const hasAnimatedInRef = useRef(false)
  const sourceRectRef = useRef<DOMRect | null>(null)

  // Keep source rect ref updated
  if (albumArtSourceRect) {
    sourceRectRef.current = albumArtSourceRect
  }

  // Handle mount/unmount animations
  useEffect(() => {
    if (isOpen) {
      setMounted(true)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true))
      })
    } else {
      setVisible(false)
      const timer = setTimeout(() => {
        setMounted(false)
        setShowPlaylist(false)
        hasAnimatedInRef.current = false
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  // FLIP: Position album art at source rect before first paint
  useLayoutEffect(() => {
    if (!mounted || hasAnimatedInRef.current) return
    const el = albumArtAnimRef.current
    const srcRect = sourceRectRef.current
    if (!el || !srcRect) return

    const targetRect = el.getBoundingClientRect()
    const dx = (srcRect.left + srcRect.width / 2) - (targetRect.left + targetRect.width / 2)
    const dy = (srcRect.top + srcRect.height / 2) - (targetRect.top + targetRect.height / 2)
    const scale = srcRect.width / targetRect.width

    el.style.transition = "none"
    el.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`
  }, [mounted])

  // FLIP: Animate album art in when visible, out when closing
  useEffect(() => {
    if (!mounted) return
    const el = albumArtAnimRef.current
    const srcRect = sourceRectRef.current
    if (!el || !srcRect) return

    if (visible && !hasAnimatedInRef.current) {
      // Animate IN: from source position to center
      hasAnimatedInRef.current = true
      requestAnimationFrame(() => {
        el.style.transition = "transform 600ms cubic-bezier(0.25, 0.1, 0.25, 1)"
        el.style.transform = "none"
      })
    } else if (!visible && hasAnimatedInRef.current) {
      // Animate OUT: from center back to source position
      const targetRect = el.getBoundingClientRect()
      const dx = (srcRect.left + srcRect.width / 2) - (targetRect.left + targetRect.width / 2)
      const dy = (srcRect.top + srcRect.height / 2) - (targetRect.top + targetRect.height / 2)
      const scale = srcRect.width / targetRect.width

      el.style.transition = "transform 500ms cubic-bezier(0.25, 0.1, 0.25, 1)"
      el.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`
    }
  }, [mounted, visible])

  // Escape key to close
  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [isOpen, onClose])

  const handleSongSelect = useCallback((song: Song) => {
    onSongSelect(song)
  }, [onSongSelect])

  if (!mounted) return null

  const hasSourceRect = !!sourceRectRef.current

  return (
    <div className="fixed inset-0 z-50 bg-black">
      {/* Background - instant on open, fades out on close */}
      <div className={`absolute inset-0 ${!isOpen && mounted ? "transition-opacity duration-500 ease-out opacity-0" : ""}`}>
        <AlbumArtBackground
          albumArt={currentSong?.albumArt}
          songId={currentSong?.id}
          isTransitioning={isTransitioning}
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
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-white/70 hover:text-white" onClick={onClose} aria-label="Exit fullscreen">
          <Minimize2 className="w-4 h-4" />
        </Button>
        <span className="text-sm text-white/60 font-medium truncate max-w-md">
          {currentSong?.artist || ""}
        </span>
      </div>

      {/* Main content - centered album art */}
      <div
        className={`
          absolute inset-0 flex items-center justify-center pb-20 pt-14 z-10
          transition-all duration-500 ease-out
          ${showPlaylist ? "pr-[380px]" : "pr-0"}
        `}
      >
        {currentSong ? (
          <div className="flex flex-col items-center gap-6">
            {/* Album art - FLIP shared element transition or fallback scale */}
            {hasSourceRect ? (
              <div ref={albumArtAnimRef} style={{ willChange: "transform" }}>
                <AlbumArtDisplay
                  songId={currentSong.id}
                  albumArt={currentSong.albumArt}
                  title={`${currentSong.title} album art`}
                  isTransitioning={isTransitioning}
                  className="w-80 h-80 lg:w-96 lg:h-96"
                  style={{
                    boxShadow: "0 52px 52px -20px rgba(0,0,0,0.3), 0 4px 20px rgba(0,0,0,0.1)",
                  }}
                />
              </div>
            ) : (
              <div
                className={`
                  transition-all duration-700 ease-out
                  ${visible ? "scale-100 opacity-100" : "scale-75 opacity-0"}
                `}
              >
                <AlbumArtDisplay
                  songId={currentSong.id}
                  albumArt={currentSong.albumArt}
                  title={`${currentSong.title} album art`}
                  isTransitioning={isTransitioning}
                  className="w-80 h-80 lg:w-96 lg:h-96"
                  style={{
                    boxShadow: "0 52px 52px -20px rgba(0,0,0,0.3), 0 4px 20px rgba(0,0,0,0.1)",
                  }}
                />
              </div>
            )}
            {/* Title and album - fade in with delay */}
            <div
              className={`
                text-center space-y-1 transition-all duration-500 ease-out delay-200
                ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}
              `}
            >
              <h2 className="text-2xl font-bold text-white truncate max-w-md">{currentSong.title}</h2>
              {currentSong.album && (
                <p className="text-sm text-white/50">{currentSong.album}</p>
              )}
            </div>
          </div>
        ) : (
          <div className={`text-white/30 text-lg transition-opacity duration-500 ${visible ? "opacity-100" : "opacity-0"}`}>
            No song playing
          </div>
        )}
      </div>

      {/* Playlist sidebar */}
      <div
        className={`
          absolute top-0 right-0 bottom-[72px] w-[380px] bg-black/60 backdrop-blur-md border-l border-white/10 z-20
          transition-transform duration-400 ease-out
          ${showPlaylist ? "translate-x-0" : "translate-x-full"}
        `}
      >
        <div className="flex items-center justify-between px-4 h-14 border-b border-white/10">
          <span className="text-sm font-semibold text-white/80">Queue</span>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-white/50 hover:text-white" onClick={() => setShowPlaylist(false)}>
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
        <div className="h-[calc(100%-56px)] overflow-hidden">
          <EnhancedPlaylist
            songs={songs}
            currentSong={currentSong}
            onSongSelect={handleSongSelect}
            onSongRemove={onSongRemove}
            onSongPlayNext={onSongPlayNext}
            viewMode={viewMode}
            onViewModeChange={onViewModeChange}
            sortedSongs={sortedSongs}
          />
        </div>
      </div>

      {/* Bottom bar */}
      <div
        className={`
          absolute bottom-0 left-0 right-0 h-[72px] bg-black/80 backdrop-blur-md border-t border-white/10
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
                title={`${currentSong.title} album art`}
                size="small"
                className="flex-shrink-0"
              />
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate">{currentSong.title}</p>
                <p className="text-xs text-white/50 truncate">{currentSong.artist || "Unknown Artist"}</p>
              </div>
            </>
          )}
        </div>

        {/* Center: Controls + Seekbar */}
        <div className="flex-1 flex flex-col items-center gap-1 max-w-2xl mx-auto">
          {/* Controls */}
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-white/60 hover:text-white" onClick={onToggleShuffle} aria-label="Shuffle">
              <Shuffle className={`w-3.5 h-3.5 ${shuffleMode ? "text-primary" : ""}`} />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-white/70 hover:text-white" onClick={onSkipPrevious} disabled={songs.length === 0}>
              <SkipBack className="w-4 h-4" />
            </Button>
            <Button
              onClick={onPlayPause}
              size="icon"
              className="w-9 h-9 rounded-full bg-white text-black hover:bg-white/90"
              disabled={!currentSong}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-white/70 hover:text-white" onClick={onSkipNext} disabled={songs.length === 0}>
              <SkipForward className="w-4 h-4" />
            </Button>
            <div className="w-7" /> {/* spacer to balance shuffle */}
          </div>
          {/* Seekbar */}
          <div className="flex items-center gap-2 w-full">
            <span className="text-[11px] text-white/40 w-10 text-right tabular-nums">{formatTime(currentTime)}</span>
            <Slider
              value={[currentTime]}
              max={duration || 1}
              step={1}
              onValueChange={onSeek}
              className="flex-1 [&>span:first-child]:h-1 [&_[role=slider]]:h-3 [&_[role=slider]]:w-3 [&_[role=slider]]:opacity-0 [&_[role=slider]]:transition-all [&_[role=slider]]:duration-200 hover:[&_[role=slider]]:opacity-100"
              aria-label="Seek"
            />
            <span className="text-[11px] text-white/40 w-10 tabular-nums">{formatTime(duration)}</span>
          </div>
        </div>

        {/* Right: Utility buttons + Volume */}
        <div className="flex items-center gap-1 w-[240px] flex-shrink-0 justify-end">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-white/50 hover:text-white" onClick={() => { onClose(); onShowLyrics(); }}>
            <Mic className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-white/50 hover:text-white" onClick={() => { onClose(); onShowYoutube(); }}>
            <Youtube className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-white/50 hover:text-white" onClick={() => { onClose(); onShowInsights(); }}>
            <Sparkles className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-white/50 hover:text-white" onClick={() => { onClose(); onShowArtist(); }}>
            <User className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-white/50 hover:text-white" onClick={() => { onClose(); onShowEqualizer(); }}>
            <Settings className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={`h-7 w-7 p-0 hover:text-white ${showPlaylist ? "text-primary" : "text-white/50"}`}
            onClick={() => setShowPlaylist(!showPlaylist)}
          >
            <ListMusic className="w-3.5 h-3.5" />
          </Button>
          <div className="flex items-center gap-1 ml-1">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-white/50 hover:text-white" onClick={onToggleMute}>
              {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </Button>
            <Slider
              value={volume}
              max={100}
              step={1}
              onValueChange={onVolumeChange}
              className="w-20 [&>span:first-child]:h-1 [&_[role=slider]]:h-3 [&_[role=slider]]:w-3 [&_[role=slider]]:opacity-0 [&_[role=slider]]:transition-all [&_[role=slider]]:duration-200 hover:[&_[role=slider]]:opacity-100"
              aria-label="Volume"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
