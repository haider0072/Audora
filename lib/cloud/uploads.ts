import { createHash } from "node:crypto"

import { audioContentType } from "./audio-files"
import type { CloudConfig } from "./config"
import { LIBRARY_PREFIX } from "./library-keys"
import { R2Client } from "./r2"

/**
 * Where an upload goes, and the URL to send it to. Server only.
 *
 * The browser PUTs the file straight to R2 with the URL this signs, so the
 * audio never passes through a function and no size limit but R2's applies.
 * Uploads land beside the existing songs, at `library/<file name>`, which the
 * indexer picks up on the client's next listing.
 */

/** R2's ceiling for a single PutObject: 5 GiB minus 5 MiB. */
export const MAX_UPLOAD_BYTES = 5 * 1024 ** 3 - 5 * 1024 ** 2

/**
 * How long a signed upload URL may be started for. The client signs just
 * before each upload starts, and an upload in progress is not cut off when
 * the URL expires, so this only has to cover the wait for a free slot.
 */
const UPLOAD_URL_LIFETIME_SECONDS = 15 * 60

export type UploadPlan =
  | { status: "upload"; key: string; url: string; headers: Record<string, string> }
  /** The library already holds this track; nothing to send. */
  | { status: "exists"; key: string }

/**
 * Plan the upload of one file, already checked by `checkUploadName`.
 *
 * Songs are one track when their name and size match — the identity
 * `trackSyncKey` gives them everywhere else — so a file already stored under
 * its name at the same size is reported as `exists`. A different file with
 * the same name goes to a key derived from both, which can only ever hold
 * that one track.
 */
export async function planUpload(config: CloudConfig, name: string, size: number): Promise<UploadPlan> {
  const client = new R2Client(config)

  const offer = async (key: string): Promise<UploadPlan> => {
    const signed = await client.presignPut(key, {
      contentType: audioContentType(name),
      contentLength: size,
      expiresInSeconds: UPLOAD_URL_LIFETIME_SECONDS,
    })
    return { status: "upload", key, ...signed }
  }

  const primary = `${LIBRARY_PREFIX}${name}`
  const atPrimary = await client.head(primary)
  if (!atPrimary) return offer(primary)
  if (atPrimary.size === size) return { status: "exists", key: primary }

  const digest = createHash("sha256").update(`${name}\n${size}`).digest("hex").slice(0, 12)
  const secondary = `${LIBRARY_PREFIX}${digest}/${name}`
  return (await client.head(secondary)) ? { status: "exists", key: secondary } : offer(secondary)
}
