/**
 * Playback position, held outside React state on purpose.
 *
 * `timeupdate` fires roughly four times a second for as long as a track plays.
 * While the position lived in the player component's `useState`, every one of
 * those events re-rendered that component and everything below it — including
 * the whole playlist. With a large library that is hundreds of rows re-rendering
 * four times a second to display a number none of them show.
 *
 * Keeping the position in an external store lets the handful of components that
 * actually render it subscribe directly, so the rest of the tree never enters
 * the render path. The position is read through `usePlaybackTime`.
 *
 * Updates are also suppressed while the document is hidden. Chromium pauses
 * `requestAnimationFrame` for hidden windows but deliberately keeps firing
 * `timeupdate` so playback can continue, which otherwise means a minimised
 * player renders UI nobody is looking at. The latest value is still recorded
 * while hidden — it is only the notification that waits — and subscribers are
 * woken once on the way back to visible so they never show a stale position.
 */

type Listener = () => void

const listeners = new Set<Listener>()

let currentTime = 0
let visibilityBound = false

function emit(): void {
  listeners.forEach((listener) => listener())
}

function handleVisibilityChange(): void {
  // Coming back into view: publish whatever accumulated while hidden.
  if (!document.hidden) emit()
}

function bindVisibility(): void {
  if (visibilityBound || typeof document === "undefined") return
  document.addEventListener("visibilitychange", handleVisibilityChange)
  visibilityBound = true
}

function unbindVisibility(): void {
  if (!visibilityBound || typeof document === "undefined") return
  document.removeEventListener("visibilitychange", handleVisibilityChange)
  visibilityBound = false
}

export function subscribeToPlaybackTime(listener: Listener): () => void {
  bindVisibility()
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) unbindVisibility()
  }
}

export function getPlaybackTime(): number {
  return currentTime
}

/**
 * Server snapshot for `useSyncExternalStore`. Playback has not started during
 * SSR, so the position is always zero there; returning a constant also keeps
 * the value referentially stable across hydration.
 */
export function getServerPlaybackTime(): number {
  return 0
}

/**
 * Record the current playback position.
 *
 * Safe to call at `timeupdate` frequency: identical values are dropped, and
 * while the document is hidden the value is stored without notifying anyone.
 */
export function setPlaybackTime(time: number): void {
  if (time === currentTime) return
  currentTime = time

  if (typeof document !== "undefined" && document.hidden) return
  emit()
}

/**
 * Reset to zero and always notify, regardless of visibility.
 *
 * Track changes and stops must land immediately: unlike a progress tick, a
 * stale non-zero position here would be visibly wrong the moment the window is
 * looked at again, and there is no following tick to correct it while paused.
 */
export function resetPlaybackTime(): void {
  if (currentTime === 0) return
  currentTime = 0
  emit()
}
