/**
 * The audio formats the cloud library holds, by file name. Pure and safe for
 * both the server and the browser, so the upload picker, the upload route
 * and the indexer agree on what counts as music.
 */

const CONTENT_TYPES: Record<string, string> = {
  flac: "audio/flac",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  wav: "audio/wav",
  ogg: "audio/ogg",
  opus: "audio/ogg",
}

/** For a file input's `accept`: every supported extension. */
export const AUDIO_FILE_ACCEPT = Object.keys(CONTENT_TYPES)
  .map((extension) => `.${extension}`)
  .join(",")

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".")
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase()
}

export function isAudioFileName(name: string): boolean {
  return extensionOf(name) in CONTENT_TYPES
}

/** The type an audio file is stored and served as, from its extension. */
export function audioContentType(name: string): string {
  return CONTENT_TYPES[extensionOf(name)] ?? "application/octet-stream"
}
