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
import type {
  DabTrack,
  DabAlbum,
  DabArtist,
  DabSearchResult,
} from "@/lib/dab-types"

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

function pickCover(artwork: LucidaCoverArtwork[] | undefined, target = 600): string {
  if (!artwork || artwork.length === 0) return ""
  const sorted = [...artwork].sort((a, b) => Math.abs(a.width - target) - Math.abs(b.width - target))
  return sorted[0]?.url || artwork[artwork.length - 1].url
}

function artistsToString(artists: LucidaArtist[]): string {
  return artists.map((a) => a.name).join(", ")
}

function lucidaTrackToDab(t: LucidaTrack): DabTrack {
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
    audioQuality: "FLAC",
  }
}

function lucidaAlbumToDab(a: LucidaAlbumStub): DabAlbum {
  const artistName = artistsToString(a.artists)
  return {
    id: encodeId({ k: "al", u: a.url, t: a.title, a: a.artists?.[0]?.name }),
    title: a.title,
    artist: artistName,
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

function lucidaArtistToDab(a: LucidaArtist): DabArtist {
  return {
    id: encodeId({ k: "ar", u: a.url, n: a.name }),
    name: a.name,
    image: "",
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const q = searchParams.get("q")
  const type = searchParams.get("type") || "track"
  const limit = Number(searchParams.get("limit") || "20")
  const service = (searchParams.get("service") || "qobuz") as LucidaService
  const country = searchParams.get("country") || "US"

  if (!q) {
    return NextResponse.json({ error: "q (search query) is required" }, { status: 400 })
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

    const tracks = results.tracks.map(lucidaTrackToDab).slice(0, limit)
    const albums = results.albums.map(lucidaAlbumToDab).slice(0, limit)

    const seenArtists = new Set<string>()
    const artists: DabArtist[] = []
    for (const a of results.artists) {
      if (seenArtists.has(a.url)) continue
      seenArtists.add(a.url)
      artists.push(lucidaArtistToDab(a))
      if (artists.length >= limit) break
    }

    const dabShape: DabSearchResult = {
      tracks,
      albums,
      artists,
      pagination: {
        total: tracks.length + albums.length + artists.length,
        limit,
        hasMore: false,
        loaded: tracks.length,
      },
      query: q,
      searchType: type,
    }

    return NextResponse.json({ ...dabShape, authenticated: true })
  } catch (error) {
    console.error("Lucida search route error:", error)
    return NextResponse.json(
      { error: "Search failed", authenticated: true },
      { status: 502 }
    )
  }
}
