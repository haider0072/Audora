/**
 * Where album covers may be fetched from on the server: the catalogs Lucida
 * returns art from, over https. Anything else is refused, so neither the
 * cover proxy nor the cloud import can be made to fetch an arbitrary URL.
 */
const COVER_HOSTS: ReadonlySet<string> = new Set([
  "resources.tidal.com",
  "static.qobuz.com",
  "m.media-amazon.com",
  "images-na.ssl-images-amazon.com",
])

/** A cover is only ever a nicety, so its fetch gives up after this long. */
const COVER_TIMEOUT_MS = 10_000

/** `raw` as a URL when it is a cover the server may fetch, or null. */
export function allowedCoverUrl(raw: string): URL | null {
  if (!URL.canParse(raw)) return null
  const url = new URL(raw)
  return url.protocol === "https:" && COVER_HOSTS.has(url.hostname) ? url : null
}

/** Fetch a cover `allowedCoverUrl` let through. */
export function fetchCover(url: URL): Promise<Response> {
  return fetch(url, { signal: AbortSignal.timeout(COVER_TIMEOUT_MS) })
}
