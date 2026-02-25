import { NextRequest, NextResponse } from "next/server"

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || ""
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || ""
const TOKEN_URL = "https://accounts.spotify.com/api/token"
const API_BASE = "https://api.spotify.com/v1"

// In-memory token cache
let cachedToken: string | null = null
let tokenExpiresAt = 0

async function getAccessToken(): Promise<string | null> {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken
  }

  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")}`,
      },
      body: "grant_type=client_credentials",
    })

    if (!res.ok) {
      console.error("Spotify token error:", res.status, await res.text())
      return null
    }

    const data = await res.json()
    cachedToken = data.access_token
    // Refresh 60s before actual expiry
    tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000
    return cachedToken
  } catch (error) {
    console.error("Spotify token fetch error:", error)
    return null
  }
}

async function spotifyFetch(path: string, token: string) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null
  return res.json()
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const artist = searchParams.get("artist")
  const title = searchParams.get("title")

  if (!artist || !title) {
    return NextResponse.json({ error: "artist and title are required" }, { status: 400 })
  }

  // Graceful fallback: no credentials configured
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return NextResponse.json({ found: false })
  }

  try {
    const token = await getAccessToken()
    if (!token) {
      return NextResponse.json({ found: false })
    }

    // Search for the track — try structured query first, fall back to simple query
    const structuredQuery = encodeURIComponent(`track:${title} artist:${artist}`)
    let searchData = await spotifyFetch(`/search?q=${structuredQuery}&type=track&limit=1`, token)

    // If structured search fails, try a simple query
    if (!searchData?.tracks?.items?.length) {
      const simpleQuery = encodeURIComponent(`${artist} ${title}`)
      searchData = await spotifyFetch(`/search?q=${simpleQuery}&type=track&limit=1`, token)
    }

    if (!searchData?.tracks?.items?.length) {
      return NextResponse.json({ found: false })
    }

    const track = searchData.tracks.items[0]
    const artistId = track.artists?.[0]?.id
    const album = track.album

    if (!artistId) {
      return NextResponse.json({ found: false })
    }

    // Fetch artist details and related artists in parallel
    const [artistData, relatedData] = await Promise.all([
      spotifyFetch(`/artists/${artistId}`, token),
      spotifyFetch(`/artists/${artistId}/related-artists`, token),
    ])

    const response = {
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
    return NextResponse.json({ found: false })
  }
}
