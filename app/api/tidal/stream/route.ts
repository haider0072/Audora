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

const FETCH_TIMEOUT = 15000

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const trackId = searchParams.get("trackId")
  const quality = searchParams.get("quality") || "LOSSLESS"

  if (!trackId) {
    return NextResponse.json(
      { error: "trackId is required" },
      { status: 400 }
    )
  }

  try {
    const apiBase = getApiBase()

    // Step 1: Get track manifest from Tidal API
    const params = new URLSearchParams({ id: trackId, quality })
    const res = await fetch(`${apiBase}/track/?${params}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    })

    if (!res.ok) {
      console.error("Tidal track API error:", res.status)
      return NextResponse.json(
        { error: "Failed to get track info" },
        { status: 502 }
      )
    }

    const data = await res.json()
    const manifestB64 = data.data?.manifest
    if (!manifestB64) {
      return NextResponse.json(
        { error: "No manifest returned" },
        { status: 502 }
      )
    }

    // Step 2: Decode base64 manifest to get stream URL
    const manifestJson = Buffer.from(manifestB64, "base64").toString("utf-8")
    const manifest = JSON.parse(manifestJson)
    const streamUrl = manifest.urls?.[0]

    if (!streamUrl) {
      return NextResponse.json(
        { error: "No stream URL in manifest" },
        { status: 502 }
      )
    }

    // Step 3: Fetch the actual audio file and stream it back
    const audioRes = await fetch(streamUrl)

    if (!audioRes.ok || !audioRes.body) {
      console.error("Tidal audio fetch error:", audioRes.status)
      return NextResponse.json(
        { error: "Failed to fetch audio file" },
        { status: 502 }
      )
    }

    const contentLength = audioRes.headers.get("content-length")
    const mimeType = manifest.mimeType || "audio/flac"
    const codec = manifest.codecs || "flac"
    const ext = codec === "flac" ? "flac" : "m4a"

    const headers: Record<string, string> = {
      "Content-Type": mimeType,
      "Content-Disposition": `attachment; filename="${trackId}.${ext}"`,
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
    console.error("Tidal stream route error:", error)
    return NextResponse.json(
      { error: "Stream request failed" },
      { status: 500 }
    )
  }
}
