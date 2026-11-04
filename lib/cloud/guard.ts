import { NextResponse, type NextRequest } from "next/server"

import { getCloudConfig, type CloudConfig } from "./config"
import { SESSION_COOKIE, readSessionToken, type SessionClaims } from "./session"
import { currentSessionEpoch } from "./session-epoch"

/**
 * Shared gates for the cloud routes. Server only.
 */

export type CloudGate =
  | { config: CloudConfig; claims: SessionClaims; denied?: never }
  | { config?: never; claims?: never; denied: NextResponse }

export function notConfigured(): NextResponse {
  return NextResponse.json({ error: "Cloud library is not configured" }, { status: 503 })
}

/**
 * The session this request carries, if it is valid and not revoked.
 *
 * Throws when the session epoch cannot be read; callers that must answer
 * regardless (the session status check) catch it, the rest let it fail the
 * request rather than guess.
 */
export async function verifiedSession(config: CloudConfig, request: NextRequest): Promise<SessionClaims | null> {
  const claims = readSessionToken(config, request.cookies.get(SESSION_COOKIE)?.value)
  if (!claims) return null
  return claims.epoch === (await currentSessionEpoch(config)) ? claims : null
}

/**
 * Resolves to the config and session when the request carries a valid one,
 * or to the response the route should return instead: 503 when the
 * deployment has no cloud library or the session cannot be checked, 401 when
 * the caller is not signed in.
 */
export async function requireCloudSession(request: NextRequest): Promise<CloudGate> {
  const config = getCloudConfig()
  if (!config) return { denied: notConfigured() }

  let claims: SessionClaims | null
  try {
    claims = await verifiedSession(config, request)
  } catch (error) {
    console.error("Could not check the cloud session:", error)
    return { denied: NextResponse.json({ error: "Cloud library is unavailable" }, { status: 503 }) }
  }
  if (!claims) return { denied: NextResponse.json({ error: "Not signed in" }, { status: 401 }) }

  return { config, claims }
}

/**
 * Refuse a state-changing request that did not come from this app's own
 * pages; null when it did.
 *
 * `SameSite=Strict` already keeps the cookie off cross-site requests, so this
 * is the second lock on the door: it also covers same-site origins (another
 * app on a sibling subdomain) and the login route, which has no cookie to
 * withhold. Browsers send `Sec-Fetch-Site` on every request and `Origin` on
 * every POST and DELETE, so a request with neither is not from a browser
 * page and is refused too.
 */
export function rejectCrossOrigin(request: NextRequest): NextResponse | null {
  const site = request.headers.get("sec-fetch-site")
  if (site === "same-origin") return null

  const origin = request.headers.get("origin")
  if (!site && origin === request.nextUrl.origin) return null

  return NextResponse.json({ error: "Cross-origin request refused" }, { status: 403 })
}

/** `rejectCrossOrigin`, then `requireCloudSession` — the gate for every mutating route. */
export async function requireCloudMutation(request: NextRequest): Promise<CloudGate> {
  const crossOrigin = rejectCrossOrigin(request)
  if (crossOrigin) return { denied: crossOrigin }
  return requireCloudSession(request)
}
