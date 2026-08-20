import { NextRequest, NextResponse } from "next/server"
import {
  fetchLucidaMetadata,
  narrowSource,
  type LucidaCoverArtwork,
  type LucidaService,
} from "@/lib/lucida-client"
import { encodeId } from "@/lib/lucida-ids"

export const dynamic = "force-dynamic"

// Detect which streaming service a pasted URL belongs to, purely from its host.
// Only qobuz/amazon are carried in the opaque ID (`s`) for follow-up searches;
// everything else still downloads fine (the download route only needs the URL),
// we just can't do same-source album/artist follow-ups for it.
function serviceFromUrl(url: string): LucidaService | undefined {
  let host: string
  try {
    host = new URL(url).hostname
  } catch {
    return undefined
  }
  if (host.includes("qobuz")) return "qobuz"
  if (host.includes("amazon")) return "amazon"
  if (host.includes("tidal")) return "tidal"
  if (host.includes("deezer")) return "deezer"
  if (host.includes("soundcloud")) return "soundcloud"
  if (host.includes("yandex")) return "yandex"
  return undefined
}

function pickCover(artwork: LucidaCoverArtwork[] | undefined, target = 640): string {
  if (!artwork || artwork.length === 0) return ""
  const sorted = [...artwork].sort(
    (a, b) => Math.abs(a.width - target) - Math.abs(b.width - target)
  )
  return sorted[0]?.url || artwork[artwork.length - 1].url
}

function artistsToString(artists: { name: string }[] | undefined): string {
  return (artists || []).map((a) => a.name).join(", ")
}

// Resolve a pasted streaming URL into a search-result-shaped track so the
// existing download pipeline (progress, art-embed, IndexedDB, playlist) can
// consume it unchanged.
export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get("url")
  if (!rawUrl) {
    return NextResponse.json({ error: "url is required" }, { status: 400 })
  }

  let url: string
  try {
    url = new URL(rawUrl.trim()).toString()
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 })
  }

  try {
    const meta = await fetchLucidaMetadata(url)

    if (meta.type && meta.type !== "track") {
      return NextResponse.json(
        {
          error: `This link points to a ${meta.type}, not a track. Paste a track link.`,
        },
        { status: 422 }
      )
    }

    const service = serviceFromUrl(url)
    const narrowed = narrowSource(service)
    const artistName = artistsToString(meta.artists)
    const primaryArtist = meta.artists?.[0]
    const album = meta.album

    // Prefer the canonical URL the metadata endpoint echoes back (strips
    // tracking params), falling back to what the user pasted.
    const streamUrl = meta.url || url

    const track = {
      id: encodeId({
        k: "t",
        u: streamUrl,
        t: meta.title,
        a: artistName,
        al: album?.title,
        s: narrowed,
      }),
      title: meta.title || "Unknown Title",
      artist: artistName || "Unknown Artist",
      artistId: primaryArtist
        ? encodeId({ k: "ar", u: primaryArtist.url, n: primaryArtist.name, s: narrowed })
        : "",
      albumTitle: album?.title || "",
      albumId: album
        ? encodeId({ k: "al", u: album.url, t: album.title, a: album.artists?.[0]?.name, s: narrowed })
        : "",
      albumCover: pickCover(meta.coverArtwork ?? album?.coverArtwork),
      releaseDate: meta.releaseDate || album?.releaseDate || "",
      genre: (meta.genres || album?.genre || []).join(", "),
      duration: meta.durationMs ? Math.round(meta.durationMs / 1000) : 0,
      audioQuality: "LOSSLESS",
      trackNumber: meta.trackNumber,
      discNumber: meta.discNumber,
      copyright: meta.copyright,
      isrc: meta.isrc,
      source: narrowed,
    }

    return NextResponse.json({ track })
  } catch (error) {
    console.error("Lucida resolve route error:", error)
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to resolve URL",
      },
      { status: 502 }
    )
  }
}
