"use client"

import { useLayoutEffect } from "react"

/**
 * Puts a class on the document's body while the calling component is mounted.
 * Menus, dialogs and toasts are portalled into the body, outside the component
 * that opens them, so this is how they take on a theme that component forces.
 */
export function useBodyClass(className: string) {
  useLayoutEffect(() => {
    document.body.classList.add(className)
    return () => document.body.classList.remove(className)
  }, [className])
}
