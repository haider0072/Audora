import { useSyncExternalStore } from "react"
import {
  subscribeToPlaybackTime,
  getPlaybackTime,
  getServerPlaybackTime,
} from "@/lib/playback-time-store"

/**
 * Subscribe to the current playback position in seconds.
 *
 * Use this in the leaf components that actually render the position. Reading it
 * higher up puts everything below into the render path four times a second —
 * the exact problem the store exists to avoid. See `lib/playback-time-store`.
 */
export function usePlaybackTime(): number {
  return useSyncExternalStore(
    subscribeToPlaybackTime,
    getPlaybackTime,
    getServerPlaybackTime
  )
}
