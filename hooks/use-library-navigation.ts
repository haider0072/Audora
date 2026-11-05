"use client"

import { startTransition, useCallback, useMemo, useState } from "react"

import { openPage, pageHasSongs, type LibraryPage } from "@/lib/library-pages"
import type { Song } from "@/lib/song"

/** The album and artist pages open over a library list, and the ways between them. */
export interface LibraryNavigation {
  /** Open pages, the top one last; empty while the list itself shows. */
  stack: readonly LibraryPage[]
  /** Open a page from inside the library, going back to it if it is already open. */
  open: (page: LibraryPage) => void
  /** Show a page asked for from elsewhere in the player: just it, over the list. */
  show: (page: LibraryPage) => void
  back: () => void
}

interface Pages {
  /** The search the pages were opened under. */
  query: string
  stack: readonly LibraryPage[]
}

const NO_PAGES: readonly LibraryPage[] = []

/**
 * Pages over a library list of `songs` searched for `query`. A new search
 * goes back to the list, and a page whose songs are all gone closes.
 */
export function useLibraryNavigation(songs: readonly Song[], query = ""): LibraryNavigation {
  const [pages, setPages] = useState<Pages>({ query, stack: NO_PAGES })

  if (pages.stack.length > 0) {
    const kept = pages.query === query ? pages.stack.filter((page) => pageHasSongs(songs, page)) : NO_PAGES
    if (kept.length !== pages.stack.length) setPages({ query, stack: kept })
  }

  // Moving between pages is a transition. It also lets a menu that asked for
  // the move close first: a song's menu holds focus until it has, and a page
  // takes focus as it opens.
  const open = useCallback(
    (page: LibraryPage) =>
      startTransition(() => setPages((current) => ({ query, stack: openPage(current.stack, page) }))),
    [query],
  )
  const show = useCallback((page: LibraryPage) => startTransition(() => setPages({ query, stack: [page] })), [query])
  const back = useCallback(
    () => startTransition(() => setPages((current) => ({ ...current, stack: current.stack.slice(0, -1) }))),
    [],
  )

  return useMemo(() => ({ stack: pages.stack, open, show, back }), [pages.stack, open, show, back])
}
