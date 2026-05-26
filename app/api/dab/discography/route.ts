import { NextRequest, NextResponse } from "next/server"
import { searchLucida, type LucidaService } from "@/lib/lucida-client"
import { decodeId, encodeId } from "@/lib/lucida-ids"
import type { DabAlbum, DabArtist } from "@/lib/dab-types"

// Lucida has no dedicated discography endpoint. We search by the artist name
// (embedded in the encoded artistId) and group resulting albums by URL.

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const artistId = searchParams.get("artistId")
  const service = (searchParams.get("service") || "qobuz") as LucidaService
  const country = searchParams.get("country") || "US"

  if (!artistId) {
    return NextResponse.json({ error: "artistId is required" }, { status: 400 })
  }

  const payload = decodeId(artistId)
  if (!payload || (payload.k !== "ar" && payload.k !== "t" && payload.k !== "al")) {
    return NextResponse.json({ error: "invalid artistId" }, { status: 400 })
  }
  const artistUrl = payload.u
  const artistName =
    (payload.k === "ar" && payload.n) ||
    (payload.k !== "ar" && (payload as { a?: string }).a) ||
    ""

  try {
    const query = artistName || artistUrl
    const results = await searchLucida(query, service, country)

    const matchingArtist =
      results.artists.find((a) => a.url === artistUrl) ??
      results.artists.find((a) => artistName && a.name.toLowerCase() === artistName.toLowerCase()) ??
      results.artists[0]

    const resolvedName = matchingArtist?.name || artistName || "Unknown Artist"

    const albumMap = new Map<string, DabAlbum>()
    for (const album of results.albums) {
      const matches = album.artists.some(
        (a) =>
          a.url === artistUrl ||
          (artistName && a.name.toLowerCase() === artistName.toLowerCase())
      )
      if (!matches) continue
      if (albumMap.has(album.url)) continue
      const largestCover =
        album.coverArtwork[album.coverArtwork.length - 1]?.url || ""
      albumMap.set(album.url, {
        id: encodeId({ k: "al", u: album.url, t: album.title, a: album.artists?.[0]?.name }),
        title: album.title,
        artist: album.artists.map((a) => a.name).join(", "),
        artistId,
        cover: largestCover,
        releaseDate: album.releaseDate || "",
        genre: (album.genre || []).join(", "),
        tracks: [],
        trackCount: 0,
        totalDuration: 0,
        label: album.label,
      })
    }

    const artist: DabArtist = {
      id: artistId,
      name: resolvedName,
      image: "",
      albumCount: albumMap.size,
    }

    return NextResponse.json({
      artist,
      albums: Array.from(albumMap.values()),
      authenticated: true,
    })
  } catch (error) {
    console.error("Lucida discography route error:", error)
    return NextResponse.json(
      { error: "Discography request failed", authenticated: true },
      { status: 500 }
    )
  }
}
