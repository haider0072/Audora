/**
 * The user's manual timing trim, held outside React state.
 *
 * Two speakers in one room are nulled by ear: the user drags a slider while
 * listening, and what matters is that the correction loop picks the new value
 * up immediately. Keeping it here rather than in player state means dragging
 * the slider re-renders the slider, not the library behind it — and the
 * correction loop can read the current value directly instead of having it
 * threaded down through props and mirrored into a ref.
 *
 * Persisted per device, because the thing being corrected for — a Bluetooth
 * speaker, a particular DAC — belongs to the device, not the session.
 */

const STORAGE_KEY = "audora_sync_null_offset_ms"

/**
 * Range of the trim, in milliseconds. Wide enough to null out an output path
 * the browser under-reports, narrow enough to stay usable at 1 ms steps.
 */
export const NULL_OFFSET_LIMIT_MS = 50

type Listener = () => void

const listeners = new Set<Listener>()

/**
 * Seeded from storage at module load on the client, and left at zero on the
 * server so `getServerNullOffsetMs` and the first client render agree.
 */
let offsetMs = readStored()

function readStored(): number {
  if (typeof window === "undefined") return 0
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === null) return 0
    const parsed = Number.parseFloat(stored)
    return Number.isFinite(parsed) ? clampOffset(parsed) : 0
  } catch (error) {
    // Storage can be unavailable outright in a locked-down profile.
    console.error("Could not read the stored sync offset:", error)
    return 0
  }
}

function clampOffset(ms: number): number {
  return Math.round(Math.min(NULL_OFFSET_LIMIT_MS, Math.max(-NULL_OFFSET_LIMIT_MS, ms)))
}

export function subscribeToNullOffset(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getNullOffsetMs(): number {
  return offsetMs
}

/** Server snapshot for `useSyncExternalStore`. */
export function getServerNullOffsetMs(): number {
  return 0
}

/** The same value in seconds, which is what the correction math works in. */
export function getNullOffsetSec(): number {
  return offsetMs / 1000
}

export function setNullOffsetMs(ms: number): void {
  const clamped = clampOffset(ms)
  if (clamped === offsetMs) return
  offsetMs = clamped

  try {
    window.localStorage.setItem(STORAGE_KEY, String(clamped))
  } catch (error) {
    // A full origin quota should not stop the user nulling by ear; the value
    // simply will not survive a reload.
    console.error("Could not persist the sync offset:", error)
  }

  listeners.forEach((listener) => listener())
}
