/**
 * @jest-environment node
 */
import { parseLibraryIndex } from "@/lib/cloud/library-index-schema"

const good = { etag: "e", size: 10, tags: { title: "Song", duration: 180 }, artKey: "art/abc" }

describe("parseLibraryIndex", () => {
  beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation(() => {})
  })

  it("treats a missing index as empty", () => {
    expect(parseLibraryIndex(undefined)).toEqual({ version: 1, entries: {} })
  })

  it("rebuilds from scratch when the envelope is not an index", () => {
    expect(parseLibraryIndex({ version: 2, entries: {} }).entries).toEqual({})
    expect(parseLibraryIndex([1, 2, 3]).entries).toEqual({})
  })

  it("drops only the entries that do not validate", () => {
    const index = parseLibraryIndex({
      version: 1,
      entries: {
        "library/good.flac": good,
        "library/bad-size.flac": { ...good, size: -1 },
        "library/bad-art.flac": { ...good, artKey: "library/elsewhere" },
        "library/bad-tags.flac": { ...good, tags: { title: 42 } },
      },
    })
    expect(Object.keys(index.entries)).toEqual(["library/good.flac"])
  })

  it("strips fields the app never wrote", () => {
    const index = parseLibraryIndex({
      version: 1,
      entries: { "library/a.flac": { ...good, tags: { ...good.tags, streamUrl: "https://evil.test" }, extra: 1 } },
    })
    expect(index.entries["library/a.flac"]).toEqual(good)
  })

  it("keeps rejected entries so non-audio files are not re-read every pass", () => {
    const rejected = { etag: "e", size: 3, tags: {}, rejected: true }
    expect(parseLibraryIndex({ version: 1, entries: { "library/x.flac": rejected } }).entries["library/x.flac"]).toEqual(
      rejected,
    )
  })
})
