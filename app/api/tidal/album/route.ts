import { NextRequest, NextResponse } from "next/server"
import { searchLucida, type LucidaService, type LucidaTrack } from "@/lib/lucida-client"
import { decodeId, encodeId } from "@/lib/lucida-ids"

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const albumId = searchParams.get("albumId")
  const service = (searchParams.get("service") || "qobuz") as LucidaService
  const country = searchParams.get("country") || "US"

  if (!albumId) {
    return NextResponse.json(
      { error: "albumId is required" },
      { status: 400 }
    )
  }

  const payload = decodeId(albumId)
  if (!payload || (payload.k !== "al" && payload.k !== "t")) {
    return NextResponse.json({ error: "invalid albumId" }, { status: 400 })
  }
  const albumUrl = payload.u
  const albumTitleHint =
    (payload.k === "al" && payload.t) ||
    (payload.k === "t" && payload.al) ||
    ""
  const artistHint = (payload as { a?: string }).a || ""

  try {
    const stubQuery =
      [albumTitleHint, artistHint].filter(Boolean).join(" ") || albumUrl
    const stubSearch = await searchLucida(stubQuery, service, country)

    const targetAlbumId = lastSegment(albumUrl)
    const albumStub =
      stubSearch.albums.find((a) => lastSegment(a.url) === targetAlbumId) ??
      stubSearch.albums[0]

    if (!albumStub) {
      return NextResponse.json(
        { error: "Album not found" },
        { status: 404 }
      )
    }

    const queries = Array.from(
      new Set(
        [
          `${albumStub.title} ${albumStub.artists?.[0]?.name || ""}`.trim(),
          `${albumStub.title}`,
          `${albumStub.artists?.[0]?.name || ""} ${albumStub.title}`.trim(),
          albumStub.artists?.[0]?.name || "",
          albumTitleHint,
        ].filter((q) => q && q.length > 1)
      )
    )

    const collectedTracks = new Map<string, LucidaTrack>()
    for (const q of queries) {
      let res
      try {
        res = await searchLucida(q, service, country)
      } catch {
        continue
      }
      for (const t of res.tracks) {
        const trackAlbumId = t.album?.url ? lastSegment(t.album.url) : ""
        if (trackAlbumId !== targetAlbumId) continue
        if (!collectedTracks.has(t.url)) collectedTracks.set(t.url, t)
      }
      if (collectedTracks.size >= 30) break
    }

    const tracksForAlbum = Array.from(collectedTracks.values())
    const largestCover =
      albumStub.coverArtwork[albumStub.coverArtwork.length - 1]?.url || ""

    const tracks = tracksForAlbum
      .map((t) => {
        const artistName = t.artists.map((a) => a.name).join(", ")
        return {
          id: encodeId({ k: "t", u: t.url, t: t.title, a: artistName, al: albumStub.title }),
          title: t.title,
          artist: artistName,
          artistId: t.artists[0]
            ? encodeId({ k: "ar", u: t.artists[0].url, n: t.artists[0].name })
            : "",
          albumTitle: albumStub.title,
          albumId,
          albumCover: largestCover,
          releaseDate: albumStub.releaseDate || "",
          genre: (albumStub.genre || []).join(", "),
          duration: t.durationMs ? Math.round(t.durationMs / 1000) : 0,
          audioQuality: "LOSSLESS",
          trackNumber: t.trackNumber,
          discNumber: t.discNumber,
          copyright: t.copyright,
          isrc: t.isrc,
        }
      })
      .sort((a, b) => {
        const at = tracksForAlbum.find(
          (x) => x.title === a.title && x.artists.map((ar) => ar.name).join(", ") === a.artist
        )
        const bt = tracksForAlbum.find(
          (x) => x.title === b.title && x.artists.map((ar) => ar.name).join(", ") === b.artist
        )
        const ad = at?.discNumber ?? 1
        const bd = bt?.discNumber ?? 1
        if (ad !== bd) return ad - bd
        return (at?.trackNumber ?? 0) - (bt?.trackNumber ?? 0)
      })

    const album = {
      id: albumId,
      title: albumStub.title,
      artist: albumStub.artists.map((a) => a.name).join(", "),
      artistId: albumStub.artists[0]
        ? encodeId({ k: "ar", u: albumStub.artists[0].url, n: albumStub.artists[0].name })
        : "",
      cover: largestCover,
      releaseDate: albumStub.releaseDate || "",
      genre: (albumStub.genre || []).join(", "),
      tracks,
      trackCount: tracks.length,
      totalDuration: tracks.reduce((sum, t) => sum + t.duration, 0),
      label: albumStub.label,
    }

    return NextResponse.json({ album })
  } catch (error) {
    console.error("Lucida tidal album error:", error)
    return NextResponse.json(
      { error: "Album request failed" },
      { status: 500 }
    )
  }
}

function lastSegment(url: string): string {
  return url.replace(/\/+$/, "").split("/").pop() || url
}
