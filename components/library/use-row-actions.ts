"use client"

import { useCallback, useEffect, useMemo, useRef } from "react"

import { albumPage, artistPage, type LibraryPage } from "@/lib/library-pages"
import type { Song } from "@/lib/song"
import type { SongActions } from "./song-menu"

/** What a song's menu does besides moving around the library: the playlist manager's own actions. */
export interface LibraryActions {
  playNext: (song: Song) => void
  addToQueue: (song: Song) => void
  removeSong: (songId: string) => void
}

interface RowActionsOptions {
  onSelect: (song: Song) => void
  actions: LibraryActions
  onOpen: (page: LibraryPage) => void
  /** Which pages the menu offers to go to: never the one it is already on. */
  goTo: { artist: boolean; album: boolean }
}

/**
 * The handlers song rows are given. Rows are memoised, so these keep their
 * identity and forward to whatever the options are now.
 */
export function useRowActions({ onSelect, actions, onOpen, goTo }: RowActionsOptions) {
  const latest = useRef({ onSelect, actions, onOpen })
  useEffect(() => {
    latest.current = { onSelect, actions, onOpen }
  }, [onSelect, actions, onOpen])

  const select = useCallback((song: Song) => latest.current.onSelect(song), [])
  const { artist, album } = goTo
  const rowActions = useMemo<SongActions>(
    () => ({
      playNext: (song) => latest.current.actions.playNext(song),
      addToQueue: (song) => latest.current.actions.addToQueue(song),
      remove: (song) => latest.current.actions.removeSong(song.id),
      goToArtist: artist ? (song) => latest.current.onOpen(artistPage(song)) : undefined,
      goToAlbum: album ? (song) => latest.current.onOpen(albumPage(song)) : undefined,
    }),
    [artist, album],
  )

  return { select, rowActions }
}
