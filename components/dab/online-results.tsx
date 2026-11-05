"use client"

import { useId, useRef, useState, type ReactNode } from "react"
import { Search } from "lucide-react"

import type { LibraryLayout } from "@/components/library/song-row"
import { StatusMessage } from "@/components/status-message"
import { isApplePlatform } from "@/hooks/use-search-shortcut"
import type { UseTidalSearchReturn } from "@/hooks/use-tidal-search"
import { AlbumDetailView } from "./album-detail-view"
import { ArtistDetailView } from "./artist-detail-view"
import { OnlineFilters } from "./online-filters"
import { PasteLinkField, PasteLinkToggle } from "./paste-link"
import { SearchResults } from "./search-results"
import type { OnlineBrowser } from "./use-online-browser"

/** The online search can't be reached without a connection. */
export function OfflineNotice({ inline = false }: { inline?: boolean }) {
  return <StatusMessage title="You're offline" detail="Online search comes back with the connection." inline={inline} />
}

/** Words typed but not yet looked for online: pressing it, or Return in the field, looks. */
export function PendingSearch({ query, onSearch }: { query: string; onSearch: () => void }) {
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

interface OnlineControlsProps {
  dab: UseTidalSearchReturn
  /** Its own search field, where it has one, as on the phone. */
  field?: ReactNode
}

/** What to show of the online search and where it looks, and the way to paste a song's link. */
export function OnlineControls({ dab, field }: OnlineControlsProps) {
  const [pasteOpen, setPasteOpen] = useState(false)
  const pasteFieldId = useId()
  const pasteToggleRef = useRef<HTMLButtonElement>(null)

  const closePaste = () => {
    setPasteOpen(false)
    pasteToggleRef.current?.focus()
  }

  return (
    <div className="online-controls">
      {field}
      <OnlineFilters
        type={dab.searchType}
        onTypeChange={dab.setSearchType}
        source={dab.searchSource}
        onSourceChange={dab.setSearchSource}
        results={dab.searchResults}
      >
        <PasteLinkToggle ref={pasteToggleRef} open={pasteOpen} fieldId={pasteFieldId} onToggle={() => setPasteOpen((open) => !open)} />
      </OnlineFilters>
      {pasteOpen && (
        <PasteLinkField id={pasteFieldId} onSubmit={dab.downloadFromUrl} resolving={dab.isResolvingUrl} onClose={closePaste} />
      )}
    </div>
  )
}

interface OnlineBodyProps {
  dab: UseTidalSearchReturn
  browser: OnlineBrowser
  layout: LibraryLayout
  /** The offer to look for words typed since the last search. */
  pending?: ReactNode
}

/** What the online search found, or how it stands: searching, failed, or waiting to be asked. */
export function OnlineBody({ dab, browser, layout, pending }: OnlineBodyProps) {
  const results = dab.searchResults
  // A search that failed says so over the results; a page that didn't open
  // says so on the row or the link that opened it.
  const failed = dab.error
  const failure = failed && failed.request?.kind === "search" && (
    <StatusMessage
      title={failed.title}
      detail={failed.detail}
      action={{ label: "Try again", onClick: dab.retry }}
      inline={results !== null}
    />
  )

  return (
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
            preview={browser.preview}
            opening={browser.opening}
            unopened={browser.unopened}
            actions={browser.actions}
            onShowAll={() => dab.setSearchType("all")}
          />
        </>
      ) : dab.isSearching ? (
        <StatusMessage title="Searching online…" />
      ) : (
        failure ||
        (!pending && <StatusMessage title="Search online" detail="Songs, albums and artists from Qobuz and Amazon, in FLAC." />)
      )}
    </div>
  )
}

interface OnlinePagesProps {
  dab: UseTidalSearchReturn
  browser: OnlineBrowser
  layout: LibraryLayout
}

/** The album or the artist open over the results, as a layer of the stack they share. */
export function OnlinePages({ dab, browser, layout }: OnlinePagesProps) {
  const { album, artist } = browser
  return (
    <>
      {album && (
        <div className="library-layer" data-kind="page">
          <AlbumDetailView
            key={album.id}
            album={album}
            layout={layout}
            backLabel={browser.backLabel}
            downloads={dab.downloads}
            isInLibrary={dab.isInLibrary}
            preview={browser.preview}
            opening={browser.opening}
            unopened={browser.unopened}
            actions={browser.actions}
            onDownloadAll={dab.downloadAlbum}
            onBack={browser.back}
          />
        </div>
      )}
      {artist && (
        <div className="library-layer" data-kind="page">
          <ArtistDetailView
            key={artist.artist.id}
            data={artist}
            layout={layout}
            backLabel={browser.backLabel}
            opening={browser.opening}
            unopened={browser.unopened}
            onOpenAlbum={browser.actions.openAlbum}
            onBack={browser.back}
          />
        </div>
      )}
    </>
  )
}

/** A page that didn't open: its row's word for it is seen; this is heard. */
export function OnlineAnnouncement({ dab, browser }: { dab: UseTidalSearchReturn; browser: OnlineBrowser }) {
  return (
    <p className="sr-only" role="status">
      {browser.unopened && dab.error ? `${dab.error.title}. ${dab.error.detail}` : ""}
    </p>
  )
}
