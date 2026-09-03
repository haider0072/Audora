/**
 * Live sync measurements, held outside React state on purpose.
 *
 * The clock estimate updates on every pong and the drift on every correction
 * tick — together several times a second, for as long as a session is up. In
 * React state that would re-render the player, and with it the playlist, at
 * that rate to move numbers that only the sync panel displays. This is the
 * same trade `lib/playback-time-store` makes for the playback position, for
 * the same reason.
 *
 * The panel subscribes through `useSyncStats`; nothing else needs to.
 */

export interface SyncStats {
  /** Best round trip to the peer, in milliseconds. */
  rttMs: number
  /** Peer clock minus local clock, in milliseconds. */
  offsetMs: number
  /** Whether the clock estimate has settled enough to act on. */
  clockLocked: boolean
  /** Follower's current error against the host in ms; null when not correcting. */
  driftMs: number | null
}

type Listener = () => void

const listeners = new Set<Listener>()

const EMPTY: SyncStats = { rttMs: 0, offsetMs: 0, clockLocked: false, driftMs: null }

/**
 * Replaced wholesale on every change and returned as-is otherwise, because
 * `useSyncExternalStore` tears if a snapshot returns a fresh object for
 * unchanged data.
 */
let stats: SyncStats = EMPTY

function emit(): void {
  listeners.forEach((listener) => listener())
}

export function subscribeToSyncStats(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getSyncStats(): SyncStats {
  return stats
}

/**
 * Server snapshot for `useSyncExternalStore`. No session can exist during SSR,
 * and returning the shared empty object keeps the reference stable across
 * hydration.
 */
export function getServerSyncStats(): SyncStats {
  return EMPTY
}

/** Record the latest clock estimate. */
export function setClockStats(rttMs: number, offsetMs: number, clockLocked: boolean): void {
  if (stats.rttMs === rttMs && stats.offsetMs === offsetMs && stats.clockLocked === clockLocked) {
    return
  }
  stats = { ...stats, rttMs, offsetMs, clockLocked }
  emit()
}

/** Record the follower's current error, or null when it is not correcting. */
export function setDriftStat(driftMs: number | null): void {
  if (stats.driftMs === driftMs) return
  stats = { ...stats, driftMs }
  emit()
}

/** Clear everything when a session ends. */
export function resetSyncStats(): void {
  if (stats === EMPTY) return
  stats = EMPTY
  emit()
}
