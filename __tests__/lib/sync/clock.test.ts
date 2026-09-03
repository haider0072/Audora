import { ClockSync } from '@/lib/sync/clock'

/**
 * Feed a round trip for a peer whose clock is `offset` ms ahead, where the
 * outbound leg took `out` ms and the return leg `back` ms.
 */
function roundTrip(clock: ClockSync, sendAt: number, offset: number, out: number, back: number) {
  const t0 = sendAt
  const t1 = sendAt + out + offset
  const t3 = sendAt + out + back
  clock.addRoundTrip(t0, t1, t3)
}

describe('ClockSync', () => {
  it('starts unlocked and reports no offset', () => {
    const clock = new ClockSync()
    expect(clock.isLocked).toBe(false)
    expect(clock.offset).toBe(0)
  })

  it('recovers the offset exactly when the legs are symmetric', () => {
    const clock = new ClockSync()
    for (let i = 0; i < 8; i++) roundTrip(clock, i * 100, 5_000, 2, 2)
    expect(clock.offset).toBeCloseTo(5_000, 6)
  })

  it('locks once enough round trips have landed', () => {
    const clock = new ClockSync()
    for (let i = 0; i < 3; i++) roundTrip(clock, i * 100, 100, 2, 2)
    expect(clock.isLocked).toBe(false)
    roundTrip(clock, 400, 100, 2, 2)
    expect(clock.isLocked).toBe(true)
  })

  it('reports round trip and an uncertainty of half of it', () => {
    const clock = new ClockSync()
    for (let i = 0; i < 6; i++) roundTrip(clock, i * 100, 0, 3, 3)
    expect(clock.bestRtt).toBeCloseTo(6, 6)
    expect(clock.uncertainty).toBeCloseTo(3, 6)
  })

  it('is biased by at most half the round trip when one leg is slower', () => {
    const clock = new ClockSync()
    // 10 ms out, 2 ms back: the estimate can be wrong by no more than 6 ms.
    for (let i = 0; i < 8; i++) roundTrip(clock, i * 100, 1_000, 10, 2)
    expect(Math.abs(clock.offset - 1_000)).toBeLessThanOrEqual(clock.uncertainty + 1e-6)
  })

  it('prefers the fastest round trip over the average of a noisy channel', () => {
    const clock = new ClockSync()
    // One clean 2 ms trip buried in trips whose outbound leg is badly delayed.
    roundTrip(clock, 0, 500, 1, 1)
    for (let i = 1; i < 12; i++) roundTrip(clock, i * 100, 500, 60, 2)
    // Averaging those asymmetric trips would land near 529 ms.
    expect(clock.offset).toBeCloseTo(500, 0)
  })

  it('smooths rather than chasing a single sample once locked', () => {
    const clock = new ClockSync()
    for (let i = 0; i < 8; i++) roundTrip(clock, i * 100, 0, 2, 2)
    // A faster trip carrying a slightly different offset, inside snap range.
    roundTrip(clock, 900, 20, 1, 1)
    expect(clock.offset).toBeGreaterThan(0)
    expect(clock.offset).toBeLessThan(20)
  })

  it('snaps when the peer clock jumps, instead of crawling for minutes', () => {
    const clock = new ClockSync()
    for (let i = 0; i < 8; i++) roundTrip(clock, i * 100, 0, 2, 2)
    // Peer resumed from sleep: a large, real step.
    roundTrip(clock, 900, 5_000, 1, 1)
    expect(clock.offset).toBeCloseTo(5_000, 0)
  })

  it('ignores a backwards round trip', () => {
    const clock = new ClockSync()
    for (let i = 0; i < 8; i++) roundTrip(clock, i * 100, 300, 2, 2)
    const before = clock.offset
    clock.addRoundTrip(1_000, 1_000, 900)
    expect(clock.offset).toBeCloseTo(before, 10)
  })

  it('ignores non-finite timestamps', () => {
    const clock = new ClockSync()
    for (let i = 0; i < 8; i++) roundTrip(clock, i * 100, 300, 2, 2)
    const before = clock.offset
    clock.addRoundTrip(Number.NaN, 10, 20)
    expect(clock.offset).toBeCloseTo(before, 10)
  })

  it('drops history on reset', () => {
    const clock = new ClockSync()
    for (let i = 0; i < 8; i++) roundTrip(clock, i * 100, 700, 2, 2)
    clock.reset()
    expect(clock.isLocked).toBe(false)
    expect(clock.offset).toBe(0)
    expect(clock.bestRtt).toBe(0)
  })

  it('forgets an old fast sample once it falls out of the window', () => {
    const clock = new ClockSync()
    // One very fast trip, then enough slow ones to push it out of the window.
    roundTrip(clock, 0, 0, 0.5, 0.5)
    for (let i = 1; i < 40; i++) roundTrip(clock, i * 100, 0, 20, 20)
    expect(clock.bestRtt).toBeCloseTo(40, 0)
  })
})
