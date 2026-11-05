"use client"

import { useCallback, useMemo, useState } from "react"

import type { DesktopView } from "@/components/desktop/song-views"
import type { DesktopSearch } from "@/hooks/use-desktop-search"

/** What the desktop's right half shows: the library, the search, one of the song's views, or Settings. */
export type DesktopPane = "library" | "search" | "view" | "settings"

export interface DesktopPanes {
  pane: DesktopPane
  /** The song's view open in the library's place, kept from song to song. */
  view: DesktopView | null
  /** Open a view in the library's place, or with `null` close it. */
  setView: (view: DesktopView | null) => void
  toggleSettings: () => void
  closeSettings: () => void
  /** Close the search and Settings, leaving the song's view as it is: what full screen has room for. */
  closeSearchAndSettings: () => void
  /** Bring the search out, in place of whatever is open. */
  startSearch: () => void
  /** Bring back the last online search, to see its downloads, in place of whatever is open. */
  showOnline: () => void
  /** Back to the library, closing whatever is open in its place. */
  showLibrary: () => void
}

/**
 * The desktop's right half: the library, or one thing at a time in its place,
 * the search, a song's view or Settings. Opening one closes the others.
 */
export function useDesktopPane(search: Pick<DesktopSearch, "active" | "start" | "showOnline" | "close">): DesktopPanes {
  const [view, setViewState] = useState<DesktopView | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { active, start, showOnline: showSearchOnline, close } = search

  const setView = useCallback(
    (next: DesktopView | null) => {
      close()
      setSettingsOpen(false)
      setViewState(next)
    },
    [close],
  )

  const toggleSettings = useCallback(() => {
    close()
    setViewState(null)
    setSettingsOpen((open) => !open)
  }, [close])

  const closeSettings = useCallback(() => setSettingsOpen(false), [])

  const closeSearchAndSettings = useCallback(() => {
    close()
    setSettingsOpen(false)
  }, [close])

  const startSearch = useCallback(() => {
    setViewState(null)
    setSettingsOpen(false)
    start()
  }, [start])

  const showOnline = useCallback(() => {
    setViewState(null)
    setSettingsOpen(false)
    showSearchOnline()
  }, [showSearchOnline])

  const showLibrary = useCallback(() => {
    close()
    setViewState(null)
    setSettingsOpen(false)
  }, [close])

  let pane: DesktopPane = "library"
  if (active) pane = "search"
  else if (settingsOpen) pane = "settings"
  else if (view) pane = "view"

  return useMemo(
    () => ({ pane, view, setView, toggleSettings, closeSettings, closeSearchAndSettings, startSearch, showOnline, showLibrary }),
    [pane, view, setView, toggleSettings, closeSettings, closeSearchAndSettings, startSearch, showOnline, showLibrary],
  )
}
