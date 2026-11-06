import { downloadTrack } from "@/lib/download-file"
import type { TidalTrack } from "@/lib/tidal-types"

import { SIGNED_OUT_MESSAGE, readError } from "./response-error"
import type { CloudImportResult } from "./types"

/**
 * Have the server save an online track straight to the cloud library. Client
 * only.
 *
 * Resolves once the song is stored, or found already there. The server does
 * the fetching, tagging and storing, so the request stays open for as long
 * as that takes; aborting `signal` stops the save there too.
 */
export async function saveTrackToCloud(track: TidalTrack, signal: AbortSignal): Promise<CloudImportResult> {
  const response = await fetch("/api/cloud/imports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(downloadTrack(track)),
    signal,
  })
  if (!response.ok) throw new Error(response.status === 401 ? SIGNED_OUT_MESSAGE : await readError(response))
  return (await response.json()) as CloudImportResult
}
