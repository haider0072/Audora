/**
 * Whether the first bytes of a file are those of an audio format the
 * library accepts. Pure.
 *
 * The extension of an object in the bucket is only a claim. Anything that
 * does not open like real audio is kept out of the library, so a misnamed or
 * hostile file is never handed to the player.
 */

/** Bytes needed to tell every accepted format apart. */
export const AUDIO_SIGNATURE_BYTES = 12

function ascii(head: Uint8Array, offset: number, text: string): boolean {
  if (head.length < offset + text.length) return false
  for (let i = 0; i < text.length; i++) {
    if (head[offset + i] !== text.charCodeAt(i)) return false
  }
  return true
}

export function looksLikeAudio(head: Uint8Array): boolean {
  return (
    ascii(head, 0, "fLaC") || // FLAC
    ascii(head, 0, "ID3") || // MP3 (or AAC) behind an ID3v2 tag
    ascii(head, 0, "OggS") || // Ogg Vorbis / Opus
    (ascii(head, 0, "RIFF") && ascii(head, 8, "WAVE")) || // WAV
    ascii(head, 4, "ftyp") || // MP4 / M4A
    // A bare MPEG audio frame or ADTS AAC frame: an 11-bit sync word.
    (head.length >= 2 && head[0] === 0xff && (head[1] & 0xe0) === 0xe0)
  )
}
