import { NextResponse, type NextRequest } from "next/server"

import { requireCloudSession } from "@/lib/cloud/guard"
import { indexPending } from "@/lib/cloud/library-index"

/**
 * Read tags and covers for uploads not yet in the index. Each call does a
 * bounded slice of the work and reports what remains; the client repeats
 * the call until nothing does.
 */

export const dynamic = "force-dynamic"

/** Headroom over the indexing budget for the final index write. */
export const maxDuration = 60

export async function POST(request: NextRequest) {
  const { config, denied } = requireCloudSession(request)
  if (denied) return denied

  try {
    return NextResponse.json(await indexPending(config))
  } catch (error) {
    console.error("Cloud library indexing failed:", error)
    return NextResponse.json({ error: "Could not index the cloud library" }, { status: 502 })
  }
}
