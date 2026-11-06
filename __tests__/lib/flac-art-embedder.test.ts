/**
 * @jest-environment node
 */
import { embedFlacMetadata, withFlacMetadata } from "@/lib/flac-art-embedder"

const STREAMINFO = 0
const PADDING = 1
const VORBIS_COMMENT = 4
const PICTURE = 6

function block(type: number, data: Uint8Array, last = false): Uint8Array {
  const out = new Uint8Array(4 + data.length)
  out[0] = (last ? 0x80 : 0) | type
  out[1] = (data.length >> 16) & 0xff
  out[2] = (data.length >> 8) & 0xff
  out[3] = data.length & 0xff
  out.set(data, 4)
  return out
}

function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((size, part) => size + part.length, 0))
  let pos = 0
  for (const part of parts) {
    out.set(part, pos)
    pos += part.length
  }
  return out
}

function vorbisBlock(comments: string[]): Uint8Array {
  const encoder = new TextEncoder()
  const vendor = encoder.encode("other")
  const encoded = comments.map((comment) => encoder.encode(comment))
  const lengthOf = (value: number) => {
    const bytes = new Uint8Array(4)
    new DataView(bytes.buffer).setUint32(0, value, true)
    return bytes
  }
  return concat([lengthOf(vendor.length), vendor, lengthOf(encoded.length), ...encoded.flatMap((c) => [lengthOf(c.length), c])])
}

const MAGIC = new Uint8Array([0x66, 0x4c, 0x61, 0x43])
const STREAM_INFO = new Uint8Array(34).fill(7)
const AUDIO = new Uint8Array([9, 9, 9, 9])

function flac(...blocks: Uint8Array[]): Uint8Array<ArrayBuffer> {
  return concat([MAGIC, ...blocks, AUDIO])
}

/** A FLAC file read back: its blocks, and the audio after them. */
function read(bytes: Uint8Array) {
  expect(Array.from(bytes.subarray(0, 4))).toEqual(Array.from(MAGIC))
  const blocks: { type: number; last: boolean; data: Uint8Array }[] = []
  let pos = 4
  for (;;) {
    const length = (bytes[pos + 1] << 16) | (bytes[pos + 2] << 8) | bytes[pos + 3]
    const last = (bytes[pos] & 0x80) !== 0
    blocks.push({ type: bytes[pos] & 0x7f, last, data: bytes.subarray(pos + 4, pos + 4 + length) })
    pos += 4 + length
    if (last) break
  }
  return { blocks, audio: bytes.subarray(pos) }
}

function commentsOf(data: Uint8Array): string[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const decoder = new TextDecoder()
  let pos = 4 + view.getUint32(0, true)
  const count = view.getUint32(pos, true)
  pos += 4
  const comments: string[] = []
  for (let index = 0; index < count; index++) {
    const length = view.getUint32(pos, true)
    comments.push(decoder.decode(data.subarray(pos + 4, pos + 4 + length)))
    pos += 4 + length
  }
  return comments
}

const ORIGINAL = flac(
  block(STREAMINFO, STREAM_INFO),
  block(VORBIS_COMMENT, vorbisBlock(["TITLE=Old"])),
  block(PICTURE, new Uint8Array([1])),
  block(PADDING, new Uint8Array(8), true),
)

describe("withFlacMetadata", () => {
  it("replaces the tags, and keeps every other block and the audio as they are", () => {
    const { blocks, audio } = read(withFlacMetadata(ORIGINAL, { title: "AMNESIA", artist: "WOODZ", trackNumber: "1" }))

    expect(blocks.map((b) => [b.type, b.last])).toEqual([
      [STREAMINFO, false],
      [PADDING, false],
      [VORBIS_COMMENT, true],
    ])
    expect(Array.from(blocks[0].data)).toEqual(Array.from(STREAM_INFO))
    expect(commentsOf(blocks[2].data)).toEqual(["TITLE=AMNESIA", "ARTIST=WOODZ", "TRACKNUMBER=1"])
    expect(Array.from(audio)).toEqual(Array.from(AUDIO))
  })

  it("puts the cover last, in place of the one there was", () => {
    const art = new Uint8Array([0xff, 0xd8, 0xff])
    const { blocks, audio } = read(withFlacMetadata(ORIGINAL, { title: "AMNESIA" }, { data: art, type: "image/jpeg" }))

    expect(blocks.map((b) => b.type)).toEqual([STREAMINFO, PADDING, VORBIS_COMMENT, PICTURE])
    expect(blocks.map((b) => b.last)).toEqual([false, false, false, true])
    const picture = blocks[3].data
    expect(new TextDecoder().decode(picture.subarray(8, 8 + "image/jpeg".length))).toBe("image/jpeg")
    expect(Array.from(picture.subarray(picture.length - art.length))).toEqual(Array.from(art))
    expect(Array.from(audio)).toEqual(Array.from(AUDIO))
  })

  it("leaves out a cover too large for a FLAC block rather than writing it broken", () => {
    const art = new Uint8Array(0xffffff)
    const { blocks } = read(withFlacMetadata(ORIGINAL, { title: "AMNESIA" }, { data: art, type: "image/png" }))
    expect(blocks.map((b) => b.type)).toEqual([STREAMINFO, PADDING, VORBIS_COMMENT])
  })

  it("leaves a file that is not FLAC as it is", () => {
    const mp4 = new Uint8Array([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70])
    expect(withFlacMetadata(mp4, { title: "AMNESIA" })).toBe(mp4)
  })
})

describe("embedFlacMetadata", () => {
  it("tags a FLAC blob the way withFlacMetadata tags its bytes", async () => {
    const art = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" })
    const tagged = await embedFlacMetadata(new Blob([ORIGINAL]), { title: "AMNESIA" }, art)

    expect(tagged.type).toBe("audio/flac")
    const expected = withFlacMetadata(ORIGINAL, { title: "AMNESIA" }, { data: new Uint8Array([1, 2, 3]), type: "image/png" })
    expect(Array.from(new Uint8Array(await tagged.arrayBuffer()))).toEqual(Array.from(expected))
  })

  it("hands back a blob that is not FLAC untouched", async () => {
    const mp4 = new Blob([new Uint8Array([0, 0, 0, 0x20])], { type: "audio/mp4" })
    expect(await embedFlacMetadata(mp4, { title: "AMNESIA" })).toBe(mp4)
  })
})
