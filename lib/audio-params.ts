/**
 * Shared AudioParam helpers for click-free, sample-accurate gain control.
 *
 * All user-driven gain changes must go through these instead of writing
 * `param.value` directly — instant value jumps on a playing graph produce
 * audible zipper noise / pops.
 */

/** Convert decibels to linear gain. */
export const dbToGain = (db: number): number => Math.pow(10, db / 20)

/**
 * Perceptual volume curve: slider position (0-100) → linear gain.
 * The squared taper gives finer control at low levels and preserves the
 * loudness feel of the previous element.volume × masterGain double stage.
 * 100 maps to exactly 1.0 (unity — bit-transparent).
 */
export const volumeToGain = (vol: number): number => Math.pow(vol / 100, 2)

/** Default smoothing time constant (seconds) for gain ramps. */
export const GAIN_RAMP_TC = 0.02

type HoldableParam = AudioParam & {
  cancelAndHoldAtTime?: (cancelTime: number) => AudioParam
}

/**
 * Cancel scheduled automation while keeping the currently-audible value.
 * `cancelAndHoldAtTime` holds the mid-ramp value so a follow-up ramp starts
 * from what the listener actually hears (no jump). The
 * `cancelScheduledValues` fallback (pre-2022 Firefox) may snap back to the
 * last anchor instead — an acceptable degradation on legacy browsers.
 */
export function cancelRamps(param: AudioParam, time: number): void {
  const holdable = param as HoldableParam
  if (typeof holdable.cancelAndHoldAtTime === "function") {
    holdable.cancelAndHoldAtTime(time)
  } else {
    param.cancelScheduledValues(time)
  }
}

/**
 * Smoothly move a param to `target` (anti-zipper) and snap to the exact
 * value once settled. setTargetAtTime alone approaches the target
 * asymptotically and never reaches it; the scheduled setValueAtTime after
 * 8 time constants (residual ≈ 0.03%) pins the param to the exact value so
 * unity really is 1.0 for the transparent-path guarantee.
 */
export function rampToValue(
  param: AudioParam,
  ctx: BaseAudioContext,
  target: number,
  tc: number = GAIN_RAMP_TC
): void {
  const now = ctx.currentTime
  cancelRamps(param, now)
  param.setTargetAtTime(target, now, tc)
  param.setValueAtTime(target, now + tc * 8)
}
