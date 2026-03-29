/**
 * Embeds album art into a FLAC file by inserting a METADATA_BLOCK_PICTURE.
 *
 * FLAC structure:
 *   "fLaC" (4 bytes)
 *   METADATA_BLOCK_HEADER (4 bytes) + STREAMINFO (34 bytes) — always first
 *   ... optional metadata blocks ...
 *   Audio frames
 *
 * Each metadata block header:
 *   Bit 0:    is_last (1 = last metadata block)
 *   Bits 1-7: block type (0=STREAMINFO, 4=VORBIS_COMMENT, 6=PICTURE, etc.)
 *   Bits 8-31: block data length (24 bits, big-endian)
 */

export async function embedAlbumArt(
  flacBlob: Blob,
  artBlob: Blob
): Promise<Blob> {
  const flacBuffer = await flacBlob.arrayBuffer()
  const artBuffer = await artBlob.arrayBuffer()
  const flacView = new DataView(flacBuffer)

  // Verify FLAC magic
  const magic =
    String.fromCharCode(flacView.getUint8(0)) +
    String.fromCharCode(flacView.getUint8(1)) +
    String.fromCharCode(flacView.getUint8(2)) +
    String.fromCharCode(flacView.getUint8(3))

  if (magic !== "fLaC") {
    // Not a FLAC file, return as-is
    return flacBlob
  }

  // Find the end of metadata blocks
  let offset = 4 // skip "fLaC"
  let lastBlockOffset = -1

  while (offset < flacBuffer.byteLength) {
    const headerByte = flacView.getUint8(offset)
    const isLast = (headerByte & 0x80) !== 0
    const blockLength =
      (flacView.getUint8(offset + 1) << 16) |
      (flacView.getUint8(offset + 2) << 8) |
      flacView.getUint8(offset + 3)

    if (isLast) {
      lastBlockOffset = offset
      offset += 4 + blockLength // move past this block
      break
    }

    offset += 4 + blockLength
  }

  if (lastBlockOffset === -1) {
    return flacBlob
  }

  // Build the PICTURE metadata block data
  const mimeType = artBlob.type || "image/jpeg"
  const mimeBytes = new TextEncoder().encode(mimeType)
  const descBytes = new TextEncoder().encode("") // empty description

  // Picture block data:
  //   4 bytes: picture type (3 = Cover front)
  //   4 bytes: MIME length + MIME string
  //   4 bytes: description length + description string
  //   4 bytes: width (0 = unknown)
  //   4 bytes: height (0 = unknown)
  //   4 bytes: color depth (0 = unknown)
  //   4 bytes: num colors (0 = unknown)
  //   4 bytes: data length + data
  const pictureDataLength =
    4 + 4 + mimeBytes.length + 4 + descBytes.length + 4 + 4 + 4 + 4 + 4 + artBuffer.byteLength

  const pictureBlock = new ArrayBuffer(4 + pictureDataLength)
  const picView = new DataView(pictureBlock)
  let pos = 0

  // Block header: is_last=1, type=6 (PICTURE), length
  picView.setUint8(pos, 0x80 | 6) // is_last + PICTURE type
  picView.setUint8(pos + 1, (pictureDataLength >> 16) & 0xff)
  picView.setUint8(pos + 2, (pictureDataLength >> 8) & 0xff)
  picView.setUint8(pos + 3, pictureDataLength & 0xff)
  pos += 4

  // Picture type: 3 (Cover front)
  picView.setUint32(pos, 3)
  pos += 4

  // MIME type
  picView.setUint32(pos, mimeBytes.length)
  pos += 4
  new Uint8Array(pictureBlock, pos, mimeBytes.length).set(mimeBytes)
  pos += mimeBytes.length

  // Description
  picView.setUint32(pos, descBytes.length)
  pos += 4
  new Uint8Array(pictureBlock, pos, descBytes.length).set(descBytes)
  pos += descBytes.length

  // Width, height, color depth, num colors (all 0 = unknown)
  picView.setUint32(pos, 0); pos += 4
  picView.setUint32(pos, 0); pos += 4
  picView.setUint32(pos, 0); pos += 4
  picView.setUint32(pos, 0); pos += 4

  // Picture data
  picView.setUint32(pos, artBuffer.byteLength)
  pos += 4
  new Uint8Array(pictureBlock, pos, artBuffer.byteLength).set(
    new Uint8Array(artBuffer)
  )

  // Now unset the is_last flag on the previously-last block
  const prevHeader = new Uint8Array(flacBuffer, lastBlockOffset, 1)
  const updatedPrevHeader = prevHeader[0] & 0x7f // clear is_last bit

  // Assemble: before_last_block + updated_last_block + picture_block + audio_frames
  const beforeLastBlock = flacBuffer.slice(0, lastBlockOffset)
  const lastBlockHeaderByte = new Uint8Array([updatedPrevHeader])
  const lastBlockRest = flacBuffer.slice(lastBlockOffset + 1, offset)
  const audioFrames = flacBuffer.slice(offset)

  return new Blob(
    [beforeLastBlock, lastBlockHeaderByte, lastBlockRest, pictureBlock, audioFrames],
    { type: "audio/flac" }
  )
}
