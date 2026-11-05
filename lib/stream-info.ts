/**
 * What a file's header says about its audio stream. Pure, and shared by the
 * browser (imports, and the backfill of songs saved before this existed) and
 * the server (the cloud indexer): both read the same few bytes at the head
 * of a file.
 */

/**
 * Bytes from the start of a file that hold its stream info. FLAC needs 42; a
 * WAV's `fmt ` chunk usually sits right after the RIFF header but may follow
 * other chunks.
 */
export const STREAM_INFO_HEAD_BYTES = 4096

/** Formats whose header these readers understand, by the upper-case names songs carry. */
export const STREAM_INFO_FORMATS: ReadonlySet<string> = new Set(["FLAC", "WAV"])

/** The format of an uncompressed stream. */
export interface StreamInfo {
  /** Samples per second. */
  sampleRate: number
  /** Significant bits per sample. */
  bitDepth: number
  channels: number
}

export interface FlacHeader extends StreamInfo {
  /** Samples per channel in the whole stream; 0 when the encoder did not know. */
  totalSamples: number
}

export interface WavHeader {
  /** The `fmt ` chunk's format code, looked through WAVE_FORMAT_EXTENSIBLE to the one it wraps. */
  formatCode: number
  channels: number
  sampleRate: number
  /** Bytes of audio per second, as the header states it. */
  byteRate: number
  /** Significant bits per sample: the extensible format's valid bits when it gives them. */
  bitDepth: number
  /** Size of the `data` chunk, when its header lies inside the bytes read. */
  dataBytes?: number
}

const WAVE_FORMAT_PCM = 0x0001
const WAVE_FORMAT_IEEE_FLOAT = 0x0003
const WAVE_FORMAT_EXTENSIBLE = 0xfffe

/** "fLaC" + the first block's header + the 34-byte STREAMINFO body. */
const FLAC_HEADER_BYTES = 42

function ascii(view: DataView, offset: number, length: number): string {
  let text = ""
  for (let i = 0; i < length; i++) text += String.fromCharCode(view.getUint8(offset + i))
  return text
}

function viewOf(head: ArrayBuffer | Uint8Array): DataView {
  return head instanceof Uint8Array ? new DataView(head.buffer, head.byteOffset, head.byteLength) : new DataView(head)
}

/**
 * FLAC's STREAMINFO, which the format requires to be the first metadata block.
 * From byte 18: a 20-bit sample rate, 3 bits of channels − 1, 5 bits of bits
 * per sample − 1, then a 36-bit sample count.
 */
export function readFlacHeader(head: ArrayBuffer | Uint8Array): FlacHeader | null {
  const view = viewOf(head)
  if (view.byteLength < FLAC_HEADER_BYTES || ascii(view, 0, 4) !== "fLaC") return null
  if ((view.getUint8(4) & 0x7f) !== 0) return null

  const byte = (offset: number) => view.getUint8(offset)
  const sampleRate = (byte(18) << 12) | (byte(19) << 4) | (byte(20) >> 4)
  if (sampleRate === 0) return null
  return {
    sampleRate,
    channels: ((byte(20) >> 1) & 0x07) + 1,
    bitDepth: (((byte(20) & 0x01) << 4) | (byte(21) >> 4)) + 1,
    totalSamples: (byte(21) & 0x0f) * 2 ** 32 + view.getUint32(22),
  }
}

/**
 * A WAV's `fmt ` chunk and the size of its `data` chunk. Chunks are walked
 * from the RIFF header, so a `fmt ` behind other chunks is still found, as
 * long as it lies inside the bytes read.
 */
