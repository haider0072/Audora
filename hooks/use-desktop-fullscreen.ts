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
  toggle: () => void
}

interface FullscreenFocus {
  /** The way out, which takes focus when what opened full screen is gone or was the cover. */
  exitRef: RefObject<HTMLElement>
  /** The way in that comes back with the library's head, for focus when what opened full screen went with it. */
  returnRef: RefObject<HTMLElement>
}

/**
 * Full screen on the desktop: a mode of the frame rather than a player of its
 * own, so the song stays where it is and only the rest of the window changes.
 * Escape leaves it, unless something in it took the key first, such as a
 * menu closing. Focus goes back to what opened it, or, when that went away
 * with the library's head, to the way in that comes back with it.
 */
export function useDesktopFullscreen({ exitRef, returnRef }: FullscreenFocus): DesktopFullscreen {
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
    withViewTransition(() => setFull(true))
  }, [full])

  const exit = useCallback(() => {
    if (full) withViewTransition(() => setFull(false))
  }, [full])

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
    const target = from?.isConnected ? from : returnRef.current
    target?.focus()
  }, [full, exitRef, returnRef])

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

  return { full, idle: full && idle, enter, exit, toggle: full ? exit : enter }
}
