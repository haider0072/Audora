import { NextRequest, NextResponse } from "next/server"
import { getSession, clearSession, getCookieHeader } from "../auth/route"

const DAB_API = "https://dab.yeet.su/api"
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
const FETCH_TIMEOUT = 30000

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const artistId = searchParams.get("artistId")

  if (!artistId) {
    return NextResponse.json(
      { error: "artistId is required" },
      { status: 400 }
    )
  }

  let session = await getSession()
  if (!session) {
    return NextResponse.json(
      { artist: null, albums: null, authenticated: false },
      { status: 200 }
    )
  }

  try {
    const params = new URLSearchParams({ artistId })
    let res = await fetch(`${DAB_API}/discography?${params}`, {
      headers: {
        "User-Agent": USER_AGENT,
        Cookie: getCookieHeader(),
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    })

    if (res.status === 401) {
      clearSession()
      session = await getSession()
      if (!session) {
        return NextResponse.json(
          { artist: null, albums: null, authenticated: false },
          { status: 200 }
        )
      }
      res = await fetch(`${DAB_API}/discography?${params}`, {
        headers: {
          "User-Agent": USER_AGENT,
          Cookie: `session=${session}`,
        },
      })
    }

    if (!res.ok) {
      console.error("DAB discography error:", res.status)
      return NextResponse.json(
        { error: "Discography fetch failed" },
        { status: 502 }
      )
    }

    const data = await res.json()
    return NextResponse.json({ ...data, authenticated: true })
  } catch (error) {
    console.error("DAB discography route error:", error)
    return NextResponse.json(
      { error: "Discography request failed" },
      { status: 500 }
    )
  }
}
