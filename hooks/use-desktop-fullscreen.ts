"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react"

import { withViewTransition } from "@/lib/view-transition"

/** How long the pointer rests in full screen before the way out fades, until it moves again. */
export const FULLSCREEN_IDLE_MS = 3000

export interface DesktopFullscreen {
  /** The frame shows the song alone: no brand, no library, only the song's open view beside it. */
  full: boolean
  /** In full screen, the pointer has rested a while. */
  idle: boolean
  enter: () => void
  exit: () => void
  /**
   * Out of full screen, if in it, with another change in the same step, such
   * as a page to show, so the change lands in the frame it is for: in sight,
   * and in reach of focus. Outside full screen the change simply happens.
   */
  exitWith: (change: () => void) => void
  toggle: () => void
}

interface FullscreenOptions {
  /** The way out, which takes focus when what opened full screen is gone or was the cover. */
  exitRef: RefObject<HTMLElement>
  /**
   * Where focus goes on the way out when what opened full screen has gone,
   * or was the cover. The same function from render to render.
   */
  returnTo: () => HTMLElement | null
  /** What full screen closes as it opens, in the same step: what it has no room for. The same function from render to render. */
  onEnter: () => void
}

/**
 * Full screen on the desktop: a mode of the frame rather than a player of its
 * own, so the song stays where it is and only the rest of the window changes.
 * Escape leaves it, unless something in it took the key first, such as a
 * menu closing. Focus goes back to what opened it, or, when that has gone or
 * was the cover, to where `returnTo` says.
 */
export function useDesktopFullscreen({ exitRef, returnTo, onEnter }: FullscreenOptions): DesktopFullscreen {
  const [full, setFull] = useState(false)
  const [idle, setIdle] = useState(false)
  // What opened full screen, to hand focus back to on the way out: only
  // something the keyboard reaches, which the cover is not.
  const opener = useRef<HTMLElement | null>(null)
  const wasFull = useRef(false)

  const enter = useCallback(() => {
    if (full) return
    const active = document.activeElement
    opener.current = active instanceof HTMLElement && active.tabIndex >= 0 ? active : null
    setIdle(false)
    withViewTransition(() => {
      onEnter()
      setFull(true)
    })
  }, [full, onEnter])

  const exit = useCallback(() => {
    if (full) withViewTransition(() => setFull(false))
  }, [full])

  const exitWith = useCallback(
    (change: () => void) => {
      if (!full) {
        change()
        return
      }
      withViewTransition(() => {
        setFull(false)
        change()
      })
    },
    [full],
  )

  useLayoutEffect(() => {
    if (full) {
      wasFull.current = true
      if (!opener.current?.isConnected) exitRef.current?.focus()
      return
    }
    if (!wasFull.current) return
    wasFull.current = false
    const from = opener.current
    opener.current = null
    // Focus that moved on to something still here stays there. Focus that was
    // on the way out, which has just gone, goes back to what opened full screen.
    const active = document.activeElement
    if (active instanceof HTMLElement && active !== document.body) return
    const target = from?.isConnected ? from : returnTo()
    target?.focus()
  }, [full, exitRef, returnTo])

  useEffect(() => {
    if (!full) return
    const leaveOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) exit()
    }
    window.addEventListener("keydown", leaveOnEscape)
    return () => window.removeEventListener("keydown", leaveOnEscape)
  }, [full, exit])

  useEffect(() => {
    if (!full) return
    let timer = window.setTimeout(() => setIdle(true), FULLSCREEN_IDLE_MS)
    const wake = () => {
      setIdle(false)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setIdle(true), FULLSCREEN_IDLE_MS)
    }
    const events = ["pointermove", "pointerdown", "keydown"] as const
    events.forEach((name) => window.addEventListener(name, wake))
    return () => {
      window.clearTimeout(timer)
      events.forEach((name) => window.removeEventListener(name, wake))
    }
  }, [full])

  return { full, idle: full && idle, enter, exit, exitWith, toggle: full ? exit : enter }
}
