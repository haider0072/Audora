import { AwsClient } from "aws4fetch"

import type { CloudConfig } from "./config"
import { parseListPage, type R2Object } from "./list-parse"

export type { R2Object }

/**
 * A minimal Cloudflare R2 client over its S3-compatible API.
 *
 * Server only — it holds the bucket credentials. The surface is the handful
 * of calls the cloud library needs: list, ranged read, write a small object,
 * and presign a GET or PUT so the browser can stream or upload a file
 * straight to R2 without the bytes ever passing through a serverless function.
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
 * Ceiling on one request, body included. Every call here moves at most a few
 * megabytes, so this only ever trips on a connection that has stalled — and
 * without it one stalled read holds an indexing pass open indefinitely.
 */
const REQUEST_TIMEOUT_MS = 20_000

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

  /**
   * Sign and send one request. Every call goes through here, for two reasons
   * that both bit in practice:
   *
   * - `cache: "no-store"`: route handlers run under Next's patched `fetch`,
   *   which would otherwise serve repeated GETs of the index from its cache —
   *   a stale ETag that made every conditional write fail with 412.
   * - The original body is sent rather than the signed `Request`'s, which has
   *   become a stream; Node sends a stream chunked, without Content-Length,
   *   and R2 rejects that PUT with 411.
   *
   * Each request is also bounded by `REQUEST_TIMEOUT_MS`, and by the caller's
   * `signal` when one is given; either rejects like any other network
   * failure, so callers need no special case.
   */
  private async send(
    url: string,
    init: {
      method?: string
      headers?: Record<string, string>
      body?: Uint8Array<ArrayBuffer> | string
      signal?: AbortSignal
    } = {},
  ): Promise<Response> {
    const method = init.method ?? "GET"
    const signed = await this.aws.sign(url, { method, headers: init.headers, body: init.body })
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    return fetch(signed.url, {
      method,
      headers: signed.headers,
      body: init.body,
      cache: "no-store",
      signal: init.signal ? AbortSignal.any([timeout, init.signal]) : timeout,
    })
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

      const response = await this.send(`${this.base}?${params}`)
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
  async readRange(key: string, start: number, end: number, signal?: AbortSignal): Promise<Uint8Array> {
    const response = await this.send(this.objectUrl(key), {
      headers: { Range: `bytes=${start}-${end}` },
      signal,
    })
    if (response.status === 416) return new Uint8Array(0)
    if (!response.ok) {
      throw new R2Error(`R2 read failed for ${key} (${response.status})`, response.status)
    }
    return new Uint8Array(await response.arrayBuffer())
  }

  /**
   * The whole object and its ETag, or null when it does not exist.
   *
   * Asked for uncompressed: R2 gzips larger text bodies on the fly and then
   * reports a weak ETag (`W/"..."`), which `If-Match` never matches — so a
   * compressed read would make every conditional write after it fail.
   */
  async read(key: string, signal?: AbortSignal): Promise<{ body: Uint8Array; etag: string } | null> {
    const response = await this.send(this.objectUrl(key), {
      headers: { "Accept-Encoding": "identity" },
      signal,
    })
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
    options: {
      contentType: string
      cacheControl?: string
      ifMatch?: string
      ifNoneMatch?: boolean
      signal?: AbortSignal
    },
  ): Promise<boolean> {
    const headers: Record<string, string> = { "Content-Type": options.contentType }
    if (options.cacheControl) headers["Cache-Control"] = options.cacheControl
    if (options.ifMatch) headers["If-Match"] = options.ifMatch
    if (options.ifNoneMatch) headers["If-None-Match"] = "*"

    const response = await this.send(this.objectUrl(key), { method: "PUT", headers, body, signal: options.signal })
    if (response.status === 412) return false
    if (!response.ok) {
      throw new R2Error(`R2 write failed for ${key} (${response.status})`, response.status)
    }
    return true
  }

  /** An object's size and ETag, or null when it does not exist. */
  async head(key: string, signal?: AbortSignal): Promise<{ size: number; etag: string } | null> {
    const response = await this.send(this.objectUrl(key), { method: "HEAD", signal })
    if (response.status === 404) return null
    if (!response.ok) {
      throw new R2Error(`R2 head failed for ${key} (${response.status})`, response.status)
    }
    return {
      size: Number(response.headers.get("content-length") ?? 0),
      etag: response.headers.get("etag") ?? "",
    }
  }

  /**
   * A PUT URL the browser can upload one new object to, straight to R2.
   *
   * Content-Type, Content-Length and `If-None-Match: *` are all signed, so
   * the URL accepts exactly the declared bytes as the declared type, and only
   * while nothing exists at the key — it cannot overwrite a song or be reused
   * for something else. The browser sets Content-Length itself from the
   * body, so `headers` lists only what the caller must send.
   */
  async presignPut(
    key: string,
    options: { contentType: string; contentLength: number; expiresInSeconds: number },
  ): Promise<{ url: string; headers: Record<string, string> }> {
    const url = new URL(this.objectUrl(key))
    url.searchParams.set("X-Amz-Expires", String(options.expiresInSeconds))
    const headers = { "Content-Type": options.contentType, "If-None-Match": "*" }
    const signed = await this.aws.sign(url.toString(), {
      method: "PUT",
      headers: { ...headers, "Content-Length": String(options.contentLength) },
      aws: { signQuery: true, allHeaders: true },
    })
    return { url: signed.url, headers }
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
