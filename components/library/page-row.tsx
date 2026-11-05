"use client"

import { memo } from "react"
import { ChevronRight } from "lucide-react"

import { AlbumArtDisplay } from "@/components/album-art-display"
import { pageTitle, type LibraryPage } from "@/lib/library-pages"
import type { PageMatch } from "@/lib/library-search"
import { formatCount } from "@/lib/utils"

interface PageRowProps {
  match: PageMatch
  onOpen: (page: LibraryPage) => void
}

/**
 * An album or an artist in the library, as a search finds it: its cover, its
 * name and what it holds, and a chevron, since it opens its page. Laid out
 * like a library row (`.library-row`); `.page-row` leads it with the cover.
 */
export const PageRow = memo(function PageRow({ match, onOpen }: PageRowProps) {
  const { page, count, cover, year } = match
  const songs = formatCount(count, "song")
  const isArtist = page.kind === "artist"
  return (
    <div className="library-row page-row" data-layout="desktop">
      <button type="button" className="library-row-main" onClick={() => onOpen(page)}>
        <AlbumArtDisplay
          songId={cover.id}
          albumArt={cover.albumArt}
          thumbnail={cover.albumArtThumb}
          title={`${pageTitle(page)} cover`}
          size="row"
          rounded={isArtist ? "rounded-full" : "rounded-lg"}
          className="library-row-art"
        />
        <span className="library-row-text">
          <span className="library-row-title">{pageTitle(page)}</span>
          <span className="library-row-sub">{isArtist ? `Artist · ${songs}` : `Album · ${page.artist} · ${songs}`}</span>
        </span>
        <span className="page-row-trail">
          {year !== undefined && <span className="library-row-duration">{year}</span>}
          <ChevronRight className="page-row-chevron" aria-hidden="true" />
        </span>
      </button>
    </div>
  )
})
