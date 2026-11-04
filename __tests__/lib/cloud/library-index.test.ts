/**
 * @jest-environment node
 */
import sharp from "sharp"

import type { CloudConfig } from "@/lib/cloud/config"
import { getLibrary, indexPending } from "@/lib/cloud/library-index"
import { ENTRY_FORMAT } from "@/lib/cloud/library-index-schema"
import { buildFlac } from "@/testing/flac-fixture"
import { installFakeR2, type FakeR2 } from "@/testing/fake-r2"

const config: CloudConfig = {
  accountId: "acct",
  accessKeyId: "key",
  secretAccessKey: "secret",
  bucket: "audora-music",
  password: "x".repeat(12),
  sessionSecret: "s".repeat(32),
}

const INDEX_KEY = "index/library-v1.json"

async function cover(): Promise<Uint8Array> {
  return sharp({ create: { width: 1200, height: 1200, channels: 3, background: "#3366cc" } })
    .jpeg()
    .toBuffer()
}

function storedIndex(r2: FakeR2) {
  return JSON.parse(new TextDecoder().decode(r2.objects.get(INDEX_KEY)!.body))
}

describe("cloud library index", () => {
  let r2: FakeR2
  beforeEach(() => {
    r2 = installFakeR2()
    jest.spyOn(console, "warn").mockImplementation(() => {})
  })
  afterEach(() => {
    r2.restore()
    jest.restoreAllMocks()
  })

  it("indexes a new song with rendered covers, served at both sizes", async () => {
    r2.put("library/Kun Faya Kun.flac", buildFlac({ cover: await cover() }))

    expect(await indexPending(config)).toEqual({ indexed: 1, pending: 0 })

    const entry = storedIndex(r2).entries["library/Kun Faya Kun.flac"]
    expect(entry.format).toBe(ENTRY_FORMAT)
    for (const key of [entry.covers.small, entry.covers.large]) {
      expect(r2.objects.get(key)).toMatchObject({
        contentType: "image/webp",
        cacheControl: "private, max-age=31536000, immutable",
      })
    }

    const library = await getLibrary(config)
    expect(library).toMatchObject({ pending: 0, outdated: 0 })
    const [song] = library.songs
    expect(song).toMatchObject({ title: "Kun Faya Kun", artist: "A.R. Rahman", duration: 180 })
    expect(song.thumbUrl).toContain(entry.covers.small)
    expect(song.artUrl).toContain(entry.covers.large)
  })

  it("keeps non-audio objects out of the library without re-reading them every pass", async () => {
    r2.put("library/not-really.flac", "<!doctype html><script>alert(1)</script>")

    expect(await indexPending(config)).toEqual({ indexed: 1, pending: 0 })
    expect((await getLibrary(config)).songs).toEqual([])
    expect(await indexPending(config)).toEqual({ indexed: 0, pending: 0 })
  })

  it("serves songs from an older indexer while bringing them up to date", async () => {
    r2.put("library/Old.flac", buildFlac({ cover: await cover() }))
    const old = r2.objects.get("library/Old.flac")!
    r2.put("art/legacy-cover", await cover())
    r2.put(
      INDEX_KEY,
      JSON.stringify({
        version: 1,
        entries: {
          "library/Old.flac": { etag: old.etag.replace(/"/g, ""), size: old.body.length, tags: { title: "Old" }, artKey: "art/legacy-cover" },
        },
      }),
    )

    const before = await getLibrary(config)
    expect(before).toMatchObject({ pending: 0, outdated: 1 })
    expect(before.songs[0]).toMatchObject({ title: "Old" })
    expect(before.songs[0].artUrl).toContain("legacy-cover")
    expect(before.songs[0].thumbUrl).toBeUndefined()

    await indexPending(config)
    const after = await getLibrary(config)
    expect(after).toMatchObject({ pending: 0, outdated: 0 })
    expect(after.songs[0].thumbUrl).toBeDefined()
  })

  it("gives replaced audio new cover URLs, so immutable caching never shows stale art", async () => {
    r2.put("library/Song.flac", buildFlac({ cover: await cover() }))
    await indexPending(config)
    const first = storedIndex(r2).entries["library/Song.flac"].covers

    r2.put("library/Song.flac", buildFlac({ cover: await cover(), audioBytes: 9000 }))
    await indexPending(config)
    const second = storedIndex(r2).entries["library/Song.flac"].covers

    expect(second.small).not.toBe(first.small)
    expect(second.large).not.toBe(first.large)
  })
})
