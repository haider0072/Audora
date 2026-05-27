import { NextRequest, NextResponse } from "next/server"

// Hostnames whose cover art we're willing to proxy. Anything else gets 400.
// Keeps the route from being turned into an open SSRF helper while still
// covering every catalog Lucida can return album art from.
const ALLOWED_HOSTS = new Set([
  "resources.tidal.com",
  "static.qobuz.com",
  "m.media-amazon.com",
  "images-na.ssl-images-amazon.com",
])

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const url = searchParams.get("url")

  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 })
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 })
  }

  if (parsed.protocol !== "https:" || !ALLOWED_HOSTS.has(parsed.hostname)) {
    return NextResponse.json({ error: "Host not allowed" }, { status: 400 })
  }

  try {
    const res = await fetch(parsed.toString(), {
      signal: AbortSignal.timeout(10000),
    })

    if (!res.ok || !res.body) {
      return NextResponse.json({ error: "Failed to fetch cover" }, { status: 502 })
    }

    const contentType = res.headers.get("content-type") || "image/jpeg"
    const contentLength = res.headers.get("content-length")

    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400",
    }
    if (contentLength) headers["Content-Length"] = contentLength

    return new NextResponse(res.body, { status: 200, headers })
  } catch {
    return NextResponse.json({ error: "Cover fetch failed" }, { status: 500 })
  }
}
