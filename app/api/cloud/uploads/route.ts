import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { requireCloudMutation } from "@/lib/cloud/guard"
import { MAX_UPLOAD_BYTES, checkUploadName } from "@/lib/cloud/upload-rules"
import { planUpload } from "@/lib/cloud/uploads"

/**
 * Sign the upload of one file to the cloud library. The browser asks just
 * before it starts each file, then sends the bytes straight to R2.
 */

export const dynamic = "force-dynamic"

const uploadSchema = z
  .object({
    name: z.string().min(1).max(1024),
    size: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  })
  .strict()

const NO_STORE = { "Cache-Control": "no-store" }

export async function POST(request: NextRequest) {
  const { config, denied } = await requireCloudMutation(request)
  if (denied) return denied

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Malformed body" }, { status: 400 })
  }
  const parsed = uploadSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Malformed body" }, { status: 400 })
  }
  const name = checkUploadName(parsed.data.name)
  if (!name.ok) return NextResponse.json({ error: name.reason }, { status: 400 })

  try {
    return NextResponse.json(await planUpload(config, name.name, parsed.data.size), { headers: NO_STORE })
  } catch (error) {
    console.error("Could not plan a cloud upload:", error)
    return NextResponse.json({ error: "Could not reach the cloud library" }, { status: 502 })
  }
}
