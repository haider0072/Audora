import { NextRequest, NextResponse } from "next/server"
import {
  searchLucida,
  type LucidaService,
  type LucidaTrack,
  type LucidaAlbumStub,
  type LucidaArtist,
  type LucidaCoverArtwork,
} from "@/lib/lucida-client"
import { encodeId } from "@/lib/lucida-ids"

const requestTimestamps: number[] = []
const RATE_LIMIT = 30
const RATE_WINDOW = 60 * 1000

function checkRateLimit(): { allowed: boolean; retryAfter?: number } {
  const now = Date.now()
  while (requestTimestamps.length > 0 && now - requestTimestamps[0] > RATE_WINDOW) {
    requestTimestamps.shift()
  }
  if (requestTimestamps.length >= RATE_LIMIT) {
    const retryAfter = Math.ceil(
      (requestTimestamps[0] + RATE_WINDOW - now) / 1000
    )
    return { allowed: false, retryAfter }
  }
  requestTimestamps.push(now)
  return { allowed: true }
}

function pickCover(artwork: LucidaCoverArtwork[] | undefined, target = 640): string {
  if (!artwork || artwork.length === 0) return ""
  const sorted = [...artwork].sort(
    (a, b) => Math.abs(a.width - target) - Math.abs(b.width - target)
  )
  return sorted[0]?.url || artwork[artwork.length - 1].url
}

function artistsToString(artists: LucidaArtist[]): string {
  return artists.map((a) => a.name).join(", ")
}

function mapTrack(t: LucidaTrack) {
  const album = t.album
  const artistName = artistsToString(t.artists)
  return {
    id: encodeId({ k: "t", u: t.url, t: t.title, a: artistName, al: album?.title }),
    title: t.title,
    artist: artistName,
    artistId: t.artists[0]
      ? encodeId({ k: "ar", u: t.artists[0].url, n: t.artists[0].name })
      : "",
    albumTitle: album?.title || "",
    albumId: album
      ? encodeId({ k: "al", u: album.url, t: album.title, a: album.artists?.[0]?.name })
      : "",
    albumCover: pickCover(album?.coverArtwork),
    releaseDate: album?.releaseDate || "",
    genre: (album?.genre || t.genres || []).join(", "),
    duration: t.durationMs ? Math.round(t.durationMs / 1000) : 0,
    audioQuality: "LOSSLESS",
    trackNumber: t.trackNumber,
    discNumber: t.discNumber,
    copyright: t.copyright,
    isrc: t.isrc,
  }
}

function mapAlbum(a: LucidaAlbumStub) {
  return {
    id: encodeId({ k: "al", u: a.url, t: a.title, a: a.artists?.[0]?.name }),
    title: a.title,
    artist: artistsToString(a.artists),
    artistId: a.artists[0]
      ? encodeId({ k: "ar", u: a.artists[0].url, n: a.artists[0].name })
      : "",
    cover: pickCover(a.coverArtwork),
    releaseDate: a.releaseDate || "",
    genre: (a.genre || []).join(", "),
    tracks: [],
    trackCount: 0,
    totalDuration: 0,
    label: a.label,
  }
}

function mapArtist(a: LucidaArtist) {
  return {
    id: encodeId({ k: "ar", u: a.url, n: a.name }),
    name: a.name,
    image: "",
    albumCount: undefined,
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const q = searchParams.get("q")
  const type = searchParams.get("type") || "track"
  const limit = Number(searchParams.get("limit") || "20")
  // Lucida's public workers only expose direct search for qobuz + amazon.
  // Tidal/Deezer/SoundCloud requests go through the Cloudflare-walled
  // frontend, so we default to qobuz here regardless of the historical
  // route name. The audio quality is FLAC either way.
  const service = (searchParams.get("service") || "qobuz") as LucidaService
  const country = searchParams.get("country") || "US"

  if (!q) {
    return NextResponse.json(
      { error: "q (search query) is required" },
      { status: 400 }
    )
  }

  const rateCheck = checkRateLimit()
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: "rate_limited", retryAfter: rateCheck.retryAfter },
      { status: 429 }
    )
  }

  try {
    const results = await searchLucida(q, service, country)

    const tracks = results.tracks.map(mapTrack).slice(0, limit)
    const albums = results.albums.map(mapAlbum).slice(0, limit)

    const seenArtists = new Set<string>()
    const artists: ReturnType<typeof mapArtist>[] = []
    for (const a of results.artists) {
      if (seenArtists.has(a.url)) continue
      seenArtists.add(a.url)
      artists.push(mapArtist(a))
      if (artists.length >= limit) break
    }

    return NextResponse.json({
      tracks,
      albums,
      artists,
      pagination: {
        total: tracks.length + albums.length + artists.length,
        limit,
        hasMore: false,
        loaded: tracks.length + albums.length + artists.length,
      },
      query: q,
      searchType: type,
    })
  } catch (error) {
    console.error("Lucida tidal search error:", error)
    return NextResponse.json(
      { error: "Search failed" },
      { status: 502 }
    )
  }
}
