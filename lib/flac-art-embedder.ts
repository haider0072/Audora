/**
 * Embeds metadata (Vorbis Comments) and album art (Picture) into a FLAC file.
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

interface MetadataBlock {
  type: number
  isLast: boolean
  data: ArrayBuffer
}

const BLOCK_STREAMINFO = 0
const BLOCK_VORBIS_COMMENT = 4
const BLOCK_PICTURE = 6

/** Parse all metadata blocks from a FLAC buffer */
function parseMetadataBlocks(buffer: ArrayBuffer): {
  blocks: MetadataBlock[]
  audioOffset: number
} {
  const view = new DataView(buffer)
  const blocks: MetadataBlock[] = []
  let offset = 4 // skip "fLaC"

  while (offset < buffer.byteLength) {
    const headerByte = view.getUint8(offset)
    const isLast = (headerByte & 0x80) !== 0
    const type = headerByte & 0x7f
    const length =
      (view.getUint8(offset + 1) << 16) |
      (view.getUint8(offset + 2) << 8) |
      view.getUint8(offset + 3)

    const data = buffer.slice(offset + 4, offset + 4 + length)
    blocks.push({ type, isLast, data })

    offset += 4 + length
    if (isLast) break
  }

  return { blocks, audioOffset: offset }
}

/** Build a VORBIS_COMMENT metadata block */
function buildVorbisCommentBlock(tags: Record<string, string>): ArrayBuffer {
  const encoder = new TextEncoder()
  const vendor = encoder.encode("Audora")

  // Calculate total size
  const entries = Object.entries(tags).filter(([, v]) => v)
  let dataSize = 4 + vendor.length + 4 // vendor length + vendor + comment count
  for (const [key, value] of entries) {
    const comment = encoder.encode(`${key}=${value}`)
    dataSize += 4 + comment.length // comment length + comment
  }

  const buffer = new ArrayBuffer(dataSize)
  const view = new DataView(buffer)
  let pos = 0

  // Vendor string (little-endian length!)
  view.setUint32(pos, vendor.length, true)
  pos += 4
  new Uint8Array(buffer, pos, vendor.length).set(vendor)
  pos += vendor.length

  // Number of comments (little-endian)
  view.setUint32(pos, entries.length, true)
  pos += 4

  // Each comment
  for (const [key, value] of entries) {
    const comment = encoder.encode(`${key}=${value}`)
    view.setUint32(pos, comment.length, true)
    pos += 4
    new Uint8Array(buffer, pos, comment.length).set(comment)
    pos += comment.length
  }

  return buffer
}

/** Build a PICTURE metadata block */
function buildPictureBlock(artBuffer: ArrayBuffer, mimeType: string): ArrayBuffer {
  const encoder = new TextEncoder()
  const mimeBytes = encoder.encode(mimeType)
  const descBytes = encoder.encode("")

  const dataSize =
    4 + 4 + mimeBytes.length + 4 + descBytes.length +
    4 + 4 + 4 + 4 + 4 + artBuffer.byteLength

  const buffer = new ArrayBuffer(dataSize)
  const view = new DataView(buffer)
  let pos = 0

  // Picture type: 3 (Cover front)
  view.setUint32(pos, 3); pos += 4
  // MIME
  view.setUint32(pos, mimeBytes.length); pos += 4
  new Uint8Array(buffer, pos, mimeBytes.length).set(mimeBytes); pos += mimeBytes.length
  // Description
  view.setUint32(pos, descBytes.length); pos += 4
  new Uint8Array(buffer, pos, descBytes.length).set(descBytes); pos += descBytes.length
  // Width, height, depth, colors (0 = unknown)
  view.setUint32(pos, 0); pos += 4
  view.setUint32(pos, 0); pos += 4
  view.setUint32(pos, 0); pos += 4
  view.setUint32(pos, 0); pos += 4
  // Picture data
  view.setUint32(pos, artBuffer.byteLength); pos += 4
  new Uint8Array(buffer, pos, artBuffer.byteLength).set(new Uint8Array(artBuffer))

  return buffer
}

