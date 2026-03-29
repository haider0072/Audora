import { NextRequest, NextResponse } from "next/server"

// Round-robin across Tidal API servers
const API_SERVERS = [
  "https://hund.qqdl.site",
  "https://katze.qqdl.site",
  "https://maus.qqdl.site",
  "https://vogel.qqdl.site",
  "https://wolf.qqdl.site",
]
let serverIndex = 0

function getApiBase(): string {
  const server = API_SERVERS[serverIndex % API_SERVERS.length]
  serverIndex++
  return server
}

// Rate limiting
const requestTimestamps: number[] = []
const RATE_LIMIT = 30
const RATE_WINDOW = 60 * 1000

function checkRateLimit(): { allowed: boolean; retryAfter?: number } {
  const now = Date.now()
  while (requestTimestamps.length > 0 && now - requestTimestamps[0] > RATE_WINDOW) {
    requestTimestamps.shift()
  }
  if (requestTimestamps.length >= RATE_LIMIT) {
    const oldestInWindow = requestTimestamps[0]
    const retryAfter = Math.ceil((oldestInWindow + RATE_WINDOW - now) / 1000)
    return { allowed: false, retryAfter }
  }
  requestTimestamps.push(now)
  return { allowed: true }
}

function buildCoverUrl(coverUuid: string, size: number = 640): string {
  if (!coverUuid) return ""
  const path = coverUuid.replace(/-/g, "/")
  return `https://resources.tidal.com/images/${path}/${size}x${size}.jpg`
}

function buildArtistImageUrl(pictureUuid: string, size: number = 640): string {
  if (!pictureUuid) return ""
  const path = pictureUuid.replace(/-/g, "/")
  return `https://resources.tidal.com/images/${path}/${size}x${size}.jpg`
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapTrack(item: any) {
  return {
    id: String(item.id),
    title: item.title || "",
    artist: item.artist?.name || item.artists?.[0]?.name || "",
    artistId: String(item.artist?.id || item.artists?.[0]?.id || ""),
    albumTitle: item.album?.title || "",
    albumId: String(item.album?.id || ""),
    albumCover: buildCoverUrl(item.album?.cover),
    releaseDate: item.streamStartDate || "",
    genre: "",
    duration: item.duration || 0,
    audioQuality: item.audioQuality || "LOSSLESS",
  }
}

function mapAlbum(item: any) {
  return {
    id: String(item.id),
    title: item.title || "",
    artist: item.artist?.name || item.artists?.[0]?.name || "",
    artistId: String(item.artist?.id || item.artists?.[0]?.id || ""),
    cover: buildCoverUrl(item.cover),
    releaseDate: item.releaseDate || "",
    genre: "",
    tracks: [],
    trackCount: item.numberOfTracks || 0,
    totalDuration: item.duration || 0,
    label: item.copyright || undefined,
  }
}

function mapArtist(item: any) {
  return {
    id: String(item.id),
    name: item.name || "",
    image: buildArtistImageUrl(item.picture),
    albumCount: undefined,
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const FETCH_TIMEOUT = 25000

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const q = searchParams.get("q")
  const type = searchParams.get("type") || "track"
  const limit = searchParams.get("limit") || "20"

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
    const apiBase = getApiBase()

    if (type === "all") {
      // Parallel search — use allSettled so partial results still return
      const [tracksResult, albumsResult, artistsResult] = await Promise.allSettled([
        fetch(`${apiBase}/search/?s=${encodeURIComponent(q)}&limit=${limit}`, {
          signal: AbortSignal.timeout(FETCH_TIMEOUT),
        }).then(r => r.ok ? r.json() : null),
        fetch(`${apiBase}/search/?al=${encodeURIComponent(q)}&limit=${limit}`, {
          signal: AbortSignal.timeout(FETCH_TIMEOUT),
        }).then(r => r.ok ? r.json() : null),
        fetch(`${apiBase}/search/?a=${encodeURIComponent(q)}&limit=${limit}`, {
          signal: AbortSignal.timeout(FETCH_TIMEOUT),
        }).then(r => r.ok ? r.json() : null),
      ])

      const tracksData = tracksResult.status === "fulfilled" ? tracksResult.value : null
      const albumsData = albumsResult.status === "fulfilled" ? albumsResult.value : null
      const artistsData = artistsResult.status === "fulfilled" ? artistsResult.value : null

      const tracks = (tracksData?.data?.items || []).map(mapTrack)
      const albums = (albumsData?.data?.albums?.items || []).map(mapAlbum)
      const artists = (artistsData?.data?.artists?.items || []).map(mapArtist)

      // If all three failed, return error
      if (tracks.length === 0 && albums.length === 0 && artists.length === 0 && !tracksData && !albumsData && !artistsData) {
        return NextResponse.json(
          { error: "All searches failed or timed out" },
          { status: 502 }
        )
      }

      const totalTracks = tracksData?.data?.totalNumberOfItems || 0

      return NextResponse.json({
        tracks,
        albums,
        artists,
        pagination: {
          total: totalTracks,
          limit: Number(limit),
          hasMore: totalTracks > Number(limit),
          loaded: tracks.length,
        },
        query: q,
        searchType: type,
      })
    }

    // Single type search
    let url: string
    if (type === "album") {
      url = `${apiBase}/search/?al=${encodeURIComponent(q)}&limit=${limit}`
    } else if (type === "artist") {
      url = `${apiBase}/search/?a=${encodeURIComponent(q)}&limit=${limit}`
    } else {
      url = `${apiBase}/search/?s=${encodeURIComponent(q)}&limit=${limit}`
    }

    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    })

    if (!res.ok) {
      console.error("Tidal search error:", res.status)
      return NextResponse.json(
        { error: "Search failed", status: res.status },
        { status: 502 }
      )
    }

    const data = await res.json()

    let tracks: ReturnType<typeof mapTrack>[] = []
    let albums: ReturnType<typeof mapAlbum>[] = []
    let artists: ReturnType<typeof mapArtist>[] = []
    let total = 0

    if (type === "track") {
      tracks = (data.data?.items || []).map(mapTrack)
      total = data.data?.totalNumberOfItems || 0
    } else if (type === "album") {
      albums = (data.data?.albums?.items || []).map(mapAlbum)
      total = data.data?.albums?.totalNumberOfItems || 0
    } else if (type === "artist") {
      artists = (data.data?.artists?.items || []).map(mapArtist)
      total = data.data?.artists?.totalNumberOfItems || 0
    }

    return NextResponse.json({
      tracks,
      albums,
      artists,
      pagination: {
        total,
        limit: Number(limit),
        hasMore: total > Number(limit),
        loaded: tracks.length + albums.length + artists.length,
      },
      query: q,
      searchType: type,
    })
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return NextResponse.json(
        { error: "Search timed out" },
        { status: 504 }
      )
    }
    console.error("Tidal search route error:", error)
    return NextResponse.json(
      { error: "Search request failed" },
      { status: 500 }
    )
  }
}
