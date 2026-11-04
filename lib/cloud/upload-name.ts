import { isAudioFileName } from "./audio-files"

/**
 * Whether a file name may become an object key in the library. Pure, so the
 * picker can drop a file before asking the server about it.
 *
 * The name is used as it is — besides Unicode normalisation, nothing is
 * renamed — because the library matches songs across devices by file name
 * and size, and a renamed upload would no longer match its local copy.
 */

/** S3 keys are at most 1024 bytes; one path segment on most file systems, 255. */
const MAX_NAME_BYTES = 255

// eslint-disable-next-line no-control-regex
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
