import type { CloudSongRef } from "@/lib/cloud/types"
import type { AudioMetadata } from "@/lib/metadata-extractor"

/** A song in the library: its tags and stream info, and where its audio lives. */
export interface Song extends AudioMetadata {
  id: string
  /** The audio itself. Absent for a song that lives only in the cloud library. */
  file?: File
  url: string
  /** Original file name. Set on restored and cloud songs; fresh imports read `file.name`. */
  fileName?: string
  /** Present when this song is in the cloud library, whether or not it is also local. */
  cloud?: CloudSongRef
  /** Cover sized for list rows. Cloud songs only; everything else draws `albumArt` at every size. */
  albumArtThumb?: string
}
