"use client"

import { useRef, type RefObject } from "react"
import { ListMusic, Maximize2, MonitorSpeaker, MoreHorizontal, Shuffle, SlidersHorizontal, Volume2, VolumeX } from "lucide-react"

import { AlbumArtDisplay } from "@/components/album-art-display"
import { PlayButton } from "@/components/player/play-button"
import { QualityLabel } from "@/components/player/quality-label"
import { RollingText, type RollDirection } from "@/components/player/rolling-text"
import { SeekBar } from "@/components/player/seek-bar"
import { SkipIcon, TransportButton } from "@/components/player/transport-button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Slider } from "@/components/ui/slider"
import { albumPage, artistPage, type LibraryPage } from "@/lib/library-pages"
import type { Song } from "@/lib/song"

export interface PlayerBarProps {
  /** The song on screen: a pick shows from the moment it is made. */
  song: Song | null
  isPlaying: boolean
  /** A picked song is loading. */
  isLoading: boolean
  /** Which way the last song change reads: 1 forward, -1 back. */
  direction: RollDirection
  /** The seek bar's length: the song heard, or a pick's own while it loads. */
  duration: number
  /** There is something to skip to. */
  canSkip: boolean
  shuffle: boolean
  onToggleShuffle: () => void
  onPlayPause: () => void
  onSkipPrevious: () => void
  onSkipNext: () => void
  onSeek: (seconds: number) => void
  /** Show the song's artist or album in the library. */
  onShowPage: (page: LibraryPage) => void
  /** The cover, which full screen grows out of. */
  coverRef: RefObject<HTMLButtonElement>
  onOpenFullscreen: () => void
  nowOpen: boolean
  onToggleNow: () => void
  /** The Now panel's toggle, which takes focus when the panel closes from inside. */
  nowToggleRef: RefObject<HTMLButtonElement>
  volume: number[]
  isMuted: boolean
  onVolumeChange: (value: number[]) => void
  onToggleMute: () => void
  /** The equalizer and the rest of the sound settings. */
  onOpenSound: () => void
  onOpenSync: () => void
  syncConnected: boolean
}

/**
 * The desktop's player, along the foot of the window: what is playing, with
 * its quality and the way to its artist and album; the transport and seek
 * bar; then the Now panel, volume, the player's other settings and full
 * screen. Styled by `.player-bar` in app/globals.css.
 */
export function PlayerBar({
  song,
  isPlaying,
  isLoading,
  direction,
  duration,
  canSkip,
  shuffle,
  onToggleShuffle,
  onPlayPause,
  onSkipPrevious,
  onSkipNext,
  onSeek,
  onShowPage,
  coverRef,
  onOpenFullscreen,
  nowOpen,
  onToggleNow,
  nowToggleRef,
  volume,
  isMuted,
  onVolumeChange,
  onToggleMute,
  onOpenSound,
  onOpenSync,
  syncConnected,
}: PlayerBarProps) {
  // A saved volume of nothing is as silent as a mute, and reads as one.
  const silent = isMuted || volume[0] === 0
  // A dialog asked for from the menu opens once the menu has closed, with
  // focus back on the menu's button, so the dialog can hand it back there.
  const afterMenu = useRef<(() => void) | null>(null)
  const moreRef = useRef<HTMLButtonElement>(null)

  return (
    <footer className="player-bar" aria-label="Player">
      <div className="player-bar-track">
        {song && (
          <>
            {/* A pointer's way into full screen; the keyboard's is the Full screen button. */}
            <button
              ref={coverRef}
              type="button"
              className="player-bar-cover"
              tabIndex={-1}
              aria-hidden="true"
              title="Full screen"
              onClick={onOpenFullscreen}
            >
              <AlbumArtDisplay
                songId={song.id}
                albumArt={song.albumArt}
                thumbnail={song.albumArtThumb}
                title={`${song.title} album art`}
                size="medium"
                rounded="rounded-lg"
                isTransitioning={isLoading}
              />
            </button>
            <div className="player-bar-text">
              <p className="player-bar-title">
                <RollingText text={song.title || "Unknown title"} direction={direction} />
              </p>
              <p className="player-bar-credits">
                <RollingText text={[song.artist, song.album].filter(Boolean).join(" — ")} direction={direction}>
                  {song.artist && (
                    <button
                      type="button"
                      className="player-bar-link"
                      title={`Go to ${song.artist}`}
                      onClick={() => onShowPage(artistPage(song))}
                    >
                      {song.artist}
                    </button>
                  )}
                  {song.artist && song.album && " — "}
                  {song.album && (
                    <button
                      type="button"
                      className="player-bar-link"
                      title={`Go to ${song.album}`}
                      onClick={() => onShowPage(albumPage(song))}
                    >
                      {song.album}
                    </button>
                  )}
                </RollingText>
              </p>
              <QualityLabel song={song} withBitrate />
            </div>
          </>
        )}
      </div>

      <div className="player-bar-centre">
        <div className="player-bar-transport">
          <TransportButton label="Shuffle" size="xs" pressed={shuffle} onClick={onToggleShuffle}>
            <Shuffle className="h-4 w-4" />
          </TransportButton>
          <TransportButton label="Previous track" size="sm" onClick={onSkipPrevious} disabled={!canSkip}>
            <SkipIcon direction="back" size="sm" />
          </TransportButton>
          <PlayButton size="sm" isPlaying={isPlaying} isLoading={isLoading} onClick={onPlayPause} disabled={!song} />
          <TransportButton label="Next track" size="sm" onClick={onSkipNext} disabled={!canSkip}>
            <SkipIcon direction="forward" size="sm" />
          </TransportButton>
          {/* Balances the shuffle button so play sits at the centre. */}
          <div className="h-8 w-8" aria-hidden="true" />
        </div>
        <SeekBar
          className="w-full"
          duration={duration}
          onSeek={onSeek}
          isPlaying={isPlaying}
          disabled={isLoading || !song}
          timesPosition="sides"
        />
      </div>

      <div className="player-bar-tools">
        <TransportButton
          ref={nowToggleRef}
          label="Now playing"
          title="Lyrics, queue, about and video"
          size="xs"
          pressed={nowOpen}
          onClick={onToggleNow}
        >
          <ListMusic className="h-4 w-4" />
        </TransportButton>
        <TransportButton label={silent ? "Unmute" : "Mute"} size="xs" onClick={onToggleMute}>
          {silent ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </TransportButton>
        <Slider
          className="volume-slider mr-1 w-24"
          value={volume}
          max={100}
          step={1}
          onValueChange={onVolumeChange}
          aria-label="Volume"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <TransportButton ref={moreRef} label="More" size="xs">
              <MoreHorizontal className="h-4 w-4" />
            </TransportButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            side="top"
            onCloseAutoFocus={(event) => {
              const open = afterMenu.current
              afterMenu.current = null
              if (!open) return
              event.preventDefault()
              moreRef.current?.focus()
              open()
            }}
          >
            <DropdownMenuItem
              onSelect={() => {
                afterMenu.current = onOpenSound
              }}
            >
              <SlidersHorizontal />
              Sound
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                afterMenu.current = onOpenSync
              }}
            >
              <MonitorSpeaker />
              {syncConnected ? "Two-device playback: on" : "Two-device playback"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <TransportButton label="Full screen" size="xs" onClick={onOpenFullscreen} disabled={!song}>
          <Maximize2 className="h-4 w-4" />
        </TransportButton>
      </div>
    </footer>
  )
}
