import { PlaylistStorage } from "./playlist-storage"

/**
 * Audio bytes for a song, fetched from IndexedDB on demand.
 *
 * The library holds metadata only — see the note on `Song.file`. A song that
 * still carries its File (just imported, or just downloaded) short-circuits;
 * everything else reads its blob here, at the moment it is actually needed.
 *
 * Returns null when the record is gone, which the caller must treat as an
 * unplayable track rather than an exception: the store is user-clearable and
 * the browser may evict it, so a missing record is expected, not exceptional.
 */
export async function loadSongFile(song: {
  id: string
  file?: File
}): Promise<File | null> {
  if (song.file) return song.file
  return PlaylistStorage.getSongFile(song.id)
}
