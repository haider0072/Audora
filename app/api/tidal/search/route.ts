import { NextRequest, NextResponse } from "next/server"
import {
  searchAllSources,
  narrowSource,
  type LucidaService,
  type LucidaCoverArtwork,
  type SourcedTrack,
  type SourcedAlbum,
  type SourcedArtist,
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

function artistsToString(artists: { name: string }[]): string {
  return artists.map((a) => a.name).join(", ")
}

function mapTrack(t: SourcedTrack) {
  const album = t.album
  const artistName = artistsToString(t.artists)
  return {
    id: encodeId({ k: "t", u: t.url, t: t.title, a: artistName, al: album?.title, s: narrowSource(t.source) }),
    title: t.title,
    artist: artistName,
    artistId: t.artists[0]
      ? encodeId({ k: "ar", u: t.artists[0].url, n: t.artists[0].name, s: narrowSource(t.source) })
      : "",
    albumTitle: album?.title || "",
    albumId: album
      ? encodeId({ k: "al", u: album.url, t: album.title, a: album.artists?.[0]?.name, s: narrowSource(t.source) })
      : "",
    albumCover: pickCover(t.coverArtwork ?? album?.coverArtwork),
    releaseDate: album?.releaseDate || "",
    genre: (album?.genre || t.genres || []).join(", "),
    duration: t.durationMs ? Math.round(t.durationMs / 1000) : 0,
    audioQuality: "LOSSLESS",
    trackNumber: t.trackNumber,
    discNumber: t.discNumber,
    copyright: t.copyright,
    isrc: t.isrc,
    source: narrowSource(t.source),
  }
}

function mapAlbum(a: SourcedAlbum) {
  return {
    id: encodeId({ k: "al", u: a.url, t: a.title, a: a.artists?.[0]?.name, s: narrowSource(a.source) }),
    title: a.title,
    artist: artistsToString(a.artists),
    artistId: a.artists[0]
      ? encodeId({ k: "ar", u: a.artists[0].url, n: a.artists[0].name, s: narrowSource(a.source) })
      : "",
    cover: pickCover(a.coverArtwork),
    releaseDate: a.releaseDate || "",
    genre: (a.genre || []).join(", "),
    tracks: [],
    trackCount: 0,
    totalDuration: 0,
    label: a.label,
    source: narrowSource(a.source),
  }
}

function mapArtist(a: SourcedArtist) {
  return {
    id: encodeId({ k: "ar", u: a.url, n: a.name, s: narrowSource(a.source) }),
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
  const country = searchParams.get("country") || "US"
  const sourceFilter = searchParams.get("source") as LucidaService | null

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
    const services: LucidaService[] = sourceFilter
      ? [sourceFilter]
      : ["qobuz", "amazon"]

    const merged = await searchAllSources(q, country, services)

    const tracks = merged.tracks.map(mapTrack).slice(0, limit)
    const albums = merged.albums.map(mapAlbum).slice(0, limit)

    const seenArtists = new Set<string>()
    const artists: ReturnType<typeof mapArtist>[] = []
    for (const a of merged.artists) {
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
