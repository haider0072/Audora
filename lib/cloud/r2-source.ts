import { ByteSourceReadError, type ByteSource } from "@/lib/metadata-extractor"
import type { ByteRange } from "@/lib/stream-info"

import { audioContentType } from "./audio-files"
import type { R2Client } from "./r2"

/**
 * An object in R2 presented as a `ByteSource`, so the metadata extractor can
 * read tags from it with ranged requests instead of downloading the file.
 *
 * Server only — it reads through the credentialed client.
 *
 * Every read the extractor makes sits at the head of the file: the format
 * signature, the FLAC block chain, the ID3 tag, the first MPEG frame. So
 * rather than one request per slice — the FLAC block scan alone asks for
 * four bytes at a time — this keeps one contiguous prefix of the object in
 * memory and grows it to cover whatever is asked for, at least a chunk at a
 * time. A typical file is indexed in one or two requests.
 */

/** Minimum growth of the cached prefix. Covers the tags of most files in one read. */
const READ_AHEAD_BYTES = 256 * 1024

export class R2RangeSource implements ByteSource {
  readonly type: string
  private prefix = new Uint8Array(0)
  private pending: Promise<void> | null = null

  constructor(
    private readonly client: R2Client,
    private readonly key: string,
    readonly name: string,
    readonly size: number,
    /** Aborts every read still to come, e.g. at an indexing pass's time limit. */
    private readonly signal?: AbortSignal,
  ) {
    this.type = audioContentType(name)
  }

  slice(start = 0, end = this.size): { arrayBuffer(): Promise<ArrayBuffer> } {
    const from = Math.max(0, Math.min(start, this.size))
    const to = Math.max(from, Math.min(end, this.size))
    return {
      arrayBuffer: async () => {
        await this.ensurePrefix(to)
        return this.prefix.slice(from, to).buffer
      },
    }
  }

  /** Grow the cached prefix until it reaches `end`. Concurrent callers share one read. */
  private async ensurePrefix(end: number): Promise<void> {
    while (this.prefix.length < end) {
      if (!this.pending) {
        const from = this.prefix.length
        const to = Math.min(this.size, Math.max(end, from + READ_AHEAD_BYTES)) - 1
        this.pending = this.extendPrefix(from, to).finally(() => {
          this.pending = null
        })
      }
      await this.pending
    }
  }

  /**
   * Append bytes `[from, to]` to the prefix. Every failure is a
   * `ByteSourceReadError`, so the extractor reports it instead of indexing
   * the file under filename placeholders.
   */
  private async extendPrefix(from: number, to: number): Promise<void> {
    let bytes: Uint8Array
    try {
      bytes = await this.client.readRange(this.key, from, to, this.signal)
    } catch (error) {
      throw new ByteSourceReadError(`Could not read ${this.key}`, { cause: error })
    }
    // An object shorter than its listing claims would otherwise spin.
    if (bytes.length === 0) throw new ByteSourceReadError(`Unexpected end of ${this.key}`)

    const grown = new Uint8Array(this.prefix.length + bytes.length)
    grown.set(this.prefix)
    grown.set(bytes, this.prefix.length)
    this.prefix = grown
  }
}

/**
 * An object in R2 read a few bytes at a time, for headers spread through a
 * file. The first range read is kept and serves any range inside it; any
 * other range is read on its own, exactly as asked. Walking a FLAC file's
 * metadata blocks this way reads the 4-byte header past its cover, where
 * `R2RangeSource`'s contiguous prefix would read the cover too.
 *
 * Server only — it reads through the credentialed client.
 */
export class R2HeaderSource implements ByteRange {
  private kept: Uint8Array = new Uint8Array(0)

  constructor(
    private readonly client: R2Client,
    private readonly key: string,
    readonly size: number,
    /** Aborts every read still to come, e.g. at an indexing pass's time limit. */
    private readonly signal?: AbortSignal,
  ) {}

  slice(start: number, end: number): { arrayBuffer(): Promise<ArrayBuffer> } {
    const from = Math.max(0, Math.min(start, this.size))
    const to = Math.max(from, Math.min(end, this.size))
    return {
      arrayBuffer: async () => {
        if (to <= this.kept.length) return this.kept.slice(from, to).buffer
        const bytes = await this.client.readRange(this.key, from, to - 1, this.signal)
        if (from === 0 && this.kept.length === 0) this.kept = bytes
        return bytes.slice().buffer
      },
    }
  }
}
