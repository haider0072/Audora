import { memo } from "react"

function songCount(count: number): string {
  return `${count} ${count === 1 ? "song" : "songs"}`
}

/** An artist's name over their songs; it stays at the top while their songs scroll by. */
export const ArtistHeader = memo(function ArtistHeader({ artist, count }: { artist: string; count: number }) {
  return (
    <div className="library-artist">
      <h3 className="library-artist-name" title={artist}>
        {artist}
      </h3>
      <span className="library-count">{songCount(count)}</span>
    </div>
  )
})

/** An album's name over its songs. */
export const AlbumHeader = memo(function AlbumHeader({ album, count }: { album: string; count: number }) {
  return (
    <div className="library-album">
      <h4 className="library-album-name" title={album}>
        {album}
      </h4>
      <span className="library-count">{songCount(count)}</span>
    </div>
  )
})