export function readWavHeader(head: ArrayBuffer | Uint8Array): WavHeader | null {
  const view = viewOf(head)
  if (view.byteLength < 12 || ascii(view, 0, 4) !== "RIFF" || ascii(view, 8, 4) !== "WAVE") return null

  let header: WavHeader | null = null
  let offset = 12
  while (offset + 8 <= view.byteLength) {
    const id = ascii(view, offset, 4)
    const size = view.getUint32(offset + 4, true)
    const body = offset + 8
    if (id === "fmt " && size >= 16 && body + 16 <= view.byteLength) {
      let formatCode = view.getUint16(body, true)
      let bitDepth = view.getUint16(body + 14, true)
      if (formatCode === WAVE_FORMAT_EXTENSIBLE && size >= 40 && body + 26 <= view.byteLength) {
        const validBits = view.getUint16(body + 18, true)
        if (validBits > 0) bitDepth = validBits
        // The sub-format GUID begins with the format code it stands for.
        formatCode = view.getUint16(body + 24, true)
      }
      header = {
        formatCode,
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        byteRate: view.getUint32(body + 8, true),
        bitDepth,
      }
    } else if (id === "data") {
      // The audio follows; nothing after it is a header.
      return header && { ...header, dataBytes: size }
    }
    offset = body + size + (size & 1) // chunks are padded to an even length
  }
  return header
}

/**
 * The stream info of a lossless file from its head: FLAC, or WAV holding
 * plain or floating-point PCM. `null` for anything else, including a WAV
 * that wraps compressed audio, and for a header that does not add up.
 */
export function readStreamInfo(head: ArrayBuffer | Uint8Array): StreamInfo | null {
  const flac = readFlacHeader(head)
  if (flac) return { sampleRate: flac.sampleRate, bitDepth: flac.bitDepth, channels: flac.channels }

  const wav = readWavHeader(head)
  if (!wav || (wav.formatCode !== WAVE_FORMAT_PCM && wav.formatCode !== WAVE_FORMAT_IEEE_FLOAT)) return null
  if (wav.sampleRate === 0 || wav.channels === 0 || wav.bitDepth === 0) return null
  return { sampleRate: wav.sampleRate, bitDepth: wav.bitDepth, channels: wav.channels }
}

export interface MpegFrame {
  /** kbps of this frame. */
  bitrate: number
  sampleRate: number
  /** Samples in each frame of the stream. */
  samplesPerFrame: number
  /** Frames in the whole stream, when this is a Xing or Info frame that counts them. */
  frameCount?: number
}

/** A first frame's header, CRC, the longest side info, and a Xing tag's id, flags and frame count. */
export const MPEG_FRAME_HEAD_BYTES = 4 + 2 + 32 + 12

const MPEG_1 = 3
const LAYER_III = 1
const LAYER_I = 3

/** kbps by bitrate index, for each layer as the header codes it: 1 is Layer III, 3 is Layer I. */
const MPEG1_BITRATES: Record<number, readonly number[]> = {
  1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0],
  2: [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384, 0],
  3: [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, 0],
}
const MPEG2_LAYER_II_III_BITRATES = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0]
/** MPEG-2 and MPEG-2.5 share these. */
const MPEG2_BITRATES: Record<number, readonly number[]> = {
  1: MPEG2_LAYER_II_III_BITRATES,
  2: MPEG2_LAYER_II_III_BITRATES,
  3: [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256, 0],
}
/** Hz by sample-rate index, for each version as the header codes it: 3 is MPEG-1, 2 MPEG-2, 0 MPEG-2.5. */
const MPEG_SAMPLE_RATES: Record<number, readonly number[]> = {
  3: [44_100, 48_000, 32_000],
  2: [22_050, 24_000, 16_000],
  0: [11_025, 12_000, 8_000],
}

/** The frame count of a Xing or Info tag, which follows a Layer III frame's side info. */
function xingFrameCount(frame: DataView, mpeg1: boolean): number | undefined {
  const mono = frame.getUint8(3) >> 6 === 0x03
  const sideInfo = mpeg1 ? (mono ? 17 : 32) : mono ? 9 : 17
  const crc = (frame.getUint8(1) & 0x01) === 0 ? 2 : 0
  const tag = 4 + crc + sideInfo
  if (frame.byteLength < tag + 12) return undefined
  const id = ascii(frame, tag, 4)
  if (id !== "Xing" && id !== "Info") return undefined
  const FRAMES_FLAG = 0x1
  return frame.getUint32(tag + 4) & FRAMES_FLAG ? frame.getUint32(tag + 8) || undefined : undefined
}

