/**
 * Clock offset estimation between two peers, over any message channel.
 *
 * Two machines' `performance.now()` readings share no origin, so before the
 * follower can act on a host timestamp it needs the constant difference
 * between the two clocks. That difference is not directly observable — only
 * round trips are — so it is estimated the way NTP does it.
 *
 * A round trip gives:
 *
 *   t0  local clock when the ping was sent
 *   t1  remote clock when the ping arrived
 *   t3  local clock when the pong came back
 *
 * If the two legs took equal time, the remote clock read t1 at local time
 * (t0 + t3) / 2, so the offset is t1 - (t0 + t3) / 2 and the error is bounded
 * by how *unequal* the legs were — at most half the round trip.
 *
 * That bound is why the estimator keeps a window of samples and trusts the one
 * with the smallest round trip rather than averaging. Averaging would fold
 * every delayed sample into the answer; on a channel where most trips are fast
 * and a few are late, the fastest trip is by far the most honest one. The
 * selected sample is then smoothed so a single lucky round trip cannot yank
 * the estimate around.
 */

export interface ClockSample {
  /** Round trip time in milliseconds. */
  rtt: number
  /** Remote clock minus local clock, in milliseconds. */
  offset: number
}

/** Samples retained for the min-RTT search. */
const WINDOW_SIZE = 16

/** Samples required before the estimate is trusted. */
const LOCK_AFTER_SAMPLES = 4

/** Smoothing applied to the selected sample once locked. */
const SMOOTHING = 0.25

/**
 * A jump larger than this is a real clock event — a peer waking from sleep, a
 * reconnect to a different route — not measurement noise, so the estimate
 * snaps instead of crawling toward it a quarter at a time.
 */
const SNAP_THRESHOLD_MS = 100

export class ClockSync {
  private samples: ClockSample[] = []
  private offsetMs = 0
  private bestRttMs = Number.POSITIVE_INFINITY
  private sampleCount = 0

  /**
   * Fold one completed round trip into the estimate.
   *
   * Samples with a non-finite or negative round trip are dropped: a backwards
   * round trip means the timestamps did not come from the clocks they claim to.
   */
  addRoundTrip(t0: number, t1: number, t3: number): void {
    const rtt = t3 - t0
    if (!Number.isFinite(rtt) || rtt < 0) return

    const offset = t1 - (t0 + t3) / 2
    if (!Number.isFinite(offset)) return

    this.samples.push({ rtt, offset })
    if (this.samples.length > WINDOW_SIZE) this.samples.shift()
    this.sampleCount++

    const best = this.samples.reduce((a, b) => (b.rtt < a.rtt ? b : a))
    this.bestRttMs = best.rtt

    if (this.sampleCount <= LOCK_AFTER_SAMPLES) {
      this.offsetMs = best.offset
      return
    }

    if (Math.abs(best.offset - this.offsetMs) > SNAP_THRESHOLD_MS) {
      this.offsetMs = best.offset
      return
    }

    this.offsetMs += SMOOTHING * (best.offset - this.offsetMs)
  }

  /** Remote clock minus local clock, in milliseconds. */
  get offset(): number {
    return this.offsetMs
  }

  /** Smallest round trip seen in the current window, in milliseconds. */
  get bestRtt(): number {
    return Number.isFinite(this.bestRttMs) ? this.bestRttMs : 0
  }

  /**
   * Worst-case error on `offset`, in milliseconds — half the best round trip,
   * from the equal-legs assumption above. Surfaced in the UI so a bad network
   * shows up as a wide bound rather than a confidently wrong number.
   */
  get uncertainty(): number {
    return this.bestRtt / 2
  }

  /** Whether enough round trips have landed for `offset` to be worth using. */
  get isLocked(): boolean {
    return this.sampleCount >= LOCK_AFTER_SAMPLES
  }

  /** Drop all history. Used when the peer connection is replaced. */
  reset(): void {
    this.samples = []
    this.offsetMs = 0
    this.bestRttMs = Number.POSITIVE_INFINITY
    this.sampleCount = 0
  }
}
