"use client"

import { useId, useLayoutEffect, useMemo, useRef, useState } from "react"

import { BackHeader, ViewModeToggle } from "@/components/desktop/view-header"
import { DownloadQueueBar } from "@/components/dab/download-queue-bar"
import {
  OfflineNotice,
  OnlineAnnouncement,
  OnlineBody,
  OnlineControls,
  OnlinePages,
  PendingSearch,
} from "@/components/dab/online-results"
import { useOnlineBrowser } from "@/components/dab/use-online-browser"
import { LibraryPanel } from "@/components/library/library-panel"
import { PageRow } from "@/components/library/page-row"
import { SongRow, type RowPlayback } from "@/components/library/song-row"
import { useRowActions, type LibraryActions } from "@/components/library/use-row-actions"
import { StackLayer } from "@/components/stack-layer"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useLibraryNavigation } from "@/hooks/use-library-navigation"
import type { UseTidalSearchReturn } from "@/hooks/use-tidal-search"
import { pageKey, type LibraryPage } from "@/lib/library-pages"
import type { LibraryViewMode } from "@/lib/library-rows"
import { libraryMatches } from "@/lib/library-search"
import type { Song } from "@/lib/song"
import { formatCount } from "@/lib/utils"

/** Both of a song's pages are a menu item away in the results. */
const GO_TO_EITHER = { artist: true, album: true }

interface LibrarySide {
  /** The library, in playback order. */
  songs: readonly Song[]
  viewMode: LibraryViewMode
  onViewModeChange: (mode: LibraryViewMode) => void
  currentSongId?: string
  /** How the current song is doing, for its row. */
  playback?: RowPlayback
  onSelect: (song: Song) => void
  actions: LibraryActions
  /** Show an album's or an artist's page in the library, in place of the search. */
  onShowPage: (page: LibraryPage) => void
}

interface SearchPaneProps extends LibrarySide {
  /** What is typed, which the library is searched for. */
  query: string
  online: UseTidalSearchReturn
  /** Words typed since the last online search, which it has not looked for yet. */
  pendingQuery?: string
  onSearchPending: () => void
}

interface AllMatchesProps extends Omit<LibrarySide, "onShowPage"> {
  query: string
  total: number
  onBack: () => void
}

/** Every song in the library that matches, as the library lists them, with their own pages over them. */
function AllMatches({ query, total, onBack, viewMode, onViewModeChange, ...library }: AllMatchesProps) {
  const navigation = useLibraryNavigation(library.songs, query)
  return (
    <div className="search-all">
      <BackHeader to="Results" onBack={onBack} meta={`${formatCount(total, "song")} in your library`}>
        <ViewModeToggle value={viewMode} onChange={onViewModeChange} />
      </BackHeader>
      <LibraryPanel layout="desktop" viewMode={viewMode} query={query} navigation={navigation} {...library} />
    </div>
  )
}

/**
 * The desktop's search results, in the library's place: the library's side at
 * a glance (its best few songs, the albums and artists the words name, and
 * every match a step away), then what the search found online, in one list.
 * Online is looked for only when asked, by Return or by the offer at its top.
 * Online albums and artists open as pages over the results; downloads under
 * way show at the foot. Styled by `.search-pane`.
 */
export function SearchPane({ query, online, pendingQuery, onSearchPending, onShowPage, ...library }: SearchPaneProps) {
  const { songs, currentSongId, playback, onSelect, actions } = library
  const matches = useMemo(() => libraryMatches(songs, query), [songs, query])
  const browser = useOnlineBrowser(online)
  const { select, rowActions } = useRowActions({ onSelect, actions, onOpen: onShowPage, goTo: GO_TO_EITHER })
  const libraryHeading = useId()
  const onlineHeading = useId()

  const [showingAll, setShowingAll] = useState(false)
  const showAllRef = useRef<HTMLButtonElement>(null)
  const returning = useRef(false)
  // Runs after the layers' own effects, so the results Back uncovered are no
  // longer inert by now: focus goes back to the button that showed them all.
  useLayoutEffect(() => {
    if (showingAll || !returning.current) return
    returning.current = false
    showAllRef.current?.focus({ preventScroll: true })
  }, [showingAll])

  const pending = pendingQuery ? <PendingSearch query={pendingQuery} onSearch={onSearchPending} /> : null
  const pageOpen = Boolean(browser.album || browser.artist)
  const shown = matches.songs.length + matches.albums.length + matches.artists.length

  return (
    <div className="search-pane">
      <div className="library-stack">
        <StackLayer covered={showingAll || pageOpen} className="library-layer">
          <ScrollArea className="search-scroll">
            <section className="search-section" aria-labelledby={libraryHeading}>
              <div className="search-section-head">
                <h2 id={libraryHeading} className="search-section-title">
                  In your library
                </h2>
                <p className="search-section-meta type-data">{formatCount(matches.total, "song")}</p>
                {matches.total > matches.songs.length && (
                  <button ref={showAllRef} type="button" className="text-button" onClick={() => setShowingAll(true)}>
                    Show all
                  </button>
                )}
              </div>
              {shown === 0 ? (
                <p className="search-none">Nothing in your library for “{query.trim()}”.</p>
              ) : (
                <ol className="search-list">
                  {matches.songs.map((song, index) => (
                    <li key={song.id}>
                      <SongRow
                        song={song}
                        number={index + 1}
                        detailed
                        playback={song.id === currentSongId ? playback : undefined}
                        layout="desktop"
                        onSelect={select}
                        actions={rowActions}
                      />
                    </li>
                  ))}
                  {[...matches.albums, ...matches.artists].map((match) => (
                    <li key={pageKey(match.page)}>
                      <PageRow match={match} onOpen={onShowPage} />
                    </li>
                  ))}
                </ol>
              )}
            </section>
            <section className="search-section" aria-labelledby={onlineHeading}>
              <div className="search-section-head">
                <h2 id={onlineHeading} className="search-section-title">
                  Online
                </h2>
                <p className="search-section-meta type-data">Qobuz and Amazon</p>
              </div>
              {online.isOnline ? (
                <>
                  <OnlineControls dab={online} />
                  <OnlineBody dab={online} browser={browser} layout="desktop" pending={pending} />
                </>
              ) : (
                <OfflineNotice inline />
              )}
            </section>
          </ScrollArea>
        </StackLayer>
        {showingAll && (
          <div className="library-layer" data-kind="page">
            <AllMatches
              query={query}
              total={matches.total}
              onBack={() => {
                returning.current = true
                setShowingAll(false)
              }}
              {...library}
            />
          </div>
        )}
        <OnlinePages dab={online} browser={browser} layout="desktop" />
      </div>
      <DownloadQueueBar downloads={online.downloads} />
      <OnlineAnnouncement dab={online} browser={browser} />
    </div>
  )
}
