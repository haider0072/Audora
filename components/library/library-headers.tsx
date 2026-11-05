import { memo } from "react"
import { ChevronRight } from "lucide-react"

import type { LibraryPage } from "@/lib/library-pages"
import { formatCount } from "@/lib/utils"

interface HeaderProps {
  count: number
  onOpen: (page: LibraryPage) => void
}

/**
 * An artist's name over their songs; it stays at the top while their songs
 * scroll by. The whole header opens the artist's page: the name's button
 * stretches over it (`.library-header-open` in app/globals.css).
 */
export const ArtistHeader = memo(function ArtistHeader({ artist, count, onOpen }: HeaderProps & { artist: string }) {
  return (
    <div className="library-artist">
      <h3 className="library-artist-name">
        <button type="button" className="library-header-open" title={artist} onClick={() => onOpen({ kind: "artist", artist })}>
          {artist}
        </button>
      </h3>
      <span className="library-count">{formatCount(count, "song")}</span>
      <ChevronRight className="library-header-chevron" aria-hidden="true" />
    </div>
  )
})

/** An album's name over its songs. The whole header opens the album's page. */
export const AlbumHeader = memo(function AlbumHeader({
  artist,
  album,
  count,
  onOpen,
}: HeaderProps & { artist: string; album: string }) {
  return (
    <div className="library-album">
      <h4 className="library-album-name">
        <button
          type="button"
          className="library-header-open"
          title={album}
          onClick={() => onOpen({ kind: "album", artist, album })}
        >
          {album}
        </button>
      </h4>
      <span className="library-count">{formatCount(count, "song")}</span>
      <ChevronRight className="library-header-chevron" aria-hidden="true" />
    </div>
  )
})
