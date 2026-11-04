/**
 * An in-memory stand-in for R2's S3 API, installed as the global `fetch`.
 *
 * Covers what the cloud library's small-document code relies on: GET with
 * ETags, and PUT honouring `If-Match` / `If-None-Match: *`. Tests that need
 * ranged reads or listings mock `fetch` themselves.
 */

export interface FakeR2 {
  objects: Map<string, { body: string; etag: string }>
  /** Every request seen, as `METHOD key`. */
  requests: string[]
  /** Make the next `count` PUTs fail their precondition, as a concurrent writer would. */
  conflictNextPuts(count: number): void
  restore(): void
}

const BUCKET_PATH = /^\/[^/]+\/(.+)$/

export function installFakeR2(): FakeR2 {
  const original = globalThis.fetch
  const objects = new Map<string, { body: string; etag: string }>()
  const requests: string[] = []
  let version = 0
  let conflicts = 0

  const fake = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url)
    const key = decodeURIComponent(url.pathname.match(BUCKET_PATH)?.[1] ?? "")
    const method = init.method ?? "GET"
    const headers = new Headers(init.headers)
    requests.push(`${method} ${key}`)

    if (method === "GET") {
      const stored = objects.get(key)
      if (!stored) return new Response("<Error/>", { status: 404 })
      return new Response(stored.body, { status: 200, headers: { etag: stored.etag } })
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
      const etag = `"v${++version}"`
      objects.set(key, { body: String(init.body ?? ""), etag })
      return new Response(null, { status: 200, headers: { etag } })
    }

    return new Response("<Error/>", { status: 405 })
  }

  Object.assign(globalThis, { fetch: fake })
  return {
    objects,
    requests,
    conflictNextPuts(count) {
      conflicts = count
    },
    restore() {
      Object.assign(globalThis, { fetch: original })
    },
  }
}
