"use client"

import { useCallback, useMemo, useState } from "react"

import type { UseTidalSearchReturn } from "@/hooks/use-tidal-search"

/** Where the desktop's search looks: the library, as you type, or online, when asked. */
export type SearchTab = "library" | "online"

/** What the search needs of the online search: a query it was last sent, and a way to send another. */
export type OnlineSearch = Pick<UseTidalSearchReturn, "search" | "searchQuery" | "setSearchQuery">

export interface DesktopSearch {
  /** What is typed in the header's field. */
  query: string
  /** The results show in place of the library, from the first letter typed until the search is closed. */
  open: boolean
  tab: SearchTab
  setQuery: (value: string) => void
  /** Return pressed: the Online tab searches for what is typed; the library already shows it. */
  submit: () => void
  /** Switching to Online searches there, unless it already holds results for what is typed. */
  setTab: (tab: SearchTab) => void
  /** Bring back the last online search, to see its downloads. */
  showOnline: () => void
  close: () => void
}

/**
 * The desktop's one search, across the library and online. The library is
 * searched as you type. Online is searched only when asked, by its tab or by
 * Return, since every search there is a request to a service that limits them.
 */
export function useDesktopSearch({ search, searchQuery: searchedOnline, setSearchQuery }: OnlineSearch): DesktopSearch {
  const [query, setQueryState] = useState("")
  const [open, setOpen] = useState(false)
  const [tab, setTabState] = useState<SearchTab>("library")

  const sendOnline = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return
      setSearchQuery(trimmed)
      // The online search reports its own failures, as its error.
      void search(trimmed)
    },
    [search, setSearchQuery],
  )

  const setQuery = useCallback((value: string) => {
    setQueryState(value)
    if (value.trim()) setOpen(true)
  }, [])

  const submit = useCallback(() => {
    if (tab === "online") sendOnline(query)
  }, [tab, query, sendOnline])

  const setTab = useCallback(
    (next: SearchTab) => {
      setTabState(next)
      if (next === "online" && query.trim() !== searchedOnline) sendOnline(query)
    },
    [query, searchedOnline, sendOnline],
  )

  const showOnline = useCallback(() => {
    setQueryState(searchedOnline)
    setOpen(true)
    setTabState("online")
  }, [searchedOnline])

  const close = useCallback(() => {
    setQueryState("")
    setOpen(false)
    setTabState("library")
  }, [])

  return useMemo(
    () => ({ query, open, tab, setQuery, submit, setTab, showOnline, close }),
    [query, open, tab, setQuery, submit, setTab, showOnline, close],
  )
}
