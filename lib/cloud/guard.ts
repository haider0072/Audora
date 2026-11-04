import { NextResponse, type NextRequest } from "next/server"

import { getCloudConfig, type CloudConfig } from "./config"
import { SESSION_COOKIE, isValidSessionToken } from "./session"

/**
 * Shared gate for every cloud route. Server only.
 *
 * Resolves to the config when the request carries a valid session, or to the
 * response the route should return instead: 503 when the deployment has no
 * cloud library at all, 401 when it does but the caller is not signed in.
 */
export function requireCloudSession(
  request: NextRequest,
): { config: CloudConfig; denied?: never } | { config?: never; denied: NextResponse } {
  const config = getCloudConfig()
  if (!config) {
    return {
      denied: NextResponse.json({ error: "Cloud library is not configured" }, { status: 503 }),
    }
  }

  if (!isValidSessionToken(config, request.cookies.get(SESSION_COOKIE)?.value)) {
    return { denied: NextResponse.json({ error: "Not signed in" }, { status: 401 }) }
  }

  return { config }
}
