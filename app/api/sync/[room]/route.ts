import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import {
  SignalingUnavailableError,
  appendMessage,
  isSignalingConfigured,
  readMessages,
} from "@/lib/sync/signal-store"

/**
 * Pairing endpoint for two-device playback.
 *
 * This is a message drop, not a session server. A peer POSTs its SDP offer,
 * answer, or ICE candidates into a room; the other peer GETs whatever it has
 * not read yet. Once the peer connection is established both sides stop
 * calling and every later message — playback position, track changes, clock
 * pings — travels directly between the browsers, never through here.
 *
 * The endpoint is deliberately pull-based rather than a stream. A handshake
 * lasts a couple of seconds, so a short burst of polling costs less and fails
 * in more obvious ways than a long-lived connection that has to survive
 * function recycling.
 */

export const dynamic = "force-dynamic"

/** Room codes are the six digits the user reads off one screen and onto another. */
const ROOM_PATTERN = /^\d{6}$/

/**
 * Ceiling on a single handshake message. A full SDP offer with candidates runs
 * a few kilobytes; well past that is not a handshake.
 */
const MAX_MESSAGE_BYTES = 16_384

const messageSchema = z.object({
  peerId: z.string().min(1).max(64),
  type: z.enum(["offer", "answer", "ice", "bye"]),
  payload: z.unknown(),
})

function invalidRoom() {
  return NextResponse.json({ error: "Invalid room code" }, { status: 400 })
}

function unavailable() {
  return NextResponse.json(
    { error: "Device sync is not configured on this deployment" },
    { status: 503 },
  )
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ room: string }> },
) {
  const { room } = await context.params
  if (!ROOM_PATTERN.test(room)) return invalidRoom()
  if (!isSignalingConfigured()) return unavailable()

  let body: unknown
  try {
    const raw = await request.text()
    if (raw.length > MAX_MESSAGE_BYTES) {
      return NextResponse.json({ error: "Message too large" }, { status: 413 })
    }
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: "Malformed body" }, { status: 400 })
  }

  const parsed = messageSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Malformed body" }, { status: 400 })
  }

  try {
    await appendMessage(room, parsed.data)
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof SignalingUnavailableError) return unavailable()
    console.error("Sync signaling append failed:", error)
    return NextResponse.json({ error: "Signaling store unavailable" }, { status: 502 })
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ room: string }> },
) {
  const { room } = await context.params
  if (!ROOM_PATTERN.test(room)) return invalidRoom()
  if (!isSignalingConfigured()) return unavailable()

  const sinceParam = request.nextUrl.searchParams.get("since")
  const since = Number.parseInt(sinceParam ?? "0", 10)

  try {
    const slice = await readMessages(room, Number.isFinite(since) ? since : 0)
    return NextResponse.json(slice, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error) {
    if (error instanceof SignalingUnavailableError) return unavailable()
    console.error("Sync signaling read failed:", error)
    return NextResponse.json({ error: "Signaling store unavailable" }, { status: 502 })
  }
}
