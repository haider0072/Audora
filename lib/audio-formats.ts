/** File extensions the library can add, lower case and without the dot. */
export const SUPPORTED_AUDIO_EXTENSIONS = ["flac", "mp3", "wav", "m4a", "aac"] as const

/**
 * Whether a file name ends in an extension the library can add. The "._"
 * files macOS leaves beside each file on a non-Mac drive share the name but
 * hold only Finder metadata, so they are left out.
 */
export function isSupportedAudioFile(name: string): boolean {
  if (name.startsWith("._")) return false
  const dot = name.lastIndexOf(".")
  if (dot === -1) return false
  const extension = name.slice(dot + 1).toLowerCase()
  return (SUPPORTED_AUDIO_EXTENSIONS as readonly string[]).includes(extension)
}
