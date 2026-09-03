import {
  CORRECTION_WINDOW_SEC,
  DRIFT_ENGAGE_SEC,
  DRIFT_LOCK_SEC,
  DRIFT_SEEK_SEC,
  MAX_RATE_TRIM,
  decideCorrection,
  projectHostPosition,
  type PlaybackState,
} from '@/lib/sync/protocol'

function state(overrides: Partial<PlaybackState> = {}): PlaybackState {
  return {
    trackKey: '1000:song.flac',
    trackLabel: 'Song',
    position: 30,
    playing: true,
    sampledAt: 10_000,
    rate: 1,
    outputLatency: 0,
    seq: 1,
    ...overrides,
  }
}

describe('decideCorrection', () => {
  it('reports locked when already inside the lock window', () => {
    expect(decideCorrection(0.001, 30, false)).toEqual({ kind: 'locked', rate: 1 })
    expect(decideCorrection(-0.001, 30, false)).toEqual({ kind: 'locked', rate: 1 })
  })

  it('pins the rate to exactly 1 when locked, so a settled follower is bit-identical', () => {
    const correction = decideCorrection(0, 30, true)
    expect(correction.rate).toBe(1)
  })

  it('does not engage between the lock and engage thresholds from rest', () => {
    const justUnderEngage = (DRIFT_LOCK_SEC + DRIFT_ENGAGE_SEC) / 2
    expect(decideCorrection(justUnderEngage, 30, false).kind).toBe('locked')
  })

  it('keeps trimming in that same band once engaged (hysteresis)', () => {
    const justUnderEngage = (DRIFT_LOCK_SEC + DRIFT_ENGAGE_SEC) / 2
    expect(decideCorrection(justUnderEngage, 30, true).kind).toBe('trim')
  })

  it('runs fast when behind and slow when ahead', () => {
    expect(decideCorrection(0.05, 30, false).rate).toBeGreaterThan(1)
    expect(decideCorrection(-0.05, 30, false).rate).toBeLessThan(1)
  })

  it('treats an error exactly at the engage threshold as aligned', () => {
    expect(decideCorrection(DRIFT_ENGAGE_SEC, 30, false).kind).toBe('locked')
  })

  it('spreads the error across the correction window', () => {
    const error = 0.012
    const correction = decideCorrection(error, 30, false)
    expect(correction.rate).toBeCloseTo(1 + error / CORRECTION_WINDOW_SEC, 10)
  })

  it('never trims beyond the inaudible cap', () => {
    expect(decideCorrection(0.24, 30, false).rate).toBeCloseTo(1 + MAX_RATE_TRIM, 10)
    expect(decideCorrection(-0.24, 30, false).rate).toBeCloseTo(1 - MAX_RATE_TRIM, 10)
  })

  it('seeks rather than trims once the error passes the seek threshold', () => {
    const correction = decideCorrection(DRIFT_SEEK_SEC + 0.01, 42, false)
    expect(correction).toEqual({ kind: 'seek', position: 42, rate: 1 })
  })

  it('seeks on a large negative error too', () => {
    expect(decideCorrection(-1, 42, true).kind).toBe('seek')
  })

  it('treats a non-finite error as aligned rather than seeking wildly', () => {
    expect(decideCorrection(Number.NaN, 30, true)).toEqual({ kind: 'locked', rate: 1 })
  })
})

describe('projectHostPosition', () => {
  const base = {
    localNow: 10_000,
    clockOffsetMs: 0,
    localOutputLatency: 0,
    nullOffsetSec: 0,
  }

  it('returns the sampled position when no time has passed', () => {
    expect(projectHostPosition({ ...base, state: state() })).toBeCloseTo(30, 10)
  })

  it('advances by elapsed time while playing', () => {
    expect(
      projectHostPosition({ ...base, state: state(), localNow: 12_000 }),
    ).toBeCloseTo(32, 10)
  })

  it('does not advance while paused, however long ago the state was sent', () => {
    expect(
      projectHostPosition({ ...base, state: state({ playing: false }), localNow: 99_000 }),
    ).toBeCloseTo(30, 10)
  })

  it('uses the clock offset to place the host timestamp on the local timeline', () => {
    // The host clock runs 5000 ms ahead, so its 10_000 reading is local 5000:
    // by local 10_000 the host has had 5 s of playback.
    expect(
      projectHostPosition({ ...base, state: state(), clockOffsetMs: 5_000 }),
    ).toBeCloseTo(35, 10)
  })

  it('never projects backwards when a state message arrives before its timestamp', () => {
    // A pessimistic offset estimate can put the sample slightly in the future.
    expect(
      projectHostPosition({ ...base, state: state({ sampledAt: 10_050 }) }),
    ).toBeCloseTo(30, 10)
  })

  it('scales elapsed time by the host rate', () => {
    expect(
      projectHostPosition({ ...base, state: state({ rate: 2 }), localNow: 12_000 }),
    ).toBeCloseTo(34, 10)
  })

  it('runs later when this device has the deeper output buffer', () => {
    // 100 ms of extra local latency means this device must feed material 100 ms
    // further along for it to be heard at the same moment as the host's.
    expect(
      projectHostPosition({ ...base, state: state(), localOutputLatency: 0.1 }),
    ).toBeCloseTo(30.1, 10)
  })

  it('runs earlier when the host has the deeper output buffer', () => {
    expect(
      projectHostPosition({ ...base, state: state({ outputLatency: 0.1 }) }),
    ).toBeCloseTo(29.9, 10)
  })

  it('cancels out when both devices report the same output latency', () => {
    expect(
      projectHostPosition({
        ...base,
        state: state({ outputLatency: 0.08 }),
        localOutputLatency: 0.08,
      }),
    ).toBeCloseTo(30, 10)
  })

  it('applies the user null offset on top', () => {
    expect(
      projectHostPosition({ ...base, state: state(), nullOffsetSec: -0.02 }),
    ).toBeCloseTo(29.98, 10)
  })
})
