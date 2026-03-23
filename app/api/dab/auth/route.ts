import { NextRequest, NextResponse } from "next/server"

const DAB_API = "https://dab.yeet.su/api"
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

// In-memory session cache (server-side only)
let cachedSession: string | null = null
let cachedVisitorId: string | null = null
let sessionCreatedAt = 0
let cachedEmail: string | null = null
let cachedPassword: string | null = null

const SESSION_MAX_AGE = 23 * 60 * 60 * 1000 // 23 hours

function extractCookies(res: Response): { session: string | null; visitorId: string | null } {
  let session: string | null = null
  let visitorId: string | null = null

  // getSetCookie() returns all Set-Cookie headers as an array
  const setCookies = res.headers.getSetCookie?.() || []
  for (const cookie of setCookies) {
    const sessionMatch = cookie.match(/session=([^;]+)/)
    if (sessionMatch) session = sessionMatch[1]
    const visitorMatch = cookie.match(/visitor_id=([^;]+)/)
    if (visitorMatch) visitorId = visitorMatch[1]
  }

  // Fallback: single set-cookie header (some runtimes merge them)
  if (!session || !visitorId) {
    const raw = res.headers.get("set-cookie") || ""
    if (!session) {
      const m = raw.match(/session=([^;,]+)/)
      if (m) session = m[1]
    }
    if (!visitorId) {
      const m = raw.match(/visitor_id=([^;,]+)/)
      if (m) visitorId = m[1]
    }
  }

  return { session, visitorId }
}

async function authenticate(
  email: string,
  password: string
): Promise<boolean> {
  try {
    const res = await fetch(`${DAB_API}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({ email, password }),
    })

    if (!res.ok) {
      console.error("DAB auth error:", res.status)
      return false
    }

    const { session, visitorId } = extractCookies(res)

    if (session) {
      cachedSession = session
      sessionCreatedAt = Date.now()
    }
    if (visitorId) {
      cachedVisitorId = visitorId
    }

    return !!cachedSession
  } catch (error) {
    console.error("DAB auth fetch error:", error)
    return false
  }
}

export async function getSession(): Promise<string | null> {
  // Check if existing session is still valid
  if (cachedSession && Date.now() - sessionCreatedAt < SESSION_MAX_AGE) {
    return cachedSession
  }

  // Try re-auth with cached or env credentials
  const email = cachedEmail || process.env.DAB_EMAIL || ""
  const password = cachedPassword || process.env.DAB_PASSWORD || ""

  if (!email || !password) return null

  const success = await authenticate(email, password)
  if (success) {
    cachedEmail = email
    cachedPassword = password
  }
  return cachedSession
}

// Returns the full Cookie header string with both session and visitor_id
export function getCookieHeader(): string {
  const parts: string[] = []
  if (cachedSession) parts.push(`session=${cachedSession}`)
  if (cachedVisitorId) parts.push(`visitor_id=${cachedVisitorId}`)
  return parts.join("; ")
}

export function clearSession() {
  cachedSession = null
  sessionCreatedAt = 0
}

// GET: Check if authenticated
export async function GET() {
  const session = await getSession()
  return NextResponse.json({
    authenticated: !!session,
    hasCredentials: !!(
      (cachedEmail || process.env.DAB_EMAIL) &&
      (cachedPassword || process.env.DAB_PASSWORD)
    ),
  })
}

// POST: Login with email/password
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json(
        { error: "email and password are required" },
        { status: 400 }
      )
    }

    const success = await authenticate(email, password)
    if (!success) {
      return NextResponse.json(
        { authenticated: false, error: "Invalid credentials" },
        { status: 401 }
      )
    }

    cachedEmail = email
    cachedPassword = password

    return NextResponse.json({ authenticated: true })
  } catch (error) {
    console.error("DAB auth route error:", error)
    return NextResponse.json(
      { error: "Authentication failed" },
      { status: 500 }
    )
  }
}
