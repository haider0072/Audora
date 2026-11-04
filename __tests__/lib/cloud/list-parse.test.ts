import { parseListPage } from "@/lib/cloud/list-parse"

const page = (contents: string, truncated = false, token = "") => `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Name>audora-music</Name>
  <Prefix>library/</Prefix>
  <KeyCount>2</KeyCount>
  <MaxKeys>1000</MaxKeys>
  <IsTruncated>${truncated}</IsTruncated>
  ${token ? `<NextContinuationToken>${token}</NextContinuationToken>` : ""}
  ${contents}
</ListBucketResult>`

const entry = (key: string, size: number, etag = "abc") => `<Contents>
    <Key>${key}</Key>
    <LastModified>2026-11-04T10:00:00.000Z</LastModified>
    <ETag>&quot;${etag}&quot;</ETag>
    <Size>${size}</Size>
    <StorageClass>STANDARD</StorageClass>
  </Contents>`

describe("parseListPage", () => {
  it("reads key, size, etag and modification time", () => {
    const { objects, nextToken } = parseListPage(
      page(entry("library/Artist/Album/01 Song.flac", 31_457_280, "d41d8")),
    )
    expect(nextToken).toBeNull()
    expect(objects).toEqual([
      {
        key: "library/Artist/Album/01 Song.flac",
        size: 31_457_280,
        etag: "d41d8",
        lastModified: "2026-11-04T10:00:00.000Z",
      },
    ])
  })

  it("decodes XML entities in keys", () => {
    const { objects } = parseListPage(page(entry("library/Simon &amp; Garfunkel/Track&#39;s.mp3", 10)))
    expect(objects[0].key).toBe("library/Simon & Garfunkel/Track's.mp3")
  })

  it("keeps non-ASCII keys intact", () => {
    const { objects } = parseListPage(page(entry("library/عاطف اسلم/تیرا ہونے لگا.flac", 10)))
    expect(objects[0].key).toBe("library/عاطف اسلم/تیرا ہونے لگا.flac")
  })

  it("returns the continuation token only when the page is truncated", () => {
    expect(parseListPage(page(entry("library/a.mp3", 1), true, "tok123")).nextToken).toBe("tok123")
    expect(parseListPage(page(entry("library/a.mp3", 1), false, "tok123")).nextToken).toBeNull()
  })

  it("handles an empty listing", () => {
    expect(parseListPage(page("")).objects).toEqual([])
  })
})
