/**
 * Wire format and correction policy for two-device synchronized playback.
 *
 * Everything in this module is pure. The parts that decide how far apart the
 * two devices are, and what to do about it, are the parts most likely to be
 * wrong in a way that is hard to hear and harder to debug, so they are kept
 * free of transport, audio, and React concerns and covered by unit tests.
 *
 * Clock convention: every timestamp on the wire is a `performance.now()`
 * reading from the sender. Those readings share no origin between machines —
 * `ClockSync` estimates the constant difference and callers convert with it.
 * Wall-clock time is deliberately not used: it can step backwards when the OS
 * corrects against NTP, which would register as a sudden multi-second drift.
 */

export const SYNC_PROTOCOL_VERSION = 1

/** Identifies a track across devices. See `lib/sync/song-match`. */
export type TrackKey = string

/**
 * The host's view of playback, broadcast on every transport change and on a
 * steady heartbeat in between.
 */
export interface PlaybackState {
  /** Cross-device track identity, or null when nothing is loaded. */
  trackKey: TrackKey | null
  /** Title/artist for display when the follower cannot resolve `trackKey`. */
  trackLabel: string
  /** Position in seconds at the moment `sampledAt` was read. */
  position: number
  playing: boolean
  /** Sender's `performance.now()` when `position` was sampled. */
  sampledAt: number
  /** The host's own rate. Normally 1; a host is never rate-trimmed. */
  rate: number
  /**
   * The host's `AudioContext.outputLatency` in seconds — how long a sample it
   * feeds the graph takes to reach its speakers. The follower subtracts this
   * and adds its own so two different output paths still land together.
   */
  outputLatency: number
  /** Increases monotonically; the follower drops anything out of order. */
  seq: number
}

export type SyncMessage =
  | { t: "hello"; version: number; deviceName: string; isHost: boolean }
  | { t: "ping"; seq: number; t0: number }
  | { t: "pong"; seq: number; t0: number; t1: number }
  | { t: "state"; state: PlaybackState }
  /** Follower could not resolve the host's track in its own library. */
  | { t: "missing"; trackKey: TrackKey }
  /** Host is handing transport control to the peer. */
  | { t: "handover" }

/**
 * Below this error the follower is considered aligned and its rate is pinned
 * back to exactly 1. Two independent DACs cannot hold tighter than this, and
 * chasing further would mean a rate that never settles.
 */
export const DRIFT_LOCK_SEC = 0.004

/**
 * Correction only engages once the error exceeds this. The gap between engage
 * and lock is hysteresis: without it the rate would flap on and off around a
 * single threshold for as long as a track plays.
 */
export const DRIFT_ENGAGE_SEC = 0.008

/**
 * Past this the error is too large to trim away in reasonable time (at the
 * maximum trim, 250 ms would take over two minutes) so the follower seeks.
 * Reached after a track change, a stall, or a laptop waking from sleep.
 */
export const DRIFT_SEEK_SEC = 0.25

/**
 * Hard cap on the rate trim, as a fraction. At 0.2% the pitch shift is about
 * 3.5 cents, well under what anyone hears, and `preservesPitch` stays off so
 * this is a plain resample rather than a time-stretch with its own artifacts.
 */
export const MAX_RATE_TRIM = 0.002

/**
 * Seconds the correction aims to take. The trim is the error spread over this
 * window, so an 8 ms error closes in 8 s at 0.1%. Short enough that drift
 * never accumulates audibly, gentle enough that the rate change is inaudible.
 */
export const CORRECTION_WINDOW_SEC = 8

export type DriftCorrection =
  /** Error too large to trim: jump straight to `position`. */
  | { kind: "seek"; position: number; rate: 1 }
  /** Within trimming range: run at `rate` until aligned. */
  | { kind: "trim"; rate: number }
  /** Aligned. */
  | { kind: "locked"; rate: 1 }

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Decide what the follower should do about its current error.
 *
 * `errorSec` is target minus actual, so a positive error means the follower is
 * behind and needs to run fast to catch up.
 *
 * `wasTrimming` selects which threshold applies — a correction already under
 * way keeps running down to the tighter lock threshold instead of giving up at
 * the looser engage one.
 */
export function decideCorrection(
  errorSec: number,
  targetPosition: number,
  wasTrimming: boolean,
): DriftCorrection {
  if (!Number.isFinite(errorSec)) return { kind: "locked", rate: 1 }

  if (Math.abs(errorSec) > DRIFT_SEEK_SEC) {
    return { kind: "seek", position: targetPosition, rate: 1 }
  }

  const threshold = wasTrimming ? DRIFT_LOCK_SEC : DRIFT_ENGAGE_SEC
  if (Math.abs(errorSec) <= threshold) return { kind: "locked", rate: 1 }

  const trim = clamp(errorSec / CORRECTION_WINDOW_SEC, -MAX_RATE_TRIM, MAX_RATE_TRIM)
  return { kind: "trim", rate: 1 + trim }
}

export interface ProjectionInput {
  state: PlaybackState
  /** Receiver's `performance.now()` at the moment of projection. */
  localNow: number
  /** Host clock minus local clock, in milliseconds, from `ClockSync`. */
  clockOffsetMs: number
  /** Receiver's `AudioContext.outputLatency` in seconds. */
  localOutputLatency: number
  /** User's manual trim in seconds; positive runs this device ahead. */
  nullOffsetSec: number
}

/**
 * Where this device should be right now for its speakers to be in step with
 * the host's.
 *
 * Two corrections sit on top of the elapsed-time projection. The output
 * latency swap accounts for the two machines feeding their DACs at different
 * depths — what the host *hears* is its fed position minus its own latency, so
 * matching what is heard rather than what is fed means subtracting the host's
 * latency and adding this device's. The null offset is the user's own trim on
 * top, for the part no browser reports honestly (Bluetooth, mostly).
 */
export function projectHostPosition(input: ProjectionInput): number {
  const { state, localNow, clockOffsetMs, localOutputLatency, nullOffsetSec } = input

  const elapsedSec = state.playing
    ? Math.max(0, (localNow + clockOffsetMs - state.sampledAt) / 1000) * state.rate
    : 0

  return (
    state.position +
    elapsedSec -
    state.outputLatency +
    localOutputLatency +
    nullOffsetSec
  )
}
