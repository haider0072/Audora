import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { getCloudConfig } from "@/lib/cloud/config"
import { notConfigured, rejectCrossOrigin, requireCloudSession, verifiedSession } from "@/lib/cloud/guard"
import { LoginThrottleStore, checkLogin, clientAddressOf, clientIdFor } from "@/lib/cloud/login-throttle"
import { readJsonBody } from "@/lib/cloud/request-body"
import {
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  createSessionToken,
  isCorrectPassword,
  shouldRenewSession,
  type SessionClaims,
} from "@/lib/cloud/session"
import { currentSessionEpoch, revokeAllSessions } from "@/lib/cloud/session-epoch"

/**
 * Sign in to, check, and sign out of the cloud library.
 *
 * GET reports whether the deployment has a cloud library and whether this
 * browser is signed in, renewing a session that is in use. POST exchanges
 * the password for a session cookie, behind the login throttle. DELETE
 * signs this browser out, or with `?scope=all` every device.
 */

export const dynamic = "force-dynamic"

/** Generous for a passphrase, small enough that the body is never a payload. */
const MAX_PASSWORD_LENGTH = 512

const loginSchema = z.object({
  password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
})

const NO_STORE = { "Cache-Control": "no-store" }

function unavailable(error: unknown, what: string): NextResponse {
  console.error(`${what} failed:`, error)
  return NextResponse.json({ error: "Cloud library is unavailable right now" }, { status: 503, headers: NO_STORE })
}

function tooManyAttempts(retryAfterMs: number): NextResponse {
  const seconds = Math.ceil(retryAfterMs / 1000)
  const minutes = Math.ceil(seconds / 60)
  return NextResponse.json(
    { error: `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` },
    { status: 429, headers: { ...NO_STORE, "Retry-After": String(seconds) } },
  )
}

export async function GET(request: NextRequest) {
  const config = getCloudConfig()
  if (!config) return NextResponse.json({ configured: false, authenticated: false }, { headers: NO_STORE })

  let claims: SessionClaims | null
  try {
    claims = await verifiedSession(config, request)
  } catch (error) {
    return unavailable(error, "Session check")
  }

  const response = NextResponse.json({ configured: true, authenticated: !!claims }, { headers: NO_STORE })
  if (claims && shouldRenewSession(claims)) {
    response.cookies.set(SESSION_COOKIE, createSessionToken(config, claims.epoch), SESSION_COOKIE_OPTIONS)
  }
  return response
}

export async function POST(request: NextRequest) {
  const crossOrigin = rejectCrossOrigin(request)
  if (crossOrigin) return crossOrigin

  const config = getCloudConfig()
  if (!config) return notConfigured()

  const body = await readJsonBody(request, loginSchema)
  if (body.denied) return body.denied

  const clientId = clientIdFor(config, clientAddressOf(request.headers))
  const throttle = new LoginThrottleStore(config)

  try {
    const state = await throttle.read()
    const verdict = checkLogin(state, clientId, Date.now())
    if (!verdict.allowed) return tooManyAttempts(verdict.retryAfterMs)

    if (!isCorrectPassword(config, body.data.password)) {
      await throttle.recordFailure(clientId)
      return NextResponse.json({ error: "Wrong password" }, { status: 401, headers: NO_STORE })
    }

    if (state.clients[clientId]) await throttle.recordSuccess(clientId)
    const epoch = await currentSessionEpoch(config)

    const response = NextResponse.json({ authenticated: true }, { headers: NO_STORE })
    response.cookies.set(SESSION_COOKIE, createSessionToken(config, epoch), SESSION_COOKIE_OPTIONS)
    return response
  } catch (error) {
    // Failing closed: a throttle that cannot be read or updated must not
    // turn into unlimited guesses.
    return unavailable(error, "Sign-in")
  }
}

export async function DELETE(request: NextRequest) {
  const crossOrigin = rejectCrossOrigin(request)
  if (crossOrigin) return crossOrigin

  if (request.nextUrl.searchParams.get("scope") === "all") {
    // Only a signed-in device may sign every device out; otherwise anyone
    // could end the owner's sessions at will.
    const gate = await requireCloudSession(request)
    if (gate.denied) return gate.denied
    try {
      await revokeAllSessions(gate.config)
    } catch (error) {
      return unavailable(error, "Signing out everywhere")
    }
  }

  const response = NextResponse.json({ authenticated: false }, { headers: NO_STORE })
  // A __Host- cookie is only replaced by one with the same Secure and Path
  // attributes, so clearing it means setting it again, expired.
  response.cookies.set(SESSION_COOKIE, "", { ...SESSION_COOKIE_OPTIONS, maxAge: 0 })
  return response
}
