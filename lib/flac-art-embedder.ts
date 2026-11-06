/**
 * Embeds metadata (Vorbis Comments) and album art (Picture) into a FLAC file.
 * Works on bytes alone, so the browser (a download to this device) and the
 * server (a download straight to the cloud library) tag a song the same way.
 *
 * FLAC structure:
 *   "fLaC" (4 bytes)
 *   METADATA_BLOCK_HEADER (4 bytes) + STREAMINFO (34 bytes) — always first
 *   ... optional metadata blocks ...
 *   Audio frames
 *
 * Block types: 0=STREAMINFO, 1=PADDING, 2=APPLICATION, 3=SEEKTABLE,
 *              4=VORBIS_COMMENT, 5=CUESHEET, 6=PICTURE
 */

export interface FlacMetadata {
  title?: string
  artist?: string
  album?: string
  albumArtist?: string
  date?: string
  genre?: string
  trackNumber?: string
  discNumber?: string
  copyright?: string
  isrc?: string
}

/** A picture to embed: its bytes, and their type. */
export interface FlacPicture {
  data: Uint8Array
  type: string
}

interface MetadataBlock {
  type: number
  data: Uint8Array
}

const BLOCK_VORBIS_COMMENT = 4
const BLOCK_PICTURE = 6

/** A block's length is 24 bits, so no block may be longer. */
const MAX_BLOCK_BYTES = 0xffffff

const FLAC_MAGIC = [0x66, 0x4c, 0x61, 0x43] // "fLaC"

/** The Vorbis comment each tag is written as, in the order they are written. */
const VORBIS_KEYS: Record<keyof FlacMetadata, string> = {
  title: "TITLE",
  artist: "ARTIST",
  album: "ALBUM",
  albumArtist: "ALBUMARTIST",
  date: "DATE",
  genre: "GENRE",
  trackNumber: "TRACKNUMBER",
  discNumber: "DISCNUMBER",
  copyright: "COPYRIGHT",
  isrc: "ISRC",
}

function isFlac(bytes: Uint8Array): boolean {
  return bytes.length >= FLAC_MAGIC.length && FLAC_MAGIC.every((byte, index) => bytes[index] === byte)
}

/** Every metadata block, as views into `flac`, and where the audio frames start. */
function parseMetadataBlocks(flac: Uint8Array): { blocks: MetadataBlock[]; audioOffset: number } {
  const blocks: MetadataBlock[] = []
  let offset = FLAC_MAGIC.length

  while (offset + 4 <= flac.length) {
    const header = flac[offset]
    const length = (flac[offset + 1] << 16) | (flac[offset + 2] << 8) | flac[offset + 3]
    blocks.push({ type: header & 0x7f, data: flac.subarray(offset + 4, offset + 4 + length) })
    offset += 4 + length
    if ((header & 0x80) !== 0) break
  }

  return { blocks, audioOffset: offset }
}

/** A VORBIS_COMMENT block: the vendor, then each tag that has a value as KEY=value. */
function vorbisCommentBlock(metadata: FlacMetadata): Uint8Array {
  const encoder = new TextEncoder()
  const vendor = encoder.encode("Audora")
  const comments = (Object.keys(VORBIS_KEYS) as (keyof FlacMetadata)[])
    .filter((field) => metadata[field])
    .map((field) => encoder.encode(`${VORBIS_KEYS[field]}=${metadata[field]}`))

  const block = new Uint8Array(4 + vendor.length + 4 + comments.reduce((size, comment) => size + 4 + comment.length, 0))
  const view = new DataView(block.buffer)
  let pos = 0

  // Lengths in a Vorbis comment are little-endian, unlike the rest of FLAC.
  view.setUint32(pos, vendor.length, true)
  pos += 4
  block.set(vendor, pos)
  pos += vendor.length
  view.setUint32(pos, comments.length, true)
  pos += 4
  for (const comment of comments) {
    view.setUint32(pos, comment.length, true)
    pos += 4
    block.set(comment, pos)
    pos += comment.length
  }

  return block
}

/** A PICTURE block holding `picture` as the front cover, with no description. */
function pictureBlock(picture: FlacPicture): Uint8Array {
  const mime = new TextEncoder().encode(picture.type)
  const block = new Uint8Array(4 + 4 + mime.length + 4 + 16 + 4 + picture.data.length)
  const view = new DataView(block.buffer)
  let pos = 0

  view.setUint32(pos, 3) // picture type: front cover
  pos += 4
  view.setUint32(pos, mime.length)
  pos += 4
  block.set(mime, pos)
  pos += mime.length
  // The description is empty, and width, height, colour depth and palette
  // size are unknown, all of which FLAC writes as zero: the bytes are zero already.
  pos += 4 + 16
  view.setUint32(pos, picture.data.length)
  pos += 4
  block.set(picture.data, pos)

  return block
}

/**
 * `flac` with its tags and picture replaced by `metadata` and `picture`, in
 * one new buffer, or `flac` itself when it is not FLAC. Every other block,
 * and the audio, is kept as it is. A picture too large for a FLAC block is
 * left out rather than written broken.
 */
export function withFlacMetadata(
  flac: Uint8Array<ArrayBuffer>,
  metadata: FlacMetadata,
  picture: FlacPicture | null = null,
): Uint8Array<ArrayBuffer> {
  if (!isFlac(flac)) return flac

  const { blocks, audioOffset } = parseMetadataBlocks(flac)
  const written: MetadataBlock[] = [
    ...blocks.filter((block) => block.type !== BLOCK_VORBIS_COMMENT && block.type !== BLOCK_PICTURE),
    { type: BLOCK_VORBIS_COMMENT, data: vorbisCommentBlock(metadata) },
  ]
  const cover = picture && pictureBlock(picture)
  if (cover && cover.length <= MAX_BLOCK_BYTES) written.push({ type: BLOCK_PICTURE, data: cover })

  const audio = flac.subarray(audioOffset)
  const tagged = new Uint8Array(
    FLAC_MAGIC.length + written.reduce((size, block) => size + 4 + block.data.length, 0) + audio.length,
  )
  tagged.set(FLAC_MAGIC)
  let pos = FLAC_MAGIC.length
  written.forEach((block, index) => {
    const isLast = index === written.length - 1
    tagged[pos] = (isLast ? 0x80 : 0x00) | (block.type & 0x7f)
    tagged[pos + 1] = (block.data.length >> 16) & 0xff
    tagged[pos + 2] = (block.data.length >> 8) & 0xff
    tagged[pos + 3] = block.data.length & 0xff
    tagged.set(block.data, pos + 4)
    pos += 4 + block.data.length
  })
  tagged.set(audio, pos)

  return tagged
}

/**
 * Embed metadata and album art into a FLAC file.
 * Replaces existing VORBIS_COMMENT and PICTURE blocks.
 */
export async function embedFlacMetadata(flacBlob: Blob, metadata: FlacMetadata, artBlob?: Blob | null): Promise<Blob> {
  const flac = new Uint8Array(await flacBlob.arrayBuffer())
  if (!isFlac(flac)) return flacBlob

  const picture = artBlob ? { data: new Uint8Array(await artBlob.arrayBuffer()), type: artBlob.type || "image/jpeg" } : null
  return new Blob([withFlacMetadata(flac, metadata, picture)], { type: "audio/flac" })
}
