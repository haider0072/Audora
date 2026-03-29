import { NextRequest, NextResponse } from "next/server"

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

function buildCoverUrl(coverUuid: string, size: number = 640): string {
  if (!coverUuid) return ""
  const path = coverUuid.replace(/-/g, "/")
  return `https://resources.tidal.com/images/${path}/${size}x${size}.jpg`
}

const FETCH_TIMEOUT = 15000

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const albumId = searchParams.get("albumId")

  if (!albumId) {
    return NextResponse.json(
      { error: "albumId is required" },
      { status: 400 }
    )
  }

  try {
    const apiBase = getApiBase()
    const res = await fetch(`${apiBase}/album/?id=${albumId}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    })

    if (!res.ok) {
      console.error("Tidal album error:", res.status)
      return NextResponse.json(
        { error: "Failed to fetch album" },
        { status: 502 }
      )
    }

    const data = await res.json()
    const albumData = data.data

    if (!albumData) {
      return NextResponse.json(
        { error: "Album not found" },
        { status: 404 }
      )
    }

    const coverUrl = buildCoverUrl(albumData.cover)

    // Map tracks from album items
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const tracks = (albumData.items || []).map((entry: any) => {
      const track = entry.item || entry
      return {
        id: String(track.id),
        title: track.title || "",
        artist: track.artist?.name || track.artists?.[0]?.name || "",
        artistId: String(track.artist?.id || track.artists?.[0]?.id || ""),
        albumTitle: albumData.title || "",
        albumId: String(albumData.id),
        albumCover: coverUrl,
        releaseDate: albumData.releaseDate || "",
        genre: "",
        duration: track.duration || 0,
        audioQuality: track.audioQuality || "LOSSLESS",
      }
    })
    /* eslint-enable @typescript-eslint/no-explicit-any */

    const album = {
      id: String(albumData.id),
      title: albumData.title || "",
      artist: albumData.artist?.name || albumData.artists?.[0]?.name || "",
      artistId: String(albumData.artist?.id || albumData.artists?.[0]?.id || ""),
      cover: coverUrl,
      releaseDate: albumData.releaseDate || "",
      genre: "",
      tracks,
      trackCount: albumData.numberOfTracks || tracks.length,
      totalDuration: albumData.duration || 0,
      label: albumData.copyright || undefined,
    }

    return NextResponse.json({ album })
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return NextResponse.json(
        { error: "Request timed out" },
        { status: 504 }
      )
    }
    console.error("Tidal album route error:", error)
    return NextResponse.json(
      { error: "Album request failed" },
      { status: 500 }
    )
  }
}
