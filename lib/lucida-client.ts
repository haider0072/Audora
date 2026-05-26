// Server-side Lucida API client.
// Talks directly to the katze.lucida.to worker which exposes JSON endpoints
// without going through Cloudflare's challenge on the lucida.to frontend.

const LUCIDA_WORKER = "https://katze.lucida.to"
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

const BROWSER_HEADERS: HeadersInit = {
  "User-Agent": UA,
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Origin: "https://lucida.to",
  Referer: "https://lucida.to/",
}

export type LucidaService =
  | "qobuz"
  | "tidal"
  | "deezer"
  | "soundcloud"
  | "amazon"
  | "yandex"

export interface LucidaCoverArtwork {
  url: string
  width: number
  height: number
}

export interface LucidaArtist {
  id: string
  url: string
  name: string
}

export interface LucidaAlbumStub {
  title: string
  id: string
  url: string
  coverArtwork: LucidaCoverArtwork[]
  artists: LucidaArtist[]
  upc?: string
  releaseDate?: string
  label?: string
  genre?: string[]
}

export interface LucidaTrack {
  title: string
  id: string
  url: string
  artists: LucidaArtist[]
  album?: LucidaAlbumStub
  durationMs?: number
  explicit?: boolean
  isrc?: string
  genres?: string[]
  trackNumber?: number
  discNumber?: number
  copyright?: string
}

export interface LucidaSearchResult {
  query: string
  albums: LucidaAlbumStub[]
  tracks: LucidaTrack[]
  artists: LucidaArtist[]
}

export interface LucidaStreamInitResponse {
  success: boolean
  handoff?: string
  name?: string // server name e.g. "katze"
  error?: string
}

export interface LucidaRequestStatus {
  status: string // "starting" | "downloading" | "transcoding" | "uploading" | "completed" | etc
  message?: string
}

const DEFAULT_TIMEOUT = 20000

