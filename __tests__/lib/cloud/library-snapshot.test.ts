import { clearLibrarySnapshot, readLibrarySnapshot, saveLibrarySnapshot } from "@/lib/cloud/library-snapshot"
import type { CloudLibraryResponse } from "@/lib/cloud/types"

/** Cache Storage, as far as the snapshot uses it. jsdom has none. */
function installFakeCaches() {
  const stores = new Map<string, Map<string, string>>()
  const caches = {
    async open(name: string) {
      if (!stores.has(name)) stores.set(name, new Map())
      const store = stores.get(name)!
      return {
        async match(request: Request) {
          const body = store.get(request.url)
          return body === undefined ? undefined : { json: async () => JSON.parse(body) }
        },
        async put(request: Request, response: { text: () => Promise<string> }) {
          store.set(request.url, await response.text())
        },
      }
    },
    async delete(name: string) {
      return stores.delete(name)
    },
  }
  Object.assign(window, { caches })
  return stores
}

const now = Date.UTC(2026, 10, 4)
const library = (expiresInMs: number): CloudLibraryResponse => ({
  songs: [{ id: "cloud:1", key: "library/a.flac", fileName: "a.flac", fileSize: 1, streamUrl: "https://r2.test/a" }],
  pending: 0,
  outdated: 0,
  urlsExpireAt: now + expiresInMs,
})

describe("cloud library snapshot", () => {
  const { Request: OriginalRequest, Response: OriginalResponse } = globalThis

  beforeEach(() => {
    installFakeCaches()
    // jsdom's Response has no text(); the snapshot only needs that much of it.
    Object.assign(globalThis, {
      Response: class {
        constructor(private readonly body: string) {}
        async text() {
          return this.body
        }
      },
      Request: class {
        readonly url: string
        constructor(input: string | URL) {
          this.url = String(input)
        }
      },
    })
  })

  afterEach(() => {
    Reflect.deleteProperty(window, "caches")
    Object.assign(globalThis, { Request: OriginalRequest, Response: OriginalResponse })
  })

  it("returns what was saved while its URLs have time left", async () => {
    await saveLibrarySnapshot(library(3 * 24 * 60 * 60 * 1000))
    expect((await readLibrarySnapshot(now))?.songs).toHaveLength(1)
  })

  it("ignores a snapshot whose URLs are about to expire", async () => {
    await saveLibrarySnapshot(library(30 * 60 * 1000))
    expect(await readLibrarySnapshot(now)).toBeNull()
  })

  it("is gone after being cleared", async () => {
    await saveLibrarySnapshot(library(3 * 24 * 60 * 60 * 1000))
    await clearLibrarySnapshot()
    expect(await readLibrarySnapshot(now)).toBeNull()
  })

  it("does nothing where Cache Storage is unavailable", async () => {
    Reflect.deleteProperty(window, "caches")
    await expect(saveLibrarySnapshot(library(1))).resolves.toBeUndefined()
    expect(await readLibrarySnapshot(now)).toBeNull()
  })
})
