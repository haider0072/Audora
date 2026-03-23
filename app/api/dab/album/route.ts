import { NextRequest, NextResponse } from "next/server"
import { getSession, clearSession, getCookieHeader } from "../auth/route"

const DAB_API = "https://dab.yeet.su/api"
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
const FETCH_TIMEOUT = 30000

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const albumId = searchParams.get("albumId")

  if (!albumId) {
    return NextResponse.json(
      { error: "albumId is required" },
      { status: 400 }
    )
  }

  let session = await getSession()
  if (!session) {
    return NextResponse.json(
      { album: null, authenticated: false },
      { status: 200 }
    )
  }

  try {
    const params = new URLSearchParams({ albumId })
    let res = await fetch(`${DAB_API}/album?${params}`, {
      headers: {
        "User-Agent": USER_AGENT,
        Cookie: getCookieHeader(),
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    })

    // Re-auth on 401
    if (res.status === 401) {
      clearSession()
      session = await getSession()
      if (!session) {
        return NextResponse.json(
          { album: null, authenticated: false },
          { status: 200 }
        )
      }
      res = await fetch(`${DAB_API}/album?${params}`, {
        headers: {
          "User-Agent": USER_AGENT,
          Cookie: `session=${session}`,
        },
      })
    }

    if (!res.ok) {
      console.error("DAB album error:", res.status)
      return NextResponse.json(
        { error: "Album fetch failed" },
        { status: 502 }
      )
    }

    const data = await res.json()
    return NextResponse.json({ ...data, authenticated: true })
  } catch (error) {
    console.error("DAB album route error:", error)
    return NextResponse.json(
      { error: "Album request failed" },
      { status: 500 }
    )
  }
}
