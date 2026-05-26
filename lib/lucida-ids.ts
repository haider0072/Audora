// Encodes/decodes the opaque IDs that we expose through the (legacy) DAB API
// surface. Encoding hints (artist name, album title, etc.) on top of the
// Lucida URL lets the album/discography routes do useful follow-up searches
// without needing the lucida.to frontend (which is Cloudflare-walled).

export type IdKind = "track" | "album" | "artist"

// `s` records which Lucida service the item came from so follow-up search
// routes (album, discography) re-query the same source instead of guessing.
export interface TrackIdPayload {
  k: "t"
  u: string // streaming URL (e.g. https://play.qobuz.com/track/...)
  t?: string // track title
  a?: string // artist name
  al?: string // album title
  s?: "qobuz" | "amazon" // originating source
}

export interface AlbumIdPayload {
  k: "al"
  u: string // album URL
  t?: string // album title
  a?: string // primary artist name
  s?: "qobuz" | "amazon"
}

export interface ArtistIdPayload {
  k: "ar"
  u: string // artist URL
  n?: string // artist name
  s?: "qobuz" | "amazon"
}

export type IdPayload = TrackIdPayload | AlbumIdPayload | ArtistIdPayload

function toBase64Url(s: string): string {
  return Buffer.from(s, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

function fromBase64Url(s: string): string {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/")
  return Buffer.from(padded, "base64").toString("utf8")
}

export function encodeId(payload: IdPayload): string {
  return toBase64Url(JSON.stringify(payload))
}

export function decodeId(id: string): IdPayload | null {
  if (!id) return null
  try {
    // Be forgiving: callers may double-encode through encodeURIComponent.
    const cleaned = decodeURIComponent(id)
    const obj = JSON.parse(fromBase64Url(cleaned))
    if (obj && typeof obj === "object" && "k" in obj && "u" in obj) {
      return obj as IdPayload
    }
  } catch {
    // fall through
  }
  // Legacy fallback: callers may have passed a raw URL (older client cache).
  try {
    const maybeUrl = decodeURIComponent(id)
    if (/^https?:\/\//.test(maybeUrl)) {
      return { k: "t", u: maybeUrl }
    }
  } catch {
    // ignore
  }
  return null
}
