"use client"

import { useCallback, useMemo } from "react"

import type { LibraryLayout } from "@/components/library/song-row"
import type { UsePlaylistManagerReturn } from "@/hooks/use-playlist-manager"
import type { Song } from "@/lib/song"
import type { NowPlayerProps } from "./now-panel"
import type { NowQueueProps } from "./now-queue"

interface NowPlayerOptions {
  playlist: Pick<
    UsePlaylistManagerReturn,
    "manualQueue" | "upNext" | "shuffleMode" | "playNext" | "addToQueue" | "removeFromQueue" | "clearQueue"
  >
  /** What the screen shows as playing: the pick, from the moment it is made. */
  displaySong: Song | null
  /** A picked song is still loading, so the clock is the last song's. */
  isLoading: boolean
  isPlaying: boolean
  pause: () => void
  onSeek: (seconds: number) => void
  /** A song from the library's part of the queue picked. */
  onSelect: (song: Song) => void
  /** A queued song picked. */
  onPlayQueued: (song: Song) => void
  layout: LibraryLayout
}

/** What a player hands its Now panels: the same for the desktop, full screen and the phone. */
export function useNowPlayer({
  playlist,
  displaySong,
  isLoading,
  isPlaying,
  pause,
  onSeek,
  onSelect,
  onPlayQueued,
  layout,
}: NowPlayerOptions): NowPlayerProps {
  const { manualQueue, upNext, shuffleMode, playNext, addToQueue, removeFromQueue, clearQueue } = playlist
  const queue = useMemo<NowQueueProps>(
    () => ({
      queued: manualQueue,
      upNext,
      shuffle: shuffleMode,
      layout,
      onSelect,
      onPlayQueued,
      playNext,
      addToQueue,
      onDequeue: removeFromQueue,
      onClear: clearQueue,
    }),
    [manualQueue, upNext, shuffleMode, layout, onSelect, onPlayQueued, playNext, addToQueue, removeFromQueue, clearQueue],
  )
  const onVideoPlay = useCallback(() => {
    if (isPlaying) pause()
  }, [isPlaying, pause])
  return useMemo(
    () => ({ song: displaySong, following: !isLoading, onSeek, queue, musicPlaying: isPlaying, onVideoPlay }),
    [displaySong, isLoading, onSeek, queue, isPlaying, onVideoPlay],
  )
}
