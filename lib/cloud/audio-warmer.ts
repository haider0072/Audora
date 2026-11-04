/**
 * Starts cloud songs downloading before they are played. Client only.
 *
 * A cold cloud song spends 0.6–2.1 s between the click and the first sound,
 * almost all of it waiting on R2's first byte. Chromium keeps the media it
 * has fetched in a renderer-wide cache keyed by URL and CORS mode, and an
 * element that later asks for the same URL is served from it: a song warmed
 * this way started in 8–20 ms (measured 2026-11-04 in Brave). So when a song
 * is likely to be played next — the pointer rests on it, a finger lands on
 * it, it is next in the queue — a hidden, muted element loads its opening
 * seconds and is released as soon as playback could start.
 *
 * Browsers without that cache gain nothing and lose a few megabytes per
 * warm-up; the work is bounded either way: two slots, newest intent wins.
 */

/** Warm-ups in flight at once. More only competes with the song playing now. */
const SLOTS = 2

/** Recently warmed URLs that are not warmed again. */
const REMEMBERED = 32

/** A warm-up that has not reached `canplay` by now is abandoned. */
const WARM_TIMEOUT_MS = 10_000

interface Slot {
  element: HTMLAudioElement
  url: string | null
  startedAt: number
  timeout: ReturnType<typeof setTimeout> | null
}

class AudioWarmer {
  private slots: Slot[] = []
  private warmed: string[] = []

  /** Begin loading `url` unless it is loading or was loaded recently. */
  warm(url: string): void {
    if (typeof window === "undefined") return
    if (this.warmed.includes(url) || this.slots.some((slot) => slot.url === url)) return

    const slot = this.freeSlot()
    this.release(slot)
    slot.url = url
    slot.startedAt = Date.now()
    slot.timeout = setTimeout(() => this.release(slot), WARM_TIMEOUT_MS)
    slot.element.src = url
    slot.element.load()
  }

  /** An idle slot, or the one that has been busy longest — newest intent wins. */
  private freeSlot(): Slot {
    const idle = this.slots.find((slot) => slot.url === null)
    if (idle) return idle
    if (this.slots.length < SLOTS) return this.createSlot()
    return this.slots.reduce((oldest, slot) => (slot.startedAt < oldest.startedAt ? slot : oldest))
  }

  private createSlot(): Slot {
    const element = new Audio()
    // Must match the player's elements: the media cache is keyed by CORS mode.
    element.crossOrigin = "anonymous"
    element.preload = "auto"
    element.muted = true
    const slot: Slot = { element, url: null, startedAt: 0, timeout: null }
    element.addEventListener("canplay", () => {
      if (slot.url) this.remember(slot.url)
      this.release(slot)
    })
    element.addEventListener("error", () => this.release(slot))
    this.slots.push(slot)
    return slot
  }

  private remember(url: string): void {
    this.warmed = [url, ...this.warmed.filter((known) => known !== url)].slice(0, REMEMBERED)
  }

  /** Stop the slot's download. What it fetched stays in the media cache. */
  private release(slot: Slot): void {
    if (slot.timeout) clearTimeout(slot.timeout)
    slot.timeout = null
    if (slot.url === null) return
    slot.url = null
    slot.element.removeAttribute("src")
    slot.element.load()
  }
}

export const audioWarmer = new AudioWarmer()
