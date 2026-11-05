"use client"

import { useRef } from "react"
import { Search, X } from "lucide-react"

import type { LibraryLayout } from "@/components/library/song-row"
import { StackLayer } from "@/components/stack-layer"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { UseTidalSearchReturn } from "@/hooks/use-tidal-search"
import { DownloadQueueBar } from "./download-queue-bar"
import { OfflineNotice, OnlineAnnouncement, OnlineBody, OnlineControls, OnlinePages, PendingSearch } from "./online-results"
import { useOnlineBrowser } from "./use-online-browser"

interface OnlineSearchSidebarProps {
  dab: UseTidalSearchReturn
  layout: LibraryLayout
  /** The search field is elsewhere: the panel has none of its own. */
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

/**
 * The online search on its own: songs, albums and artists to preview and
 * download, in FLAC, laid out like the library, under its own field and
 * filters. Albums and artists open as pages over the results, which stay
 * where they were for Back; downloads under way show at the foot. Styled by
 * `.online`, with the library's rows and pages.
 */
export function OnlineSearchSidebar({ dab, layout, hideSearch = false, pendingQuery, onSearchPending }: OnlineSearchSidebarProps) {
  const browser = useOnlineBrowser(dab)

  if (!dab.isOnline) {
    return (
      <div className="online" data-layout={layout}>
        <OfflineNotice />
      </div>
    )
  }

  const pending = pendingQuery && onSearchPending ? <PendingSearch query={pendingQuery} onSearch={onSearchPending} /> : null
  const field = !hideSearch && (
    <OnlineField query={dab.searchQuery} onQueryChange={dab.setSearchQuery} onSearch={() => void dab.search()} />
  )

  return (
    <div className="online" data-layout={layout}>
      <div className="library-stack">
        <StackLayer covered={Boolean(browser.album || browser.artist)} className="library-layer">
          <OnlineControls dab={dab} field={field} />
          <ScrollArea className="online-scroll">
            <OnlineBody dab={dab} browser={browser} layout={layout} pending={pending} />
          </ScrollArea>
        </StackLayer>
        <OnlinePages dab={dab} browser={browser} layout={layout} />
      </div>
      <DownloadQueueBar downloads={dab.downloads} />
      <OnlineAnnouncement dab={dab} browser={browser} />
    </div>
  )
}