/** Write a metadata block with header */
function writeBlockWithHeader(
  type: number,
  data: ArrayBuffer,
  isLast: boolean
): ArrayBuffer {
  const header = new ArrayBuffer(4)
  const view = new DataView(header)
  view.setUint8(0, (isLast ? 0x80 : 0x00) | (type & 0x7f))
  view.setUint8(1, (data.byteLength >> 16) & 0xff)
  view.setUint8(2, (data.byteLength >> 8) & 0xff)
  view.setUint8(3, data.byteLength & 0xff)

  const combined = new ArrayBuffer(4 + data.byteLength)
  new Uint8Array(combined).set(new Uint8Array(header))
  new Uint8Array(combined, 4).set(new Uint8Array(data))
  return combined
}

/**
 * Embed metadata and album art into a FLAC file.
 * Replaces existing VORBIS_COMMENT and PICTURE blocks.
 */
export async function embedFlacMetadata(
  flacBlob: Blob,
  metadata: FlacMetadata,
  artBlob?: Blob | null
): Promise<Blob> {
  const flacBuffer = await flacBlob.arrayBuffer()
  const view = new DataView(flacBuffer)

  // Verify FLAC magic
  const magic =
    String.fromCharCode(view.getUint8(0)) +
    String.fromCharCode(view.getUint8(1)) +
    String.fromCharCode(view.getUint8(2)) +
    String.fromCharCode(view.getUint8(3))

  if (magic !== "fLaC") return flacBlob

  const { blocks, audioOffset } = parseMetadataBlocks(flacBuffer)

  // Keep all blocks except existing VORBIS_COMMENT and PICTURE
  const keepBlocks = blocks.filter(
    (b) => b.type !== BLOCK_VORBIS_COMMENT && b.type !== BLOCK_PICTURE
  )

  // Build Vorbis Comment tags
  const tags: Record<string, string> = {}
  if (metadata.title) tags["TITLE"] = metadata.title
  if (metadata.artist) tags["ARTIST"] = metadata.artist
  if (metadata.album) tags["ALBUM"] = metadata.album
  if (metadata.albumArtist) tags["ALBUMARTIST"] = metadata.albumArtist
  if (metadata.date) tags["DATE"] = metadata.date
  if (metadata.genre) tags["GENRE"] = metadata.genre
  if (metadata.trackNumber) tags["TRACKNUMBER"] = metadata.trackNumber
  if (metadata.discNumber) tags["DISCNUMBER"] = metadata.discNumber
  if (metadata.copyright) tags["COPYRIGHT"] = metadata.copyright
  if (metadata.isrc) tags["ISRC"] = metadata.isrc

  const vorbisData = buildVorbisCommentBlock(tags)

  // Build Picture block if art is provided
  let pictureData: ArrayBuffer | null = null
  if (artBlob) {
    const artBuffer = await artBlob.arrayBuffer()
    pictureData = buildPictureBlock(artBuffer, artBlob.type || "image/jpeg")
  }

  // Reassemble: fLaC + kept blocks + vorbis comment + picture + audio
  const parts: ArrayBuffer[] = []

  // "fLaC" header
  parts.push(flacBuffer.slice(0, 4))

  // Write kept blocks (none are last)
  for (const block of keepBlocks) {
    parts.push(writeBlockWithHeader(block.type, block.data, false))
  }

  // Write Vorbis Comment block
  if (pictureData) {
    // Not last — picture comes after
    parts.push(writeBlockWithHeader(BLOCK_VORBIS_COMMENT, vorbisData, false))
    // Picture is last metadata block
    parts.push(writeBlockWithHeader(BLOCK_PICTURE, pictureData, true))
  } else {
    // Vorbis Comment is last
    parts.push(writeBlockWithHeader(BLOCK_VORBIS_COMMENT, vorbisData, true))
  }

  // Audio frames
  parts.push(flacBuffer.slice(audioOffset))

  return new Blob(parts, { type: "audio/flac" })
}

// Keep backwards compatibility
export async function embedAlbumArt(
  flacBlob: Blob,
  artBlob: Blob
): Promise<Blob> {
  return embedFlacMetadata(flacBlob, {}, artBlob)
}
