"use client"

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Search, X } from "lucide-react"

import type { LibraryLayout } from "@/components/library/song-row"
import { StackLayer } from "@/components/stack-layer"
import { StatusMessage } from "@/components/status-message"
import { ScrollArea } from "@/components/ui/scroll-area"
import { isApplePlatform } from "@/hooks/use-search-shortcut"
import type { TidalView, UseTidalSearchReturn } from "@/hooks/use-tidal-search"
import { AlbumDetailView } from "./album-detail-view"
import { ArtistDetailView } from "./artist-detail-view"
import { DownloadQueueBar } from "./download-queue-bar"
import { OnlineFilters } from "./online-filters"
import type { OnlineActions, OnlinePreview, UnopenedPage } from "./online-rows"
import { PasteLinkField, PasteLinkToggle } from "./paste-link"
import { SearchResults } from "./search-results"

interface OnlineSearchSidebarProps {
  dab: UseTidalSearchReturn
  layout: LibraryLayout
  /** The search field is elsewhere, as in the desktop's header: the panel has none of its own. */
  hideSearch?: boolean
  /** Words typed since the last online search, which it has not looked for yet. */
  pendingQuery?: string
  onSearchPending?: () => void
}

/** The search field, where the panel has its own, as on the phone. */
function OnlineField({ query, onQueryChange, onSearch }: { query: string; onQueryChange: (query: string) => void; onSearch: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <form
      className="soft-field online-field"
      role="search"
      onSubmit={(event) => {
        event.preventDefault()
        onSearch()
      }}
    >
      <Search aria-hidden="true" />
      <input
        ref={inputRef}
        type="search"
        enterKeyHint="search"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="Search online"
        aria-label="Search online"
        autoComplete="off"
        spellCheck={false}
      />
      {query && (
        <button
          type="button"
          className="soft-field-clear"
          aria-label="Clear the search"
          onClick={() => {
            onQueryChange("")
            inputRef.current?.focus()
          }}
        >
          <X aria-hidden="true" />
        </button>
      )}
    </form>
  )
}

/** Words typed but not yet looked for online: pressing it, or Return in the field, looks. */
function PendingSearch({ query, onSearch }: { query: string; onSearch: () => void }) {
  return (
    <button type="button" className="online-pending" onClick={onSearch}>
      <Search aria-hidden="true" />
      <span className="online-pending-text">Search online for “{query}”</span>
      <kbd className="online-pending-key" aria-hidden="true">
        {isApplePlatform() ? "Return" : "Enter"}
      </kbd>
    </button>
  )
}

/**
 * The online search: songs, albums and artists to preview and download, in
 * FLAC, laid out like the library. Albums and artists open as pages over the
 * results, which stay where they were for Back; downloads under way show at
 * the foot. Styled by `.online`, with the library's rows and pages.
 */
export function OnlineSearchSidebar({ dab, layout, hideSearch = false, pendingQuery, onSearchPending }: OnlineSearchSidebarProps) {
  const [opening, setOpening] = useState<string | null>(null)
  const [pasteOpen, setPasteOpen] = useState(false)
  const pasteFieldId = useId()
  const pasteToggleRef = useRef<HTMLButtonElement>(null)

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

  if (!dab.isOnline) {
    return (
      <div className="online" data-layout={layout}>
        <StatusMessage title="You're offline" detail="Online search comes back with the connection." />
      </div>
    )
  }

  const busy = dab.isLoadingDetail ? opening : null
  const album = dab.currentView === "album" ? dab.selectedAlbum : null
  const artist = dab.currentView === "artist" ? dab.selectedArtist : null
  const backLabel =
    (dab.previousView === "album" && dab.selectedAlbum?.title) ||
    (dab.previousView === "artist" && dab.selectedArtist?.artist.name) ||
    "Results"

  const results = dab.searchResults
  // A search that failed says so over the results; a page that didn't open
  // says so on the row or the link that opened it.
  const failed = dab.error
  const failedRequest = failed?.request
  const unopened: UnopenedPage | null =
    failed && failedRequest && failedRequest.kind !== "search"
      ? { id: failedRequest.id, note: failed.retryable ? "Couldn't open" : "Not available" }
      : null
  const failure = failed && failedRequest?.kind === "search" && (
    <StatusMessage
      title={failed.title}
      detail={failed.detail}
      action={{ label: "Try again", onClick: dab.retry }}
      inline={results !== null}
    />
  )
  const pending = pendingQuery && onSearchPending ? <PendingSearch query={pendingQuery} onSearch={onSearchPending} /> : null

  const closePaste = () => {
    setPasteOpen(false)
    pasteToggleRef.current?.focus()
  }

  return (
    <div className="online" data-layout={layout}>
      <div className="library-stack">
        <StackLayer covered={Boolean(album || artist)} className="library-layer">
          <div className="online-controls">
            {!hideSearch && <OnlineField query={dab.searchQuery} onQueryChange={dab.setSearchQuery} onSearch={() => void dab.search()} />}
            <OnlineFilters
              type={dab.searchType}
              onTypeChange={dab.setSearchType}
              source={dab.searchSource}
              onSourceChange={dab.setSearchSource}
              results={results}
            >
              <PasteLinkToggle ref={pasteToggleRef} open={pasteOpen} fieldId={pasteFieldId} onToggle={() => setPasteOpen((open) => !open)} />
            </OnlineFilters>
            {pasteOpen && (
              <PasteLinkField id={pasteFieldId} onSubmit={dab.downloadFromUrl} resolving={dab.isResolvingUrl} onClose={closePaste} />
            )}
          </div>
          <ScrollArea className="online-scroll">
            <div className="online-body" aria-busy={dab.isSearching || undefined}>
              {pending}
              {results ? (
                <>
                  {failure && <div className="online-notice">{failure}</div>}
                  <SearchResults
                    results={results}
                    type={dab.searchType}
                    layout={layout}
                    showSource={dab.searchSource === "auto"}
                    downloads={dab.downloads}
                    isInLibrary={dab.isInLibrary}
                    preview={preview}
                    opening={busy}
                    unopened={unopened}
                    actions={actions}
                    onShowAll={() => dab.setSearchType("all")}
                  />
                </>
              ) : dab.isSearching ? (
                <StatusMessage title="Searching online…" />
              ) : (
                failure ||
                (!pending && (
                  <StatusMessage title="Search online" detail="Songs, albums and artists from Qobuz and Amazon, in FLAC." />
                ))
              )}
            </div>
          </ScrollArea>
        </StackLayer>
        {album && (
          <div className="library-layer" data-kind="page">
            <AlbumDetailView
              key={album.id}
              album={album}
              layout={layout}
              backLabel={backLabel}
              downloads={dab.downloads}
              isInLibrary={dab.isInLibrary}
              preview={preview}
              opening={busy}
              unopened={unopened}
              actions={actions}
              onDownloadAll={dab.downloadAlbum}
              onBack={back}
            />
          </div>
        )}
        {artist && (
          <div className="library-layer" data-kind="page">
            <ArtistDetailView
              key={artist.artist.id}
              data={artist}
              layout={layout}
              backLabel={backLabel}
              opening={busy}
              unopened={unopened}
              onOpenAlbum={actions.openAlbum}
              onBack={back}
            />
          </div>
        )}
      </div>
      <DownloadQueueBar downloads={dab.downloads} />
      {/* The row's word for it is seen; this is heard. */}
      <p className="sr-only" role="status">
        {unopened && failed ? `${failed.title}. ${failed.detail}` : ""}
      </p>
    </div>
  )
}
