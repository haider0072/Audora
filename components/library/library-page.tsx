"use client"

import { memo, useId, useMemo, useRef, type RefObject } from "react"
import { ChevronRight, Play } from "lucide-react"

import { AlbumArtDisplay } from "@/components/album-art-display"
import {
  albumPage,
  artistPage,
  pageSections,
  type AlbumSection,
  type LibraryPage as Page,
} from "@/lib/library-pages"
import type { Song } from "@/lib/song"
import { formatCount, formatDetails, formatTotalDuration } from "@/lib/utils"
import { PageFrame } from "./page-frame"
import type { SongActions } from "./song-menu"
import { SongRow, type LibraryLayout, type RowPlayback } from "./song-row"
import { useRowActions, type LibraryActions } from "./use-row-actions"

/** On an artist's page a song's menu still goes to its album; on an album's, to its artist. */
const GO_TO_FROM: Record<Page["kind"], { artist: boolean; album: boolean }> = {
  artist: { artist: false, album: true },
  album: { artist: true, album: false },
}

interface LibraryPageProps {
  page: Page
  /** The library, in playback order. */
  songs: readonly Song[]
  layout: LibraryLayout
  currentSongId?: string
  playback?: RowPlayback
  onSelect: (song: Song) => void
  actions: LibraryActions
  onOpen: (page: Page) => void
  onBack: () => void
  /** Where Back goes: the library, or the page underneath. */
  backLabel: string
}

interface TracksProps {
  section: AlbumSection
  layout: LibraryLayout
  currentSongId?: string
  playback?: RowPlayback
  onSelect: (song: Song) => void
  actions: SongActions
}

/** An album's songs, numbered. Every row shares the album's cover, so none draws it. */
function Tracks({ section, layout, currentSongId, playback, onSelect, actions }: TracksProps) {
  return (
    <ol className="library-page-tracks">
      {section.songs.map((song, i) => (
        <li key={song.id} className="library-page-track">
          <SongRow
            song={song}
            number={section.numbers[i]}
            detailed={false}
            art={false}
            playback={song.id === currentSongId ? playback : undefined}
            layout={layout}
            onSelect={onSelect}
            actions={actions}
          />
        </li>
      ))}
    </ol>
  )
}

interface HeadProps {
  titleId: string
  headingRef: RefObject<HTMLHeadingElement>
  onPlay: () => void
}

function PlayButton({ onPlay }: { onPlay: () => void }) {
  return (
    <button type="button" className="library-page-play" onClick={onPlay}>
      <Play aria-hidden="true" />
      Play
    </button>
  )
}

function AlbumHead({
  page,
  section,
  titleId,
  headingRef,
  onPlay,
  onOpen,
}: HeadProps & { page: Extract<Page, { kind: "album" }>; section: AlbumSection; onOpen: (page: Page) => void }) {
  const first = section.songs[0]
  return (
    <header className="library-page-head" data-kind="album">
      <AlbumArtDisplay
        songId={first.id}
        albumArt={first.albumArt}
        thumbnail={first.albumArtThumb}
        title={`${section.album} cover`}
        size="large"
        rounded="rounded-xl"
        className="library-page-cover"
      />
      <div className="library-page-info">
        <p className="library-page-kind">Album</p>
        <h2 id={titleId} ref={headingRef} tabIndex={-1} className="library-page-title">
          {section.album}
        </h2>
        <button type="button" className="library-page-link" onClick={() => onOpen(artistPage(first))}>
          {page.artist}
        </button>
        <p className="library-page-meta">
          {formatDetails(section.year, formatCount(section.songs.length, "song"), formatTotalDuration(section.duration))}
        </p>
        <PlayButton onPlay={onPlay} />
      </div>
    </header>
  )
}

function ArtistHead({
  page,
  sections,
  titleId,
  headingRef,
  onPlay,
}: HeadProps & { page: Extract<Page, { kind: "artist" }>; sections: AlbumSection[] }) {
  const songCount = sections.reduce((count, section) => count + section.songs.length, 0)
  const duration = sections.reduce((total, section) => total + section.duration, 0)
  return (
    <header className="library-page-head" data-kind="artist">
      <div className="library-page-info">
        <p className="library-page-kind">Artist</p>
        <h2 id={titleId} ref={headingRef} tabIndex={-1} className="library-page-title">
          {page.artist}
        </h2>
        <p className="library-page-meta">
          {formatDetails(formatCount(sections.length, "album"), formatCount(songCount, "song"), formatTotalDuration(duration))}
        </p>
        <PlayButton onPlay={onPlay} />
      </div>
    </header>
  )
}

/** One of an artist's albums on their page: its cover and name open the album's own page. */
function ArtistAlbum({ section, onOpen, ...tracks }: Omit<TracksProps, "section"> & { section: AlbumSection; onOpen: (page: Page) => void }) {
  const first = section.songs[0]
  return (
    <section className="library-page-album">
      <div className="library-page-album-head">
        <AlbumArtDisplay
          songId={first.id}
          albumArt={first.albumArt}
          thumbnail={first.albumArtThumb}
          title={`${section.album} cover`}
          size="small"
          rounded="rounded-md"
        />
        <div className="library-page-album-text">
          <h3 className="library-page-album-title">
            <button type="button" className="library-header-open" title={section.album} onClick={() => onOpen(albumPage(first))}>
              {section.album}
            </button>
          </h3>
          <p className="library-page-album-meta">{formatDetails(section.year, formatCount(section.songs.length, "song"))}</p>
        </div>
        <ChevronRight className="library-header-chevron" aria-hidden="true" />
      </div>
      <Tracks section={section} {...tracks} />
    </section>
  )
}

/** An artist's or an album's page, over the library list. */
export const LibraryPageView = memo(function LibraryPageView({
  page,
  songs,
  layout,
  currentSongId,
  playback,
  onSelect,
  actions,
  onOpen,
  onBack,
  backLabel,
}: LibraryPageProps) {
  const titleId = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const sections = useMemo(() => pageSections(songs, page), [songs, page])
  const { select, rowActions } = useRowActions({ onSelect, actions, onOpen, goTo: GO_TO_FROM[page.kind] })

  // The navigation closes a page whose songs are all gone; until it has, there is nothing to draw.
  if (sections.length === 0) return null
  const first = sections[0].songs[0]
  const rows = { layout, currentSongId, playback, onSelect: select, actions: rowActions }

  return (
    <PageFrame layout={layout} titleId={titleId} headingRef={headingRef} backLabel={backLabel} onBack={onBack}>
      {page.kind === "album" ? (
        <>
          <AlbumHead
            page={page}
            section={sections[0]}
            titleId={titleId}
            headingRef={headingRef}
            onPlay={() => select(first)}
            onOpen={onOpen}
          />
          <Tracks section={sections[0]} {...rows} />
        </>
      ) : (
        <>
          <ArtistHead page={page} sections={sections} titleId={titleId} headingRef={headingRef} onPlay={() => select(first)} />
          {sections.map((section) => (
            <ArtistAlbum key={section.key} section={section} onOpen={onOpen} {...rows} />
          ))}
        </>
      )}
    </PageFrame>
  )
})