/** An MPEG audio frame header and, for a Xing or Info frame, the stream's frame count. */
export function readMpegFrame(bytes: ArrayBuffer | Uint8Array): MpegFrame | null {
  const view = viewOf(bytes)
  if (view.byteLength < 4 || view.getUint8(0) !== 0xff || (view.getUint8(1) & 0xe0) !== 0xe0) return null

  const version = (view.getUint8(1) >> 3) & 0x03
  const layer = (view.getUint8(1) >> 1) & 0x03
  const mpeg1 = version === MPEG_1
  const bitrate = (mpeg1 ? MPEG1_BITRATES : MPEG2_BITRATES)[layer]?.[view.getUint8(2) >> 4]
  const sampleRate = MPEG_SAMPLE_RATES[version]?.[(view.getUint8(2) >> 2) & 0x03]
  if (!bitrate || !sampleRate) return null

  return {
    bitrate,
    sampleRate,
    samplesPerFrame: layer === LAYER_I ? 384 : layer === LAYER_III && !mpeg1 ? 576 : 1152,
    frameCount: layer === LAYER_III ? xingFrameCount(view, mpeg1) : undefined,
  }
}

/** A file's bytes by range: a `File`, or a reader over an object in R2. */
export interface ByteRange {
  slice(start: number, end: number): { arrayBuffer(): Promise<ArrayBuffer> }
}

export interface FlacMetadataChain {
  /** Offset just past the last block header and body read. */
  end: number
  /** Whether the chain's last block was reached, so `end` is where the audio starts. */
  complete: boolean
}

const FLAC_STREAMINFO = 0
const FLAC_INVALID_BLOCK_TYPE = 127

/**
 * Walk a FLAC file's metadata blocks by their 4-byte headers alone, so a
 * large cover is stepped over rather than read. Stops at the block marked
 * last, at the end of the file, once past `limit`, or at a header that
 * cannot be one.
 */
export async function walkFlacMetadata(source: ByteRange, size: number, limit = size): Promise<FlacMetadataChain> {
  const first = 4 // past "fLaC"
  let end = first
  const stop = Math.min(size, limit)
  while (end < stop) {
    const header = new DataView(await source.slice(end, end + 4).arrayBuffer())
    if (header.byteLength < 4) break
    // STREAMINFO comes first and only then, and 127 is no block type: past
    // either, these bytes are not headers (zeros, say, in a damaged file).
    const type = header.getUint8(0) & 0x7f
    const misplaced = end === first ? type !== FLAC_STREAMINFO : type === FLAC_STREAMINFO
    if (type === FLAC_INVALID_BLOCK_TYPE || misplaced) break
    const length = (header.getUint8(1) << 16) | (header.getUint8(2) << 8) | header.getUint8(3)
    end += 4 + length
    if ((header.getUint8(0) & 0x80) !== 0) return { end, complete: end <= size }
  }
  return { end, complete: false }
}

/** Average kbps of `audioBytes` played over `durationSeconds`; undefined when either is unknown. */
export function averageKbps(audioBytes?: number, durationSeconds?: number): number | undefined {
  if (audioBytes === undefined || durationSeconds === undefined) return undefined
  if (!(audioBytes > 0 && durationSeconds > 0)) return undefined
  return Math.round((audioBytes * 8) / (durationSeconds * 1000))
}

/** Stream info, plus the average bitrate of the audio alone where the format marks where it starts. */
export interface StreamDetails extends StreamInfo {
  bitrate?: number
}

/**
 * What a lossless file says about its stream, for a song stored before this
 * was read: the stream info from its head and, from the size of the audio
 * itself (a FLAC file less its metadata blocks, a WAV's `data` chunk), its
 * bitrate. `null` for a file that is not lossless.
 */
export async function readStreamDetails(
  source: ByteRange,
  size: number,
  durationSeconds?: number,
): Promise<StreamDetails | null> {
  const head = await source.slice(0, Math.min(size, STREAM_INFO_HEAD_BYTES)).arrayBuffer()
  const info = readStreamInfo(head)
  if (!info) return null

  let audioBytes: number | undefined
  if (readFlacHeader(head)) {
    const chain = await walkFlacMetadata(source, size)
    if (chain.complete) audioBytes = size - chain.end
  } else {
    audioBytes = readWavHeader(head)?.dataBytes
  }
  return { ...info, bitrate: averageKbps(audioBytes, durationSeconds) }
}
