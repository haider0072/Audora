/**
 * An in-memory stand-in for R2's S3 API, installed as the global `fetch`.
 *
 * Covers what the cloud library relies on: ListObjectsV2 by prefix, HEAD, GET
 * with ETags and byte ranges, and PUT honouring `If-Match` / `If-None-Match: *`.
 */

export interface StoredObject {
  body: Uint8Array
  etag: string
  contentType?: string
  cacheControl?: string
}

export interface FakeR2 {
  objects: Map<string, StoredObject>
  /** Every request seen, as `METHOD key` (or `LIST prefix`). */
  requests: string[]
  /** Store an object directly, as an upload from another tool would. */
  put(key: string, body: Uint8Array | string): void
  /** Make the next `count` PUTs fail their precondition, as a concurrent writer would. */
  conflictNextPuts(count: number): void
  restore(): void
}

const BUCKET_PATH = /^\/[^/]+\/(.+)$/

function bytesOf(body: BodyInit | Uint8Array | null | undefined): Uint8Array {
  if (body === null || body === undefined) return new Uint8Array(0)
  if (typeof body === "string") return new TextEncoder().encode(body)
  if (body instanceof Uint8Array) return body
  if (body instanceof ArrayBuffer) return new Uint8Array(body)
  throw new Error("fake R2 accepts string and byte bodies only")
}

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

export function installFakeR2(): FakeR2 {
  const original = globalThis.fetch
  const objects = new Map<string, StoredObject>()
  const requests: string[] = []
  let version = 0
  let conflicts = 0

  const nextEtag = () => `"v${++version}"`

  const list = (prefix: string): Response => {
    requests.push(`LIST ${prefix}`)
    const contents = [...objects.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([key, object]) =>
          `<Contents><Key>${escapeXml(key)}</Key><Size>${object.body.length}</Size>` +
          `<ETag>${object.etag}</ETag><LastModified>2026-11-04T00:00:00.000Z</LastModified></Contents>`,
      )
      .join("")
    return new Response(`<ListBucketResult><IsTruncated>false</IsTruncated>${contents}</ListBucketResult>`)
  }

  const fake = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url)
    const method = init.method ?? "GET"
    const headers = new Headers(init.headers)

    if (method === "GET" && url.searchParams.get("list-type") === "2") {
      return list(url.searchParams.get("prefix") ?? "")
    }

    const key = decodeURIComponent(url.pathname.match(BUCKET_PATH)?.[1] ?? "")
    requests.push(`${method} ${key}`)

    if (method === "HEAD") {
      const stored = objects.get(key)
      if (!stored) return new Response(null, { status: 404 })
      return new Response(null, {
        status: 200,
        headers: { etag: stored.etag, "content-length": String(stored.body.length) },
      })
    }

    if (method === "GET") {
      const stored = objects.get(key)
      if (!stored) return new Response("<Error/>", { status: 404 })
      const range = headers.get("range")?.match(/^bytes=(\d+)-(\d*)$/)
      if (!range) return new Response(stored.body.slice(), { status: 200, headers: { etag: stored.etag } })
      const start = Number(range[1])
      if (start >= stored.body.length) return new Response(null, { status: 416 })
      const end = range[2] ? Math.min(Number(range[2]), stored.body.length - 1) : stored.body.length - 1
      return new Response(stored.body.slice(start, end + 1), { status: 206, headers: { etag: stored.etag } })
    }

    if (method === "PUT") {
      const stored = objects.get(key)
      const ifMatch = headers.get("if-match")
      const ifNoneMatch = headers.get("if-none-match")
      const preconditionFails =
        conflicts > 0 || (ifMatch !== null && ifMatch !== stored?.etag) || (ifNoneMatch === "*" && !!stored)
      if (preconditionFails) {
        if (conflicts > 0) conflicts--
        return new Response("<Error/>", { status: 412 })
      }
      const etag = nextEtag()
      objects.set(key, {
        body: bytesOf(init.body),
        etag,
        contentType: headers.get("content-type") ?? undefined,
        cacheControl: headers.get("cache-control") ?? undefined,
      })
      return new Response(null, { status: 200, headers: { etag } })
    }

    return new Response("<Error/>", { status: 405 })
  }

  Object.assign(globalThis, { fetch: fake })
  return {
    objects,
    requests,
    put(key, body) {
      objects.set(key, { body: bytesOf(body), etag: nextEtag() })
    },
    conflictNextPuts(count) {
      conflicts = count
    },
    restore() {
      Object.assign(globalThis, { fetch: original })
    },
  }
}
