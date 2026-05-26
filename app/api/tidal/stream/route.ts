import { NextRequest, NextResponse } from "next/server"
import {
  initLucidaDownload,
  waitForLucidaReady,
  fetchLucidaAudio,
} from "@/lib/lucida-client"
import { decodeId } from "@/lib/lucida-ids"

export const maxDuration = 300
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const trackId = searchParams.get("trackId")
  const country = searchParams.get("country") || "auto"

  if (!trackId) {
    return NextResponse.json({ error: "trackId is required" }, { status: 400 })
  }

  const payload = decodeId(trackId)
  if (!payload || payload.k !== "t") {
    return NextResponse.json({ error: "invalid trackId" }, { status: 400 })
  }
  const trackUrl = payload.u
  const fileSlug = sanitizeFilename(
    [payload.a, payload.t].filter(Boolean).join(" - ") || trackUrl
  )

  try {
    const { handoff, server } = await initLucidaDownload(trackUrl, { country })

    await waitForLucidaReady(handoff, server, {
      signal: request.signal,
      maxAttempts: 80,
      intervalMs: 1500,
    })

    const audioRes = await fetchLucidaAudio(handoff, server, request.signal)

    if (!audioRes.ok || !audioRes.body) {
      console.error("Lucida tidal audio fetch failed:", audioRes.status)
      return NextResponse.json(
        { error: "Failed to fetch audio file" },
        { status: 502 }
      )
    }

    const contentType = audioRes.headers.get("content-type") || "audio/flac"
    const contentLength = audioRes.headers.get("content-length")

    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${fileSlug}.${extFromMime(contentType)}"`,
    }
    if (contentLength) headers["Content-Length"] = contentLength

    return new NextResponse(audioRes.body, { status: 200, headers })
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json({ error: "Cancelled" }, { status: 499 })
    }
    console.error("Lucida tidal stream error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Stream request failed" },
      { status: 500 }
    )
  }
}

function sanitizeFilename(input: string): string {
  return input.replace(/[^a-zA-Z0-9-_ ]/g, "_").trim().slice(0, 80) || "track"
}

function extFromMime(mime: string): string {
  if (mime.includes("flac")) return "flac"
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3"
  if (mime.includes("aac") || mime.includes("mp4")) return "m4a"
  if (mime.includes("ogg")) return "ogg"
  if (mime.includes("opus")) return "opus"
  return "audio"
}
