import { NextRequest, NextResponse } from "next/server"
import { getSession, clearSession, getCookieHeader } from "../auth/route"

const DAB_API = "https://dab.yeet.su/api"
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

// Rate limiting: track request timestamps
const requestTimestamps: number[] = []
const RATE_LIMIT = 30
const RATE_WINDOW = 60 * 1000 // 1 minute

function checkRateLimit(): { allowed: boolean; retryAfter?: number } {
  const now = Date.now()
  // Clean old timestamps
  while (requestTimestamps.length > 0 && now - requestTimestamps[0] > RATE_WINDOW) {
    requestTimestamps.shift()
  }
  if (requestTimestamps.length >= RATE_LIMIT) {
    const oldestInWindow = requestTimestamps[0]
    const retryAfter = Math.ceil((oldestInWindow + RATE_WINDOW - now) / 1000)
    return { allowed: false, retryAfter }
  }
  requestTimestamps.push(now)
  return { allowed: true }
}

const FETCH_TIMEOUT = 30000 // 30s — DAB search can be slow

async function dabFetch(path: string): Promise<Response> {
  return fetch(`${DAB_API}${path}`, {
    headers: {
      "User-Agent": USER_AGENT,
      Cookie: getCookieHeader(),
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  })
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const q = searchParams.get("q")
  const type = searchParams.get("type") || "track"
  const limit = searchParams.get("limit") || "20"

  if (!q) {
    return NextResponse.json(
      { error: "q (search query) is required" },
      { status: 400 }
    )
  }

  // Check rate limit
  const rateCheck = checkRateLimit()
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: "rate_limited", retryAfter: rateCheck.retryAfter },
      { status: 429 }
    )
  }

  // Get session
  let session = await getSession()
  if (!session) {
    return NextResponse.json(
      { results: null, authenticated: false },
      { status: 200 }
    )
  }

  try {
    // Only send q and limit — DAB API returns 504 when type param is included
    const params = new URLSearchParams({ q, limit })
    let res = await dabFetch(`/search?${params}`)

    // If 401, try re-auth once
    if (res.status === 401) {
      clearSession()
      session = await getSession()
      if (!session) {
        return NextResponse.json(
          { results: null, authenticated: false },
          { status: 200 }
        )
      }
      res = await dabFetch(`/search?${params}`)
    }

    if (!res.ok) {
      const errorText = await res.text().catch(() => "")
      console.error("DAB search error:", res.status, errorText)
      return NextResponse.json(
        { error: "Search failed", status: res.status, authenticated: true },
        { status: 502 }
      )
    }

    const data = await res.json()
    return NextResponse.json({ ...data, authenticated: true })
  } catch (error) {
    console.error("DAB search route error:", error)
    return NextResponse.json(
      { error: "Search request failed" },
      { status: 500 }
    )
  }
}
