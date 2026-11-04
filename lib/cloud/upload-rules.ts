import { isAudioFileName } from "./audio-files"

/**
 * What the cloud library accepts as an upload. Pure, so the browser can turn
 * a file away before asking the server about it, and the server enforces the
 * same rules.
 *
 * A file name may become an object key in the library as long as it passes
 * `checkUploadName`.
 * The name is used as it is — besides Unicode normalisation, nothing is
 * renamed — because the library matches songs across devices by file name
 * and size, and a renamed upload would no longer match its local copy.
 */

/** R2's ceiling for a single PutObject: 5 GiB minus 5 MiB. */
export const MAX_UPLOAD_BYTES = 5 * 1024 ** 3 - 5 * 1024 ** 2

/** S3 keys are at most 1024 bytes; one path segment on most file systems, 255. */
const MAX_NAME_BYTES = 255

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/

export type UploadNameCheck = { ok: true; name: string } | { ok: false; reason: string }

export function checkUploadName(raw: string): UploadNameCheck {
  const name = raw.normalize("NFC")
  if (name.trim() === "" || name === "." || name === "..") return { ok: false, reason: "The file has no name" }
  if (name.includes("/") || name.includes("\\")) return { ok: false, reason: "File names cannot contain slashes" }
  if (CONTROL_CHARACTERS.test(name)) return { ok: false, reason: "The file name has control characters" }
  if (new TextEncoder().encode(name).length > MAX_NAME_BYTES) return { ok: false, reason: "The file name is too long" }
  if (!isAudioFileName(name)) return { ok: false, reason: "Not an audio file" }
  return { ok: true, name }
}
