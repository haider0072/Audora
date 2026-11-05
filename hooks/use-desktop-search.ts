"use client"

import { useCallback, useMemo, useState } from "react"

import type { UseTidalSearchReturn } from "@/hooks/use-tidal-search"

/** What the search needs of the online search: a query it was last sent, and a way to send another. */
export type OnlineSearch = Pick<UseTidalSearchReturn, "search" | "searchQuery" | "setSearchQuery">

export interface DesktopSearch {
  /** What is typed in the field. */
  query: string
  /**
   * The field is out, in place of the library's head: from the Search
   * button, its shortcut or the first letter typed, until it is closed.
   */
  active: boolean
  setQuery: (value: string) => void
  /** Return pressed, or the offer to look online taken: searches online for what is typed. */
  submit: () => void
  /** Bring the field out, as it was left. */
  start: () => void
  /** Bring back the last online search, to see its downloads. */
  showOnline: () => void
  close: () => void
}

/**
 * The desktop's one search, across the library and online. The library is
 * searched as you type. Online is searched only when asked, by Return or by
 * the offer to look online, since every search there is a request to a
 * service that limits them.
 */
export function useDesktopSearch({ search, searchQuery: searchedOnline, setSearchQuery }: OnlineSearch): DesktopSearch {
  const [query, setQueryState] = useState("")
  const [active, setActive] = useState(false)

  const setQuery = useCallback((value: string) => {
    setQueryState(value)
    if (value.trim()) setActive(true)
  }, [])

  const submit = useCallback(() => {
    const trimmed = query.trim()
    if (!trimmed) return
    setSearchQuery(trimmed)
    // The online search reports its own failures, as its error.
    void search(trimmed)
  }, [query, search, setSearchQuery])

  const start = useCallback(() => setActive(true), [])

  const showOnline = useCallback(() => {
    setQueryState(searchedOnline)
    setActive(true)
  }, [searchedOnline])

  const close = useCallback(() => {
    setQueryState("")
    setActive(false)
  }, [])

  return useMemo(
    () => ({ query, active, setQuery, submit, start, showOnline, close }),
    [query, active, setQuery, submit, start, showOnline, close],
  )
}
