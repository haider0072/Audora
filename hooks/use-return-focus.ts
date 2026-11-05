"use client"

import { useMemo, useRef } from "react"

/**
 * Focus for dialogs opened from code rather than from a trigger of their own,
 * which is all Radix hands focus back to. `open` notes what has focus, then
 * opens the dialog; the dialog's `onCloseAutoFocus` returns focus there, if it
 * is still on the page. One serves every such dialog a view opens.
 */
export function useReturnFocus() {
  const opener = useRef<HTMLElement | null>(null)
  return useMemo(
    () => ({
      open(setOpen: (open: boolean) => void) {
        opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
        setOpen(true)
      },
      onCloseAutoFocus(event: Event) {
        const target = opener.current
        opener.current = null
        if (!target?.isConnected) return
        event.preventDefault()
        target.focus()
      },
    }),
    [],
  )
}
