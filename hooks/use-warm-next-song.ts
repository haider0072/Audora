"use client"

import { useEffect } from "react"

import { warmSong } from "@/lib/song-warmup"
import type { Song } from "@/lib/song"

/**
 * Once the current song has been playing for a moment, warm the one after
 * it, so pressing Next — or the song simply ending — starts it at once.
 *
 * The wait leaves the current song's own start-up the connection to itself;
 * the warm-up is a few seconds of audio, nowhere near the end of the track.
 */
const WARM_NEXT_AFTER_MS = 3_000

export function useWarmNextSong(currentSongId: string | undefined, isPlaying: boolean, peekNextSong: () => Song | null) {
  useEffect(() => {
    if (!currentSongId || !isPlaying) return
    const timer = setTimeout(() => warmSong(peekNextSong()), WARM_NEXT_AFTER_MS)
    return () => clearTimeout(timer)
  }, [currentSongId, isPlaying, peekNextSong])
}
