import { NextResponse, type NextRequest } from "next/server"

import { requireCloudMutation } from "@/lib/cloud/guard"
import { indexPending } from "@/lib/cloud/library-index"

/**
 * Read tags and covers for uploads not yet in the index. Each call does a
 * bounded slice of the work and reports what remains; the client repeats
 * the call until nothing does.
 */

export const dynamic = "force-dynamic"

/**
 * In-flight work is abandoned at `INDEX_ABORT_AFTER_MS` (35 s); the save that
 * follows is one read and one write of at most 20 s each. 90 s covers both.
 */
export const maxDuration = 90

export async function POST(request: NextRequest) {
  const { config, denied } = await requireCloudMutation(request)
  if (denied) return denied

  try {
    return NextResponse.json(await indexPending(config))
  } catch (error) {
    console.error("Cloud library indexing failed:", error)
    return NextResponse.json({ error: "Could not index the cloud library" }, { status: 502 })
  }
}
