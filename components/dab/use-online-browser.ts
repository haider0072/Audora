"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"

import type { TidalView, UseTidalSearchReturn } from "@/hooks/use-tidal-search"
import type { TidalAlbum, TidalDiscographyResult } from "@/lib/tidal-types"
import type { OnlineActions, OnlinePreview, UnopenedPage } from "./online-rows"

/** Where the online search stands: its results, and the album or artist page open over them. */
export interface OnlineBrowser {
  /** What the rows can do, which never changes. */
  actions: OnlineActions
  /** Back from a page, handing focus to what opened it. */
  back: () => void
  preview: OnlinePreview
  /** The album or artist whose page is on the way. */
  opening: string | null
  /** The album or artist whose page didn't open. */
  unopened: UnopenedPage | null
  album: TidalAlbum | null
  artist: TidalDiscographyResult | null
  /** What a page's Back goes back to. */
  backLabel: string
}

/**
 * The online search's results and the pages that open over them. Albums and
 * artists open as pages over the results, which stay where they were for
 * Back, and Back hands focus to what opened the page.
 */
export function useOnlineBrowser(dab: UseTidalSearchReturn): OnlineBrowser {
  const [opening, setOpening] = useState<string | null>(null)

  // What had focus as each page opened, so Back can hand focus back to it.
  const pendingOpener = useRef<HTMLElement | null>(null)
  const openers = useRef(new Map<TidalView, HTMLElement>())
  const leaving = useRef<TidalView | null>(null)

  // The hook's functions change whenever a download moves on. Rows are handed
  // these instead, which never change, so a download redraws only its own row.
  const latest = useRef(dab)
  useEffect(() => {
    latest.current = dab
  })
  const { actions, back } = useMemo(() => {
    const open = (id: string, view: (id: string) => Promise<void>) => {
      const focused = document.activeElement
      pendingOpener.current = focused instanceof HTMLElement ? focused : null
      setOpening(id)
      void view(id)
    }
    const rowActions: OnlineActions = {
      preview: (track) => latest.current.togglePreview(track),
      download: (track) => void latest.current.downloadTrack(track),
      cancel: (trackId) => latest.current.cancelDownload(trackId),
      openAlbum: (albumId) => open(albumId, latest.current.viewAlbum),
      openArtist: (artistId) => open(artistId, latest.current.viewArtist),
    }
    const goBack = () => {
      leaving.current = latest.current.currentView
      latest.current.goBack()
    }
    return { actions: rowActions, back: goBack }
  }, [])

  // Runs after the layers' own effects, so the results Back uncovered are no
  // longer inert by now. A page that came back afresh focuses its own title.
  useLayoutEffect(() => {
    const left = leaving.current
    if (left) {
      leaving.current = null
      const opener = openers.current.get(left)
      openers.current.delete(left)
      if (opener?.isConnected && !opener.closest("[inert]")) opener.focus({ preventScroll: true })
      return
    }
    if (dab.currentView !== "search" && pendingOpener.current) {
      openers.current.set(dab.currentView, pendingOpener.current)
      pendingOpener.current = null
    }
  }, [dab.currentView])

  const preview = useMemo<OnlinePreview>(
    () => ({ trackId: dab.previewTrackId, playing: dab.previewIsPlaying, loading: dab.previewIsLoading }),
    [dab.previewTrackId, dab.previewIsPlaying, dab.previewIsLoading],
  )

  const failedRequest = dab.error?.request
  const unopened: UnopenedPage | null =
    dab.error && failedRequest && failedRequest.kind !== "search"
      ? { id: failedRequest.id, note: dab.error.retryable ? "Couldn't open" : "Not available" }
      : null

  return {
    actions,
    back,
    preview,
    opening: dab.isLoadingDetail ? opening : null,
    unopened,
    album: dab.currentView === "album" ? dab.selectedAlbum : null,
    artist: dab.currentView === "artist" ? dab.selectedArtist : null,
    backLabel:
      (dab.previousView === "album" && dab.selectedAlbum?.title) ||
      (dab.previousView === "artist" && dab.selectedArtist?.artist.name) ||
      "Results",
  }
}
