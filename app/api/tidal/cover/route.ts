import { NextRequest, NextResponse } from "next/server"

import { allowedCoverUrl, fetchCover } from "@/lib/cover-art-url"

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const url = searchParams.get("url")

  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 })
  }

  const parsed = allowedCoverUrl(url)
  if (!parsed) {
    return NextResponse.json({ error: "Not a cover this app fetches" }, { status: 400 })
  }

  try {
    const res = await fetchCover(parsed)

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
