/**
 * Minimal MP3 files for tests: an optional ID3v2 tag, then MPEG-1 Layer III
 * stereo at 44.1 kHz — a first frame that is either plain or a Xing frame
 * counting the stream's frames — and filler standing in for the rest.
 */

/** kbps by bitrate index for MPEG-1 Layer III. */
const LAYER_III_BITRATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]

/** A stereo MPEG-1 frame's header and side info, where a Xing tag begins. */
const XING_OFFSET = 4 + 32

function u32be(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]
}

function synchsafe(value: number): number[] {
  return [(value >>> 21) & 0x7f, (value >>> 14) & 0x7f, (value >>> 7) & 0x7f, value & 0x7f]
}

export interface Mp3Fixture {
  /** Bytes of ID3v2 tag body ahead of the audio; no tag when absent. */
  tagBytes?: number
  /** kbps the first frame's header states. */
  bitrate?: number
  /** Make the first frame a Xing frame counting this many frames. */
  xingFrames?: number
  /** Bytes of audio, from the first frame to the end of the file. */
  audioBytes?: number
}

export function buildMp3({ tagBytes, bitrate = 128, xingFrames, audioBytes = 4096 }: Mp3Fixture = {}): Uint8Array<ArrayBuffer> {
  const bitrateIndex = LAYER_III_BITRATES.indexOf(bitrate)
  if (bitrateIndex < 1) throw new Error(`${bitrate} kbps is not an MPEG-1 Layer III bitrate`)

  const tag = tagBytes === undefined ? [] : [0x49, 0x44, 0x33, 4, 0, 0, ...synchsafe(tagBytes), ...new Array(tagBytes).fill(0)]
  const audio = new Uint8Array(audioBytes)
  // Sync, MPEG-1, Layer III, no CRC; the bitrate; 44.1 kHz; stereo.
  audio.set([0xff, 0xfb, bitrateIndex << 4, 0x00])
  if (xingFrames !== undefined) {
    audio.set([0x58, 0x69, 0x6e, 0x67, ...u32be(0x1), ...u32be(xingFrames)], XING_OFFSET) // "Xing", frames flag
  }

  const file = new Uint8Array(tag.length + audioBytes)
  file.set(tag)
  file.set(audio, tag.length)
  return file
}
