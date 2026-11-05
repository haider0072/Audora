"use client"

import { memo, useId, useRef, useState } from "react"

import { PageFrame } from "@/components/library/page-frame"
import type { LibraryLayout } from "@/components/library/song-row"
import { StatusMessage } from "@/components/status-message"
import type { TidalDiscographyResult } from "@/lib/tidal-types"
import { formatCount, formatDetails } from "@/lib/utils"
import { OnlineAlbumRow, OnlineCover, releaseYear, type UnopenedPage } from "./online-rows"

/** Past this many characters, a biography starts folded to its first lines. */
const BIOGRAPHY_FOLD = 240

interface ArtistDetailViewProps {
  data: TidalDiscographyResult
  layout: LibraryLayout
  /** Where Back goes: the results, or the album's page. */
  backLabel: string
  /** The album whose page is on the way. */
  opening: string | null
  /** The album whose page didn't open. */
  unopened: UnopenedPage | null
  onOpenAlbum: (albumId: string) => void
  onBack: () => void
}

/** A long biography opens to its full length on request. */
function Biography({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const textId = useId()
  const folds = text.length > BIOGRAPHY_FOLD
  return (
    <div className="online-bio">
      <p id={textId} className="online-bio-text" data-folded={(folds && !open) || undefined}>
        {text}
      </p>
      {folds && (
        <button
          type="button"
          className="online-bio-toggle"
          aria-expanded={open}
          aria-controls={textId}
          onClick={() => setOpen((wasOpen) => !wasOpen)}
        >
          {open ? "Less" : "More"}
        </button>
      )}
    </div>
  )
}

/** An artist found online, laid out like an artist's page in the library: who they are, and their albums. */
export const ArtistDetailView = memo(function ArtistDetailView({
  data,
  layout,
  backLabel,
  opening,
  unopened,
  onOpenAlbum,
  onBack,
}: ArtistDetailViewProps) {
  const { artist, albums } = data
  const titleId = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)

  return (
    <PageFrame layout={layout} titleId={titleId} headingRef={headingRef} backLabel={backLabel} onBack={onBack}>
      <header className="library-page-head" data-kind="artist">
        <OnlineCover src={artist.image} kind="artist" className="library-page-cover" />
        <div className="library-page-info">
          <p className="library-page-kind">Artist</p>
          <h2 id={titleId} ref={headingRef} tabIndex={-1} className="library-page-title">
            {artist.name}
          </h2>
          <p className="library-page-meta">{formatCount(albums.length, "album")}</p>
        </div>
      </header>
      {artist.biography && <Biography text={artist.biography} />}
      {albums.length > 0 ? (
        <ol className="online-list">
          {albums.map((album) => (
            <li key={album.id} className="online-item">
              <OnlineAlbumRow
                album={album}
                layout={layout}
                sub={formatDetails(
                  releaseYear(album.releaseDate),
                  album.trackCount > 0 && formatCount(album.trackCount, "song"),
                  album.genre,
                )}
                showSource={false}
                opening={opening === album.id}
                note={unopened?.id === album.id ? unopened.note : undefined}
                onOpen={onOpenAlbum}
              />
            </li>
          ))}
        </ol>
      ) : (
        <div className="online-page-empty">
          <StatusMessage inline title="No albums found" detail="Nothing of theirs is available online." />
        </div>
      )}
    </PageFrame>
  )
})
