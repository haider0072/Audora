"use client"

import { useEffect, useMemo, useRef, type MouseEvent, type PointerEvent } from "react"

/** How long a finger rests before a press becomes a long press. */
const LONG_PRESS_MS = 500
/** How far a finger may drift and still be pressing, not scrolling. */
const MOVE_TOLERANCE_PX = 10

/**
 * Press and hold for touch and pen: `onLongPress` fires once a finger has
 * stayed put for half a second. Drifting further than a few pixels — the
 * start of a scroll — cancels it, and the click that ends a long press is
 * swallowed, so holding a row never also plays it.
 *
 * The press is claimed (its pointerdown and contextmenu are cancelled), so a
 * right-click menu wrapped around the same element leaves fingers to this and
 * keeps the mouse for itself.
 */
export function useLongPress(onLongPress: () => void) {
  const latest = useRef(onLongPress)
  const timer = useRef<number | undefined>(undefined)
  const origin = useRef<{ x: number; y: number } | null>(null)
  const fired = useRef(false)

  useEffect(() => {
    latest.current = onLongPress
  }, [onLongPress])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  return useMemo(() => {
    const cancel = () => {
      window.clearTimeout(timer.current)
      origin.current = null
    }
    return {
      onPointerDown(event: PointerEvent) {
        cancel()
        fired.current = false
        if (event.pointerType === "mouse") return
        event.preventDefault()
        origin.current = { x: event.clientX, y: event.clientY }
        timer.current = window.setTimeout(() => {
          origin.current = null
          fired.current = true
          latest.current()
        }, LONG_PRESS_MS)
      },
      onPointerMove(event: PointerEvent) {
        const start = origin.current
        if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > MOVE_TOLERANCE_PX) cancel()
      },
      onPointerUp: cancel,
      onPointerCancel: cancel,
      onClickCapture(event: MouseEvent) {
        if (!fired.current) return
        fired.current = false
        event.preventDefault()
        event.stopPropagation()
      },
      // Android raises a context menu for a held finger, sometimes before the
      // timer above, and Windows raises one when it lifts. Either way the
      // press opens this menu once. A mouse's right-click is left alone.
      onContextMenu(event: MouseEvent) {
        const pressing = origin.current !== null
        if (!pressing && !fired.current) return
        event.preventDefault()
        cancel()
        if (fired.current) return
        fired.current = true
        latest.current()
      },
    }
  }, [])
}
