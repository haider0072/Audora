"use client"

import { useMemo, useSyncExternalStore } from "react"

/**
 * Where rows laid end to end begin: `offsets[i]` is the top of row `i`, and
 * the last entry is the height of them all.
 */
export function rowOffsets(heights: readonly number[]): number[] {
  const offsets = new Array<number>(heights.length + 1)
  offsets[0] = 0
  for (let i = 0; i < heights.length; i++) offsets[i + 1] = offsets[i] + heights[i]
  return offsets
}

/** The row that holds `y`: the last row starting at or above it, within [0, rows - 1]. */
export function rowAt(offsets: readonly number[], y: number): number {
  const rows = offsets.length - 1
  if (rows <= 0) return 0
  let low = 0
  let high = rows - 1
  while (low < high) {
    const mid = (low + high + 1) >> 1
    if (offsets[mid] <= y) low = mid
    else high = mid - 1
  }
  return low
}

export interface RowWindow {
  /** The first row at least partly in view. */
  first: number
  /** Rows to render: [start, end), the rows in view and a few either side. */
  start: number
  end: number
}

const EMPTY_WINDOW: RowWindow = { first: 0, start: 0, end: 0 }

/** The rows to render for a viewport scrolled to `scrollTop` and `height` tall. */
export function windowFor(offsets: readonly number[], scrollTop: number, height: number, overscan: number): RowWindow {
  const rows = offsets.length - 1
  if (rows <= 0) return EMPTY_WINDOW
  const first = rowAt(offsets, Math.max(0, scrollTop))
  const last = rowAt(offsets, Math.max(0, scrollTop + height - 1))
  return { first, start: Math.max(0, first - overscan), end: Math.min(rows, last + 1 + overscan) }
}

function sameWindow(a: RowWindow, b: RowWindow): boolean {
  return a.first === b.first && a.start === b.start && a.end === b.end
}

/**
 * The window over one viewport, as a store React can subscribe to: it
 * changes only when the rows to render do, not with every pixel scrolled.
 */
function createWindowStore(viewport: HTMLElement | null, offsets: readonly number[], overscan: number) {
  let current = EMPTY_WINDOW
  return {
    subscribe(notify: () => void) {
      if (!viewport) return () => {}
      viewport.addEventListener("scroll", notify, { passive: true })
      const resize = new ResizeObserver(notify)
      resize.observe(viewport)
      return () => {
        viewport.removeEventListener("scroll", notify)
        resize.disconnect()
      }
    },
    getSnapshot(): RowWindow {
      if (!viewport) return EMPTY_WINDOW
      const next = windowFor(offsets, viewport.scrollTop, viewport.clientHeight, overscan)
      if (!sameWindow(current, next)) current = next
      return current
    },
  }
}

/** Which rows of a list laid out by `offsets` are in view of `viewport`, kept current as it scrolls and resizes. */
export function useRowWindow(viewport: HTMLElement | null, offsets: readonly number[], overscan: number): RowWindow {
  const store = useMemo(() => createWindowStore(viewport, offsets, overscan), [viewport, offsets, overscan])
  return useSyncExternalStore(store.subscribe, store.getSnapshot, () => EMPTY_WINDOW)
}
