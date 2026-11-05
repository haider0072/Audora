"use client"

import { useId, useRef, type RefObject } from "react"
import { Maximize2, MonitorSpeaker, MoreHorizontal, Shuffle, SlidersHorizontal, Volume2, VolumeX } from "lucide-react"

import { AlbumArtDisplay } from "@/components/album-art-display"
import { LazyNowView } from "@/components/now/lazy-now-view"
import type { NowPlayerProps } from "@/components/now/now-panel"
import { NOW_TAB_LABELS, NOW_TABS, type NowViewTab } from "@/components/now/now-tabs"
import { PlayButton } from "@/components/player/play-button"
import { QualityLabel } from "@/components/player/quality-label"
import { RollingText, type RollDirection } from "@/components/player/rolling-text"
import { SeekBar } from "@/components/player/seek-bar"
import { SkipIcon, TransportButton } from "@/components/player/transport-button"
import { VolumeSlider } from "@/components/player/volume-slider"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { albumPage, artistPage, type LibraryPage } from "@/lib/library-pages"
import type { Song } from "@/lib/song"

/** What the stage shows: the cover, or one of the song's views in its place. */
export type StageMode = "cover" | NowViewTab

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
  /** Show the song's artist or album in the library. */
  onShowPage: (page: LibraryPage) => void
  /** The cover, which full screen grows out of. */
  coverRef: RefObject<HTMLButtonElement>
  onOpenFullscreen: () => void
  mode: StageMode
  onModeChange: (mode: StageMode) => void
  /** What the song's views need. */
  now: NowPlayerProps
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
 * The desktop's player, the left half of the window: the cover as large as the
 * window allows, or in its place the song's lyrics, queue, about or video;
 * under it what is playing, its quality and the way to its artist and album,
 * the seek bar, the transport, and the volume. Styled by `.stage` in
 * app/globals.css.
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
  onShowPage,
  coverRef,
  onOpenFullscreen,
  mode,
  onModeChange,
  now,
  volume,
  isMuted,
  onVolumeChange,
  onToggleMute,
  onOpenSound,
  onOpenSync,
  syncConnected,
}: NowStageProps) {
  const viewId = useId()
  // A saved volume of nothing is as silent as a mute, and reads as one.
  const silent = isMuted || volume[0] === 0
  // What the menu asks for opens once the menu has closed, with focus back on
  // the menu's button, so a dialog can hand it back there.
  const afterMenu = useRef<(() => void) | null>(null)
  const moreRef = useRef<HTMLButtonElement>(null)

  return (
    <section className="stage" aria-label="Now playing" data-mode={mode}>
      <div className="stage-stack">
        <div className="stage-square">
          {song ? (
            // A pointer's way into full screen; the keyboard's is in More.
            <button
              ref={coverRef}
              type="button"
              className="stage-cover"
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
                size="large"
                rounded="rounded-2xl"
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
          {mode !== "cover" && (
            <div id={viewId} className="stage-view" role="region" aria-label={NOW_TAB_LABELS[mode]}>
              <LazyNowView tab={mode} {...now} />
            </div>
          )}
        </div>

        <div className="stage-info">
          {song && (
            <>
              <h2 className="stage-title">
                <RollingText text={song.title || "Unknown title"} direction={direction} />
              </h2>
              <p className="stage-credits">
                <RollingText text={[song.artist, song.album].filter(Boolean).join(" — ")} direction={direction}>
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
                  {song.artist && song.album && " — "}
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
              <QualityLabel song={song} withBitrate className="stage-specs" />
            </>
          )}
        </div>

        <SeekBar
          className="stage-seek"
          duration={duration}
          onSeek={onSeek}
          isPlaying={isPlaying}
          disabled={isLoading || !song}
        />

        <div className="stage-transport">
          <TransportButton label="Shuffle" size="lg" pressed={shuffle} onClick={onToggleShuffle} className="stage-quiet">
            <Shuffle className="h-5 w-5" />
          </TransportButton>
          <TransportButton label="Previous track" size="lg" onClick={onSkipPrevious} disabled={!canSkip}>
            <SkipIcon direction="back" size="lg" />
          </TransportButton>
          <PlayButton size="lg" isPlaying={isPlaying} isLoading={isLoading} onClick={onPlayPause} disabled={!song} />
          <TransportButton label="Next track" size="lg" onClick={onSkipNext} disabled={!canSkip}>
            <SkipIcon direction="forward" size="lg" />
          </TransportButton>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <TransportButton ref={moreRef} label="More" size="lg" className="stage-quiet">
                <MoreHorizontal className="h-5 w-5" />
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
                disabled={!song}
                onSelect={() => {
                  afterMenu.current = onOpenFullscreen
                }}
              >
                <Maximize2 />
                Full screen
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="stage-tools">
          <div className="stage-modes" role="group" aria-label="Show in place of the cover">
            {NOW_TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                className="led-choice"
                aria-pressed={mode === tab}
                aria-controls={mode === tab ? viewId : undefined}
                onClick={() => onModeChange(mode === tab ? "cover" : tab)}
              >
                {NOW_TAB_LABELS[tab]}
              </button>
            ))}
          </div>
          <div className="stage-volume">
            <TransportButton label={silent ? "Unmute" : "Mute"} size="sm" onClick={onToggleMute} className="stage-quiet">
              {silent ? <VolumeX className="h-[18px] w-[18px]" /> : <Volume2 className="h-[18px] w-[18px]" />}
            </TransportButton>
            <VolumeSlider className="stage-volume-slider" value={volume} onValueChange={onVolumeChange} muted={isMuted} />
          </div>
        </div>
      </div>
    </section>
  )
}
