import { NextRequest, NextResponse } from "next/server"

import type { SpotifyResult } from "@/lib/spotify-cache"

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || ""
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || ""
const TOKEN_URL = "https://accounts.spotify.com/api/token"
const API_BASE = "https://api.spotify.com/v1"

/** Enough of Spotify's own explanation to show, without passing on a whole error page. */
const MAX_REASON_LENGTH = 240

// In-memory token cache
let cachedToken: string | null = null
let tokenExpiresAt = 0

type SpotifyReply = { ok: true; data: any } | { ok: false; status: number; reason: string }

/** Spotify's explanation of a refusal: the message in its JSON error, or the plain text it sent. */
async function refusalReason(res: Response): Promise<string> {
  const body = (await res.text()).trim()
  let reason = body
  try {
    const parsed = JSON.parse(body)
    reason = parsed?.error?.message ?? parsed?.error_description ?? parsed?.error ?? body
  } catch {
    // Not JSON: Spotify sends some refusals as plain text, which is the reason as it stands.
  }
  return String(reason || `HTTP ${res.status}`).slice(0, MAX_REASON_LENGTH)
}

async function getAccessToken(): Promise<SpotifyReply> {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return { ok: true, data: cachedToken }
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")}`,
    },
    body: "grant_type=client_credentials",
  })
  if (!res.ok) return { ok: false, status: res.status, reason: await refusalReason(res) }

  const data = await res.json()
  cachedToken = data.access_token
  // Refresh 60s before actual expiry
  tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000
  return { ok: true, data: cachedToken }
}

async function spotifyFetch(path: string, token: string): Promise<SpotifyReply> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return { ok: false, status: res.status, reason: await refusalReason(res) }
  return { ok: true, data: await res.json() }
}

/** Spotify could not be asked. Logged, because the listener only sees that artist info is missing. */
function unavailable(step: string, reply: { status: number; reason: string }) {
  console.error(`Spotify refused the ${step}:`, reply.status, reply.reason)
  return NextResponse.json<SpotifyResult>({ found: false, unavailable: reply.reason })
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const artist = searchParams.get("artist")
  const title = searchParams.get("title")

  if (!artist || !title) {
    return NextResponse.json({ error: "artist and title are required" }, { status: 400 })
  }

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return NextResponse.json<SpotifyResult>({ found: false, unavailable: "Spotify isn't set up for this app." })
  }

  try {
    const auth = await getAccessToken()
    if (!auth.ok) return unavailable("sign-in", auth)
    const token = auth.data as string

    // Search for the track — try structured query first, fall back to simple query
    const structuredQuery = encodeURIComponent(`track:${title} artist:${artist}`)
    let search = await spotifyFetch(`/search?q=${structuredQuery}&type=track&limit=1`, token)
    if (!search.ok) return unavailable("search", search)

    if (!search.data?.tracks?.items?.length) {
      const simpleQuery = encodeURIComponent(`${artist} ${title}`)
      search = await spotifyFetch(`/search?q=${simpleQuery}&type=track&limit=1`, token)
      if (!search.ok) return unavailable("search", search)
    }

    const track = search.data?.tracks?.items?.[0]
    const artistId = track?.artists?.[0]?.id
    if (!track || !artistId) {
      return NextResponse.json<SpotifyResult>({ found: false })
    }
    const album = track.album

    // Related artists are closed to apps registered since November 2024, so
    // their absence is normal and not worth a log line.
    const [artistReply, relatedReply] = await Promise.all([
      spotifyFetch(`/artists/${artistId}`, token),
      spotifyFetch(`/artists/${artistId}/related-artists`, token),
    ])
    if (!artistReply.ok) console.error("Spotify refused the artist:", artistReply.status, artistReply.reason)
    const artistData = artistReply.ok ? artistReply.data : null
    const relatedData = relatedReply.ok ? relatedReply.data : null

    const response: SpotifyResult = {
      found: true,
      track: {
        spotifyId: track.id,
        name: track.name ?? title,
        popularity: track.popularity ?? 0,
        previewUrl: track.preview_url ?? null,
        spotifyUrl: track.external_urls?.spotify ?? "",
        trackNumber: track.track_number ?? 0,
        durationMs: track.duration_ms ?? 0,
        explicit: track.explicit ?? false,
      },
      album: album
        ? {
            name: album.name ?? "",
            image: album.images?.[0]?.url ?? "",
            releaseDate: album.release_date ?? "",
            totalTracks: album.total_tracks ?? 0,
            spotifyUrl: album.external_urls?.spotify ?? "",
          }
        : undefined,
      artist: artistData
        ? {
            spotifyId: artistData.id,
            name: artistData.name,
            image: artistData.images?.[0]?.url ?? "",
            genres: artistData.genres ?? [],
            followers: artistData.followers?.total ?? 0,
            popularity: artistData.popularity ?? 0,
            spotifyUrl: artistData.external_urls?.spotify ?? "",
          }
        : undefined,
      relatedArtists: (relatedData?.artists ?? []).slice(0, 5).map((ra: any) => ({
        name: ra.name,
        image: ra.images?.[1]?.url ?? ra.images?.[0]?.url ?? "",
        genres: (ra.genres ?? []).slice(0, 3),
        spotifyUrl: ra.external_urls?.spotify ?? "",
      })),
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error("Spotify API route error:", error)
    return NextResponse.json<SpotifyResult>({ found: false, unavailable: "Couldn't reach Spotify." })
  }
}
