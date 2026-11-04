import { AwsClient } from "aws4fetch"

import type { CloudConfig } from "./config"
import { parseListPage, type R2Object } from "./list-parse"

export type { R2Object }

/**
 * A minimal Cloudflare R2 client over its S3-compatible API.
 *
 * Server only — it holds the bucket credentials. The surface is the handful
 * of calls the cloud library needs: list, ranged read, write a small object,
 * and presign a GET so the browser can stream a file straight from R2 without
 * the bytes ever passing through a serverless function.
 *
 * Path-style addressing (`<account>.r2.cloudflarestorage.com/<bucket>/<key>`)
 * is used throughout so every URL shares one host, which keeps the CSP and
 * service-worker rules for R2 to a single pattern.
 */


export class R2Error extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = "R2Error"
  }
}

/** One ListObjectsV2 page holds at most this many keys. */
const LIST_PAGE_SIZE = 1000

/**
 * RFC 3986 encoding for one path segment. `encodeURIComponent` leaves
 * `!'()*` alone, which S3 signature canonicalisation does not.
 */
function encodeSegment(segment: string): string {
  return encodeURIComponent(segment).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}

function encodeKey(key: string): string {
  return key.split("/").map(encodeSegment).join("/")
}

export class R2Client {
  private readonly aws: AwsClient
  private readonly base: string

  constructor(config: CloudConfig) {
    this.aws = new AwsClient({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      service: "s3",
      region: "auto",
    })
    this.base = `https://${config.accountId}.r2.cloudflarestorage.com/${encodeSegment(config.bucket)}`
  }

  private objectUrl(key: string): string {
    return `${this.base}/${encodeKey(key)}`
  }

  /** Every object under `prefix`, following continuation tokens. */
  async list(prefix: string): Promise<R2Object[]> {
    const all: R2Object[] = []
    let token: string | null = null

    do {
      const params = new URLSearchParams({
        "list-type": "2",
        prefix,
        "max-keys": String(LIST_PAGE_SIZE),
      })
      if (token) params.set("continuation-token", token)

      const response = await this.aws.fetch(`${this.base}?${params}`)
      if (!response.ok) {
        throw new R2Error(`R2 list failed (${response.status})`, response.status)
      }
      const page = parseListPage(await response.text())
      all.push(...page.objects)
      token = page.nextToken
    } while (token)

    return all
  }

  /**
   * Bytes `[start, end]` (inclusive) of an object. Returns fewer when the
   * object is shorter; an empty buffer past its end.
   */
  async readRange(key: string, start: number, end: number): Promise<Uint8Array> {
    const response = await this.aws.fetch(this.objectUrl(key), {
      headers: { Range: `bytes=${start}-${end}` },
    })
    if (response.status === 416) return new Uint8Array(0)
    if (!response.ok) {
      throw new R2Error(`R2 read failed for ${key} (${response.status})`, response.status)
    }
    return new Uint8Array(await response.arrayBuffer())
  }

  /** The whole object and its ETag, or null when it does not exist. */
  async read(key: string): Promise<{ body: Uint8Array; etag: string } | null> {
    const response = await this.aws.fetch(this.objectUrl(key))
    if (response.status === 404) return null
    if (!response.ok) {
      throw new R2Error(`R2 read failed for ${key} (${response.status})`, response.status)
    }
    return {
      body: new Uint8Array(await response.arrayBuffer()),
      etag: response.headers.get("etag") ?? "",
    }
  }

  /**
   * Write an object. With `ifMatch` the write only lands when the object is
   * still at that ETag, and with `ifNoneMatch` only when it does not exist yet;
   * either returns false when the precondition fails, so a caller doing
   * read-modify-write can re-read and retry instead of clobbering a
   * concurrent writer.
   */
  async write(
    key: string,
    body: Uint8Array<ArrayBuffer> | string,
    options: { contentType: string; cacheControl?: string; ifMatch?: string; ifNoneMatch?: boolean },
  ): Promise<boolean> {
    const headers: Record<string, string> = { "Content-Type": options.contentType }
    if (options.cacheControl) headers["Cache-Control"] = options.cacheControl
    if (options.ifMatch) headers["If-Match"] = options.ifMatch
    if (options.ifNoneMatch) headers["If-None-Match"] = "*"

    const response = await this.aws.fetch(this.objectUrl(key), { method: "PUT", headers, body })
    if (response.status === 412) return false
    if (!response.ok) {
      throw new R2Error(`R2 write failed for ${key} (${response.status})`, response.status)
    }
    return true
  }

  /**
   * A GET URL anyone can use until `signedAt + expiresInSeconds`.
   *
   * `signedAt` is fixed by the caller rather than taken from the clock so the
   * same object signs to the same URL for a whole window. That stability is
   * what lets the browser's HTTP cache keep album art across page loads; a
   * fresh signature on every request would make every load a cache miss.
   */
  async presignGet(key: string, signedAt: Date, expiresInSeconds: number): Promise<string> {
    const url = new URL(this.objectUrl(key))
    url.searchParams.set("X-Amz-Expires", String(expiresInSeconds))
    const datetime = signedAt.toISOString().replace(/[:-]|\.\d{3}/g, "")
    const signed = await this.aws.sign(url.toString(), { aws: { signQuery: true, datetime } })
    return signed.url
  }
}
