"use client"

import { useEffect, useRef } from "react"

/** Whether this is an Apple system, where the search shortcut is ⌘K rather than Ctrl+K. */
export function isApplePlatform(): boolean {
  if (typeof navigator === "undefined") return false
  const hints = navigator as Navigator & { userAgentData?: { platform?: string } }
  return /mac|iphone|ipad|ipod/i.test(hints.userAgentData?.platform || navigator.platform)
}

/** The search shortcut as this system writes it, and as `aria-keyshortcuts` names it. */
export function searchShortcut(): { label: string; aria: string } {
  return isApplePlatform() ? { label: "⌘K", aria: "Meta+K" } : { label: "Ctrl K", aria: "Control+K" }
}

/**
 * Calls `onPress` for ⌘K on an Apple system and Ctrl+K elsewhere, wherever
 * focus is, a field included, since the shortcut types nothing. Ctrl+K on a
 * Mac is left alone: there it deletes to the end of the line. A held key
 * presses once.
 */
export function useSearchShortcut(onPress: () => void) {
  const latest = useRef(onPress)
  useEffect(() => {
    latest.current = onPress
  })

  useEffect(() => {
    const apple = isApplePlatform()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.isComposing || event.altKey || event.shiftKey) return
      const modifier = apple ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
      if (!modifier || event.key.toLowerCase() !== "k") return
      event.preventDefault()
      latest.current()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])
}
