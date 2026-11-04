/**
 * Parsing for S3 ListObjectsV2 responses.
 *
 * Kept apart from the client so it stays pure — no credentials, no network —
 * and can be tested on its own.
 */

export interface R2Object {
  key: string
  size: number
  etag: string
  lastModified: string
}

const XML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
}

const MAX_CODE_POINT = 0x10ffff

/**
 * Decode XML entities in one pass, so the output of one entity is never read
 * as the start of another (`&#38;amp;` is `&amp;`, not `&`). A character
 * reference outside Unicode is left as written instead of throwing.
 */
function decodeXml(value: string): string {
  return value.replace(/&(?:#(\d+)|#x([0-9a-fA-F]+)|(amp|lt|gt|quot|apos));/g, (entity, dec, hex, name) => {
    if (name) return XML_ENTITIES[name]
    const code = dec !== undefined ? Number(dec) : Number.parseInt(hex, 16)
    return code <= MAX_CODE_POINT ? String.fromCodePoint(code) : entity
  })
}

function xmlField(block: string, tag: string): string | null {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))
  return match ? decodeXml(match[1]) : null
}

/**
 * Parse one ListObjectsV2 response page.
 *
 * The response shape is fixed by the S3 API and flat enough that pulling the
 * few fields needed out with patterns is more honest than taking on an XML
 * parser dependency for it. Exported for tests.
 */
export function parseListPage(xml: string): { objects: R2Object[]; nextToken: string | null } {
  const objects: R2Object[] = []
  for (const match of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
    const block = match[1]
    const key = xmlField(block, "Key")
    const size = Number(xmlField(block, "Size"))
    if (!key || !Number.isFinite(size)) continue
    objects.push({
      key,
      size,
      etag: (xmlField(block, "ETag") ?? "").replace(/"/g, ""),
      lastModified: xmlField(block, "LastModified") ?? "",
    })
  }

  const truncated = xmlField(xml, "IsTruncated") === "true"
  const nextToken = truncated ? xmlField(xml, "NextContinuationToken") : null
  return { objects, nextToken }
}
