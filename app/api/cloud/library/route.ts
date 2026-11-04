import { NextResponse, type NextRequest } from "next/server"

import { requireCloudSession } from "@/lib/cloud/guard"
import { getLibrary } from "@/lib/cloud/library-index"

/**
 * The signed-in user's cloud library: every indexed song with signed stream
 * and cover URLs, and a count of uploads not yet indexed.
 */

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const { config, denied } = requireCloudSession(request)
  if (denied) return denied

  try {
    const library = await getLibrary(config)
    return NextResponse.json(library, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    console.error("Cloud library listing failed:", error)
    return NextResponse.json({ error: "Could not read the cloud library" }, { status: 502 })
  }
}
