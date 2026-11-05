"use client"

import { useMemo, useSyncExternalStore } from "react"

/** How long after the last scroll event a list counts as still. */
const SETTLE_MS = 1200

function createActivityStore(viewport: HTMLElement | null) {
  let scrolling = false
  let settle: number | undefined
  return {
    subscribe(notify: () => void) {
      if (!viewport) return () => {}
      const onScroll = () => {
        window.clearTimeout(settle)
        settle = window.setTimeout(() => {
          scrolling = false
          notify()
        }, SETTLE_MS)
        if (scrolling) return
        scrolling = true
        notify()
      }
      viewport.addEventListener("scroll", onScroll, { passive: true })
      return () => {
        viewport.removeEventListener("scroll", onScroll)
        window.clearTimeout(settle)
        scrolling = false
      }
    },
    getSnapshot: () => scrolling,
  }
}

/**
 * Whether `viewport` is being scrolled, settling a moment after the last
 * scroll. Changes twice per gesture, not with every scroll event.
 */
export function useScrollActivity(viewport: HTMLElement | null): boolean {
  const store = useMemo(() => createActivityStore(viewport), [viewport])
  return useSyncExternalStore(store.subscribe, store.getSnapshot, () => false)
}
