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
 * and size, and a renamed upload would no longer match its local copy. Files
 * the app names itself, such as downloads, get a name that passes from the
 * start, from `makeUploadName`, so every copy of them carries that one name.
 */

/** R2's ceiling for a single PutObject: 5 GiB minus 5 MiB. */
export const MAX_UPLOAD_BYTES = 5 * 1024 ** 3 - 5 * 1024 ** 2

/** S3 keys are at most 1024 bytes; one path segment on most file systems, 255. */
const MAX_NAME_BYTES = 255

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/
const ALL_CONTROL_CHARACTERS = new RegExp(CONTROL_CHARACTERS.source, "g")
const SLASHES = /[/\\]/g

/** Bytes one character takes in UTF-8, the encoding of object keys and file names. */
function utf8Length(character: string): number {
  const point = character.codePointAt(0) ?? 0
  return point < 0x80 ? 1 : point < 0x800 ? 2 : point < 0x10000 ? 3 : 4
}

function byteLength(text: string): number {
  let bytes = 0
  for (const character of text) bytes += utf8Length(character)
  return bytes
}

/** The longest start of `text` that fits in `maxBytes`, cut between characters. */
function fitBytes(text: string, maxBytes: number): string {
  let bytes = 0
  let end = 0
  for (const character of text) {
    bytes += utf8Length(character)
    if (bytes > maxBytes) break
    end += character.length
  }
  return text.slice(0, end)
}

export type UploadNameCheck = { ok: true; name: string } | { ok: false; reason: string }

export function checkUploadName(raw: string): UploadNameCheck {
  const name = raw.normalize("NFC")
  if (name.trim() === "" || name === "." || name === "..") return { ok: false, reason: "The file has no name" }
  if (name.includes("/") || name.includes("\\")) return { ok: false, reason: "File names cannot contain slashes" }
  if (CONTROL_CHARACTERS.test(name)) return { ok: false, reason: "The file name has control characters" }
  if (byteLength(name) > MAX_NAME_BYTES) return { ok: false, reason: "The file name is too long" }
  if (!isAudioFileName(name)) return { ok: false, reason: "Not an audio file" }
  return { ok: true, name }
}

/**
 * A name `checkUploadName` accepts, for a file the app names itself: `stem`
 * with each slash as a dash and each control character as a space, cut to
 * fit, then `.extension`. A download called "AC/DC - Back In Black" becomes
 * "AC-DC - Back In Black.flac", in the library and in the cloud alike.
 */
export function makeUploadName(stem: string, extension: string): string {
  const suffix = `.${extension}`
  const clean = stem.normalize("NFC").replace(SLASHES, "-").replace(ALL_CONTROL_CHARACTERS, " ").trim()
  return `${fitBytes(clean, MAX_NAME_BYTES - byteLength(suffix)).trimEnd()}${suffix}`
}