async function lucidaFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${LUCIDA_WORKER}${path}`, {
    ...init,
    headers: { ...BROWSER_HEADERS, ...(init?.headers || {}) },
    signal: init?.signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT),
  })
}

export async function searchLucida(
  query: string,
  service: LucidaService = "qobuz",
  country = "US"
): Promise<LucidaSearchResult> {
  const params = new URLSearchParams({ service, query, country })
  const res = await lucidaFetch(`/api/search?${params.toString()}`)

  if (!res.ok) {
    throw new Error(`Lucida search failed: ${res.status}`)
  }

  const data = (await res.json()) as { success: boolean; results?: LucidaSearchResult; error?: string }
  if (!data.success || !data.results) {
    throw new Error(data.error || "Lucida search returned no results")
  }
  return data.results
}

export interface SourcedTrack extends LucidaTrack {
  source: LucidaService
}
export interface SourcedAlbum extends LucidaAlbumStub {
  source: LucidaService
}
export interface SourcedArtist extends LucidaArtist {
  source: LucidaService
}

export interface MergedSearchResult {
  query: string
  tracks: SourcedTrack[]
  albums: SourcedAlbum[]
  artists: SourcedArtist[]
}

// The two services the public katze.lucida.to worker exposes via direct
// search. UI badge / DabTrack.source narrows to this set.
export type PublicSource = "qobuz" | "amazon"

export function narrowSource(s: LucidaService | undefined): PublicSource | undefined {
  if (s === "qobuz" || s === "amazon") return s
  return undefined
}

// The katze worker only exposes direct search for qobuz + amazon.
// Run both in parallel, attach the originating source to every item,
// then dedupe (preferring qobuz on ties because of richer metadata).
export async function searchAllSources(
  query: string,
  country = "US",
  services: LucidaService[] = ["qobuz", "amazon"]
): Promise<MergedSearchResult> {
  const settled = await Promise.allSettled(
    services.map((s) => searchLucida(query, s, country).then((r) => ({ s, r })))
  )

  const tracks: SourcedTrack[] = []
  const albums: SourcedAlbum[] = []
  const artists: SourcedArtist[] = []

  for (const result of settled) {
    if (result.status !== "fulfilled") continue
    const { s, r } = result.value
    for (const t of r.tracks) tracks.push({ ...t, source: s })
    for (const a of r.albums) albums.push({ ...a, source: s })
    for (const a of r.artists) artists.push({ ...a, source: s })
  }

  return {
    query,
    tracks: dedupeBy(tracks, trackKey),
    albums: dedupeBy(albums, albumKey),
    artists: dedupeBy(artists, artistKey),
  }
}

function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s*\(.*?\)\s*/g, " ")
    .replace(/\s*\[.*?\]\s*/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function trackKey(t: SourcedTrack): string {
  if (t.isrc) return `isrc:${t.isrc.toLowerCase()}`
  const artist = t.artists[0]?.name || ""
  return `t:${normalise(t.title)}|${normalise(artist)}|${Math.round((t.durationMs || 0) / 1000)}`
}

function albumKey(a: SourcedAlbum): string {
  if (a.upc) return `upc:${a.upc.toLowerCase()}`
  const artist = a.artists[0]?.name || ""
  return `al:${normalise(a.title)}|${normalise(artist)}`
}

function artistKey(a: SourcedArtist): string {
  return `ar:${normalise(a.name)}`
}

// Preserves the order of the first occurrence. Since qobuz is listed first
// in the default `services` array, qobuz items naturally win ties.
function dedupeBy<T>(items: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const item of items) {
    const k = keyFn(item)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(item)
  }
  return out
}

export async function initLucidaDownload(
  url: string,
  opts: { country?: string; metadata?: boolean; private?: boolean } = {}
): Promise<{ handoff: string; server: string }> {
  const body = {
    account: { id: opts.country || "auto", type: "country" },
    compat: false,
    downscale: "original",
    handoff: true,
    metadata: opts.metadata ?? true,
    private: opts.private ?? true,
    token: { primary: "", secondary: null, expiry: 0 },
    upload: { enabled: false },
    url,
  }

  const res = await lucidaFetch("/api/fetch/stream/v2", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    throw new Error(`Lucida stream init failed: ${res.status}`)
  }

  const data = (await res.json()) as LucidaStreamInitResponse
  if (!data.success || !data.handoff) {
    throw new Error(data.error || "Lucida did not return a handoff token")
  }

  return { handoff: data.handoff, server: data.name || "katze" }
}

export async function pollLucidaStatus(
  handoff: string,
  server = "katze"
): Promise<LucidaRequestStatus> {
  const res = await fetch(
    `https://${server}.lucida.to/api/fetch/request/${handoff}`,
    {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
    }
  )

  if (!res.ok) {
    throw new Error(`Lucida status poll failed: ${res.status}`)
  }
  return (await res.json()) as LucidaRequestStatus
}

export async function fetchLucidaAudio(
  handoff: string,
  server = "katze",
  signal?: AbortSignal
): Promise<Response> {
  return fetch(
    `https://${server}.lucida.to/api/fetch/request/${handoff}/download`,
    {
      headers: BROWSER_HEADERS,
      signal,
    }
  )
}

// Wait for the request to reach a downloadable state. Returns when status is
// "completed" (or the worker starts streaming), throws on terminal failure.
export async function waitForLucidaReady(
  handoff: string,
  server = "katze",
  opts: { maxAttempts?: number; intervalMs?: number; signal?: AbortSignal } = {}
): Promise<void> {
  const max = opts.maxAttempts ?? 60
  const interval = opts.intervalMs ?? 1500

  for (let i = 0; i < max; i++) {
    if (opts.signal?.aborted) throw new Error("aborted")

    let status: LucidaRequestStatus
    try {
      status = await pollLucidaStatus(handoff, server)
    } catch (err) {
      // Transient failure — retry a few times before giving up
      if (i >= max - 1) throw err
      await sleep(interval)
      continue
    }

    const s = status.status?.toLowerCase() ?? ""
    if (s === "completed" || s === "ready" || s === "done") return
    if (s === "error" || s === "failed" || s === "cancelled") {
      throw new Error(status.message || `Lucida job ${s}`)
    }
    await sleep(interval)
  }
  throw new Error("Lucida job timed out")
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
