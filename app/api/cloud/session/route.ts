import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { getCloudConfig } from "@/lib/cloud/config"
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  isCorrectPassword,
  isValidSessionToken,
} from "@/lib/cloud/session"

/**
 * Sign in to, check, and sign out of the cloud library.
 *
 * GET reports whether the deployment has a cloud library and whether this
 * browser is signed in, so the client can decide what to render without
 * provoking a 401. POST exchanges the password for a session cookie; DELETE
 * clears it.
 */

export const dynamic = "force-dynamic"

/** Generous for a passphrase, small enough that the body is never a payload. */
const MAX_PASSWORD_LENGTH = 512

const loginSchema = z.object({
  password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
})

export async function GET(request: NextRequest) {
  const config = getCloudConfig()
  const authenticated =
    !!config && isValidSessionToken(config, request.cookies.get(SESSION_COOKIE)?.value)

  return NextResponse.json(
    { configured: !!config, authenticated },
    { headers: { "Cache-Control": "no-store" } },
  )
}

export async function POST(request: NextRequest) {
  const config = getCloudConfig()
  if (!config) {
    return NextResponse.json({ error: "Cloud library is not configured" }, { status: 503 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Malformed body" }, { status: 400 })
  }

  const parsed = loginSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Malformed body" }, { status: 400 })
  }

  if (!isCorrectPassword(config, parsed.data.password)) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 })
  }

  const response = NextResponse.json({ authenticated: true })
  response.cookies.set(SESSION_COOKIE, createSessionToken(config), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  })
  return response
}

export async function DELETE() {
  const response = NextResponse.json({ authenticated: false })
  response.cookies.delete(SESSION_COOKIE)
  return response
}
