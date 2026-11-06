import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { requireCloudMutation } from "@/lib/cloud/guard"
import { CloudImportError, importTrack } from "@/lib/cloud/imports"
import { readJsonBody } from "@/lib/cloud/request-body"
import type { DownloadTrack } from "@/lib/download-file"

/**
 * Save an online track straight to the cloud library. The app sends one
 * track and waits while this function fetches it from the source, tags it
 * and stores it; nothing is saved on the device.
 */

export const dynamic = "force-dynamic"

/** As long as a download to the device is given: the source can take minutes to prepare a file. */
export const maxDuration = 300

const TEXT = z.string().max(1024)

/** A detail the catalog may leave out, or send as null. */
function detail<T extends z.ZodTypeAny>(schema: T) {
  return schema.nullish().transform((value) => value ?? undefined)
}

const trackSchema: z.ZodType<DownloadTrack, z.ZodTypeDef, unknown> = z
  .object({
    id: z.string().min(1).max(8192),
    title: TEXT,
    artist: TEXT,
    albumTitle: detail(TEXT),
    albumCover: detail(z.string().max(2048)),
    releaseDate: detail(TEXT),
    genre: detail(TEXT),
    trackNumber: detail(z.number().int().nonnegative()),
    discNumber: detail(z.number().int().nonnegative()),
    copyright: detail(TEXT),
    isrc: detail(TEXT),
  })
  .strict()

const NO_STORE = { "Cache-Control": "no-store" }

export async function POST(request: NextRequest) {
  const { config, denied } = await requireCloudMutation(request)
  if (denied) return denied

  const body = await readJsonBody(request, trackSchema)
  if (body.denied) return body.denied

  try {
    return NextResponse.json(await importTrack(config, body.data, request.signal), { headers: NO_STORE })
  } catch (error) {
    if (request.signal.aborted) return NextResponse.json({ error: "Cancelled" }, { status: 499 })
    if (error instanceof CloudImportError) {
      console.warn("Could not save a track to the cloud library:", error)
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("Could not save a track to the cloud library:", error)
    return NextResponse.json({ error: "Could not save the song to the cloud" }, { status: 502 })
  }
}
