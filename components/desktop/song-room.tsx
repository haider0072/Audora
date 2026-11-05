/**
 * The room the desktop sits in: the window in the cover's strongest colour,
 * with three lights in its colours glowing in it and a fine grain over them.
 * It takes the song's colours from the `.song-scope` around it, and drifts
 * only while music plays. Styled by `.song-room` in app/globals.css.
 */
export function SongRoom() {
  return (
    <div className="song-room" aria-hidden="true">
      <span className="song-light song-light-1" />
      <span className="song-light song-light-2" />
      <span className="song-light song-light-3" />
    </div>
  )
}
