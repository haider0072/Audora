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

function buildArtistImageUrl(pictureUuid: string, size: number = 640): string {
  if (!pictureUuid) return ""
  const path = pictureUuid.replace(/-/g, "/")
  return `https://resources.tidal.com/images/${path}/${size}x${size}.jpg`
}

const FETCH_TIMEOUT = 20000

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const artistId = searchParams.get("artistId")

  if (!artistId) {
    return NextResponse.json(
      { error: "artistId is required" },
      { status: 400 }
    )
  }

  try {
    const apiBase = getApiBase()

    // Fetch artist info and discography in parallel
    const [artistRes, discoRes] = await Promise.all([
      fetch(`${apiBase}/artist/?id=${artistId}`, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT),
      }),
      fetch(`${apiBase}/artist/?f=${artistId}`, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT),
      }),
    ])

    if (!artistRes.ok) {
      console.error("Tidal artist error:", artistRes.status)
      return NextResponse.json(
        { error: "Failed to fetch artist" },
        { status: 502 }
      )
    }

    const artistData = await artistRes.json()
    const artistInfo = artistData.artist || artistData.data

    if (!artistInfo) {
      return NextResponse.json(
        { error: "Artist not found" },
        { status: 404 }
      )
    }

    const artist = {
      id: String(artistInfo.id),
      name: artistInfo.name || "",
      image: buildArtistImageUrl(artistInfo.picture),
      biography: artistInfo.biography || undefined,
      albumCount: undefined as number | undefined,
    }

    // Parse discography
    /* eslint-disable @typescript-eslint/no-explicit-any */
    let albums: any[] = []
    if (discoRes.ok) {
      const discoData = await discoRes.json()
      const albumItems = discoData.data?.items || discoData.items || []
      albums = albumItems.map((item: any) => {
        const albumData = item.item || item
        return {
          id: String(albumData.id),
          title: albumData.title || "",
          artist: artist.name,
          artistId: artist.id,
          cover: buildCoverUrl(albumData.cover),
          releaseDate: albumData.releaseDate || "",
          genre: "",
          tracks: [],
          trackCount: albumData.numberOfTracks || 0,
          totalDuration: albumData.duration || 0,
          label: albumData.copyright || undefined,
        }
      })
      artist.albumCount = albums.length
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */

    return NextResponse.json({ artist, albums })
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return NextResponse.json(
        { error: "Request timed out" },
        { status: 504 }
      )
    }
    console.error("Tidal discography route error:", error)
    return NextResponse.json(
      { error: "Discography request failed" },
      { status: 500 }
    )
  }
}
