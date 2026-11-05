"use client"

import { useRef, type ReactNode, type RefObject } from "react"
import { Maximize2, Minimize2, MonitorSpeaker, MoreHorizontal, Shuffle, SlidersHorizontal } from "lucide-react"

import { AlbumArtDisplay } from "@/components/album-art-display"
import { VolumePop } from "@/components/desktop/volume-pop"
import { PlayButton } from "@/components/player/play-button"
import { QualityLabel } from "@/components/player/quality-label"
import { RollingText, type RollDirection } from "@/components/player/rolling-text"
import { SeekBar } from "@/components/player/seek-bar"
import { SkipGlyph, TransportButton } from "@/components/player/transport-button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { albumPage, artistPage, type LibraryPage } from "@/lib/library-pages"
import type { Song } from "@/lib/song"

export interface NowStageProps {
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
  volume: number[]
  isMuted: boolean
  onVolumeChange: (value: number[]) => void
  onToggleMute: () => void
  /** Show the song's artist or album in the library. */
  onShowPage: (page: LibraryPage) => void
  /** The frame shows the song alone. */
  fullscreen: boolean
  /** Into full screen from the cover or More, and back out from More. */
  onToggleFullscreen: () => void
  /** The More button, for focus to come back to from elsewhere. */
  moreRef: RefObject<HTMLButtonElement>
  /** The equalizer and the rest of the sound settings. */
  onOpenSound: () => void
  onOpenSync: () => void
  syncConnected: boolean
  /** The song's views, as words under the transport. */
  views: ReactNode
}

/**
 * The desktop's player, the left half of the window: the cover as large as the
 * window allows, always in sight; under it what is playing and the way to its
 * artist and album, with More beside them; the seek bar, with the song's
 * quality between its times; the transport, its volume collapsed to the
 * speaker at its end; and the song's views. Everything sits straight on the
 * song's colour, with no boxes. In full screen it keeps its place beside the
 * open view, or stands alone in the middle of the window. Styled by `.stage`
 * in app/globals.css.
 */
export function NowStage({
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
  volume,
  isMuted,
  onVolumeChange,
  onToggleMute,
  onShowPage,
  fullscreen,
  onToggleFullscreen,
  moreRef,
  onOpenSound,
  onOpenSync,
  syncConnected,
  views,
}: NowStageProps) {
  // What the menu asks for opens once the menu has closed, with focus back on
  // the menu's button, so a dialog can hand it back there.
  const afterMenu = useRef<(() => void) | null>(null)

  return (
    <section className="stage" aria-label="Now playing">
      <div className="stage-stack">
        <div className="stage-square">
          {song ? (
            // A pointer's way into full screen; the keyboard's is in More.
            <button
              type="button"
              className="stage-cover"
              tabIndex={-1}
              aria-hidden="true"
              title={fullscreen ? undefined : "Full screen"}
              disabled={fullscreen}
              onClick={onToggleFullscreen}
            >
              <AlbumArtDisplay
                songId={song.id}
                albumArt={song.albumArt}
                thumbnail={song.albumArtThumb}
                title={`${song.title} album art`}
                size="large"
                rounded="rounded-xl"
                className="stage-art"
                isTransitioning={isLoading}
              />
            </button>
          ) : (
            <div className="stage-empty">
              <span className="wordmark-ring stage-empty-ring" aria-hidden="true" />
              <p className="stage-empty-title">Nothing playing</p>
              <p className="stage-empty-detail">Pick a song from your library.</p>
            </div>
          )}
        </div>

        <div className="stage-head">
          <div className="stage-info">
            {song && (
              <>
                <h2 className="stage-title">
                  <RollingText text={song.title || "Unknown title"} direction={direction} />
                </h2>
                <p className="stage-credits">
                  <RollingText text={[song.artist, song.album].filter(Boolean).join(" — ")} direction={direction}>
                    {/* Each name keeps its own ellipsis, the artist's given room first, so a long album never hides both. */}
                    {song.artist && (
                      <button
                        type="button"
                        className="stage-link"
                        title={`Go to ${song.artist}`}
                        onClick={() => onShowPage(artistPage(song))}
                      >
                        {song.artist}
                      </button>
                    )}
                    {song.artist && song.album && (
                      <span className="stage-credits-sep" aria-hidden="true">
                        —
                      </span>
                    )}
                    {song.album && (
                      <button
                        type="button"
                        className="stage-link"
                        title={`Go to ${song.album}`}
                        onClick={() => onShowPage(albumPage(song))}
                      >
                        {song.album}
                      </button>
                    )}
                  </RollingText>
                </p>
              </>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <TransportButton ref={moreRef} label="More" size="sm" className="round-glass">
                <MoreHorizontal className="h-[18px] w-[18px]" />
              </TransportButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
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
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={!song && !fullscreen}
                onSelect={() => {
                  afterMenu.current = onToggleFullscreen
                }}
              >
                {fullscreen ? <Minimize2 /> : <Maximize2 />}
                {fullscreen ? "Exit full screen" : "Full screen"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <SeekBar
          className="stage-seek"
          duration={duration}
          onSeek={onSeek}
          isPlaying={isPlaying}
          disabled={isLoading || !song}
          between={<QualityLabel song={song} withBitrate className="stage-specs" />}
        />

        <div className="stage-transport">
          <TransportButton label="Shuffle" size="lg" pressed={shuffle} onClick={onToggleShuffle} className="stage-quiet">
            <Shuffle className="h-5 w-5" />
          </TransportButton>
          <TransportButton label="Previous track" size="lg" onClick={onSkipPrevious} disabled={!canSkip}>
            <SkipGlyph direction="back" className="h-[30px] w-[30px]" />
          </TransportButton>
          <PlayButton size="md" isPlaying={isPlaying} isLoading={isLoading} onClick={onPlayPause} disabled={!song} />
          <TransportButton label="Next track" size="lg" onClick={onSkipNext} disabled={!canSkip}>
            <SkipGlyph direction="forward" className="h-[30px] w-[30px]" />
          </TransportButton>
          <VolumePop volume={volume} isMuted={isMuted} onVolumeChange={onVolumeChange} onToggleMute={onToggleMute} />
        </div>

        {views}
      </div>
    </section>
  )
}
