/**
 * @jest-environment node
 */
import { allowedCoverUrl } from "@/lib/cover-art-url"

describe("allowedCoverUrl", () => {
  it.each([
    "https://static.qobuz.com/images/covers/ab/cd/abcd_600.jpg",
    "https://m.media-amazon.com/images/I/cover.jpg",
    "https://resources.tidal.com/images/a/b/c/640x640.jpg",
  ])("lets a catalog's cover through: %s", (raw) => {
    expect(allowedCoverUrl(raw)?.href).toBe(raw)
  })

  it.each([
    ["plain http", "http://static.qobuz.com/images/covers/cover.jpg"],
    ["another host", "https://example.com/cover.jpg"],
    ["a host that only ends like a catalog's", "https://evil-static.qobuz.com.example.com/cover.jpg"],
    ["the bucket's own endpoint", "https://acct.r2.cloudflarestorage.com/bucket/library/a.flac"],
    ["something that is not a URL", "not a url"],
  ])("refuses %s", (_, raw) => {
    expect(allowedCoverUrl(raw)).toBeNull()
  })
})
