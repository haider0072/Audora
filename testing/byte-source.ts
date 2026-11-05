import type { ByteSource } from "@/lib/metadata-extractor"

export interface RecordedByteSource extends ByteSource {
  /** Every range read, as [start, end). */
  readonly reads: Array<[number, number]>
}

/**
 * Bytes as a `ByteSource`: what a `File` gives the extractor and the stream
 * readers, without jsdom's `Blob`, which cannot hand its bytes over. Records
 * each range read.
 */
export function byteSource(bytes: Uint8Array, name = "song.flac"): RecordedByteSource {
  const reads: Array<[number, number]> = []
  return {
    name,
    size: bytes.length,
    type: "",
    reads,
    slice(start = 0, end = bytes.length) {
      return {
        arrayBuffer: async () => {
          reads.push([start, end])
          return bytes.slice(start, end).buffer
        },
      }
    },
  }
}
