import { NextRequest, NextResponse } from "next/server"
import { getSession, clearSession, getCookieHeader } from "../auth/route"

const DAB_API = "https://dab.yeet.su/api"
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
const FETCH_TIMEOUT = 10000 // 10s for stream URL fetch

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const trackId = searchParams.get("trackId")
  const quality = searchParams.get("quality") || "7" // Default: standard FLAC

  if (!trackId) {
    return NextResponse.json(
      { error: "trackId is required" },
      { status: 400 }
    )
  }

  let session = await getSession()
  if (!session) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    )
  }

  try {
    // Step 1: Get stream URL from DAB
    const params = new URLSearchParams({ trackId, quality })
    let res = await fetch(`${DAB_API}/stream?${params}`, {
      headers: {
        "User-Agent": USER_AGENT,
        Cookie: getCookieHeader(),
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    })

    // Re-auth on 401
    if (res.status === 401) {
      clearSession()
      session = await getSession()
      if (!session) {
        return NextResponse.json(
          { error: "Not authenticated" },
          { status: 401 }
        )
      }
      res = await fetch(`${DAB_API}/stream?${params}`, {
        headers: {
          "User-Agent": USER_AGENT,
          Cookie: getCookieHeader(),
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT),
      })
    }

    if (!res.ok) {
      console.error("DAB stream URL error:", res.status)
      return NextResponse.json(
        { error: "Failed to get stream URL" },
        { status: 502 }
      )
    }

    const data = await res.json()
    const streamUrl = data.streamUrl || data.url
    if (!streamUrl) {
      return NextResponse.json(
        { error: "No stream URL returned" },
        { status: 502 }
      )
    }

    // Step 2: Fetch the actual audio file and stream it back
    const audioRes = await fetch(streamUrl, {
      headers: {
        "User-Agent": USER_AGENT,
      },
    })

    if (!audioRes.ok || !audioRes.body) {
      console.error("DAB audio fetch error:", audioRes.status)
      return NextResponse.json(
        { error: "Failed to fetch audio file" },
        { status: 502 }
      )
    }

    // Stream the response back to the client
    const contentLength = audioRes.headers.get("content-length")
    const contentType =
      audioRes.headers.get("content-type") || "audio/flac"

    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${trackId}.flac"`,
    }
    if (contentLength) {
      headers["Content-Length"] = contentLength
    }

    return new NextResponse(audioRes.body, {
      status: 200,
      headers,
    })
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return NextResponse.json(
        { error: "Request timed out" },
        { status: 504 }
      )
    }
    console.error("DAB stream route error:", error)
    return NextResponse.json(
      { error: "Stream request failed" },
      { status: 500 }
    )
  }
}
