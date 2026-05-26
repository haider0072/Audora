import { NextRequest, NextResponse } from "next/server"
import { searchLucida, type LucidaService, type LucidaTrack } from "@/lib/lucida-client"
import { decodeId, encodeId } from "@/lib/lucida-ids"
import type { DabAlbum, DabTrack } from "@/lib/dab-types"

// Lucida's worker doesn't expose a dedicated album endpoint. We recover album
// detail by re-issuing search queries built from the encoded album hints
// (title + artist) and filtering tracks whose `album.url` matches.

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const albumId = searchParams.get("albumId")
  const service = (searchParams.get("service") || "qobuz") as LucidaService
  const country = searchParams.get("country") || "US"

  if (!albumId) {
    return NextResponse.json({ error: "albumId is required" }, { status: 400 })
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
  // Use the source that originally produced this album for follow-up
  // searches — Qobuz IDs won't match Amazon's album catalog and vice versa.
  const resolvedService = (payload.s as LucidaService | undefined) || service

  try {
    // 1. Find the album stub itself so we have authoritative metadata.
    const stubQuery = [albumTitleHint, artistHint].filter(Boolean).join(" ") || albumUrl
    const stubSearch = await searchLucida(stubQuery, resolvedService, country)
    const albumStub =
      stubSearch.albums.find((a) => a.url === albumUrl) ?? stubSearch.albums[0]

    if (!albumStub) {
      return NextResponse.json(
        { error: "Album not found", authenticated: true, album: null },
        { status: 404 }
      )
    }

    // 2. Build a series of queries to surface as many tracks of the album as
    //    possible. Lucida's track search is "top N matches across services",
    //    so we run several queries with different angles to expand recall.
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

    // Lucida returns the same album under multiple URL shapes
    // (e.g. play.qobuz.com/album/<id> vs www.qobuz.com/<locale>/album/<slug>/<id>).
    // Compare by the trailing service ID instead of the raw URL.
    const targetAlbumId = lastSegment(albumUrl)

    const collectedTracks = new Map<string, LucidaTrack>()
    for (const q of queries) {
      let res
      try {
        res = await searchLucida(q, resolvedService, country)
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

    const dabTracks: DabTrack[] = tracksForAlbum
      .map<DabTrack>((t) => {
        const artistName = t.artists.map((a) => a.name).join(", ")
        return {
          id: encodeId({ k: "t", u: t.url, t: t.title, a: artistName, al: albumStub.title, s: resolvedService as "qobuz" | "amazon" }),
          title: t.title,
          artist: artistName,
          artistId: t.artists[0]
            ? encodeId({ k: "ar", u: t.artists[0].url, n: t.artists[0].name, s: resolvedService as "qobuz" | "amazon" })
            : "",
          albumTitle: albumStub.title,
          albumId,
          albumCover: largestCover,
          releaseDate: albumStub.releaseDate || "",
          genre: (albumStub.genre || []).join(", "),
          duration: t.durationMs ? Math.round(t.durationMs / 1000) : 0,
          audioQuality: "FLAC",
          source: resolvedService as "qobuz" | "amazon",
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

    const album: DabAlbum = {
      id: albumId,
      title: albumStub.title,
      artist: albumStub.artists.map((a) => a.name).join(", "),
      artistId: albumStub.artists[0]
        ? encodeId({ k: "ar", u: albumStub.artists[0].url, n: albumStub.artists[0].name, s: resolvedService as "qobuz" | "amazon" })
        : "",
      cover: largestCover,
      releaseDate: albumStub.releaseDate || "",
      genre: (albumStub.genre || []).join(", "),
      tracks: dabTracks,
      trackCount: dabTracks.length,
      totalDuration: dabTracks.reduce((sum, t) => sum + t.duration, 0),
      label: albumStub.label,
      source: resolvedService as "qobuz" | "amazon",
    }

    return NextResponse.json({ album, authenticated: true })
  } catch (error) {
    console.error("Lucida album route error:", error)
    return NextResponse.json(
      { error: "Album request failed", authenticated: true },
      { status: 500 }
    )
  }
}

function lastSegment(url: string): string {
  return url.replace(/\/+$/, "").split("/").pop() || url
}
