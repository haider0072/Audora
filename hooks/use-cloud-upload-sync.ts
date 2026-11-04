"use client"

import { useEffect } from "react"

import { cloudUploads } from "@/lib/cloud/upload-queue"

/**
 * Keep the cloud listing in step with uploads, and the page open while they
 * run. Renders nothing and holds no state, so the shell calling it does not
 * re-render on upload progress.
 *
 * New uploads join the library as the listing is refreshed — each refresh
 * indexes what arrived since the last — so a long batch refreshes every
 * `REFRESH_EVERY_MS` while it runs and once more when it ends, rather than
 * after every file.
 */

const REFRESH_EVERY_MS = 15_000

export function useCloudUploadSync(refreshLibrary: () => void): void {
  useEffect(() => {
    /** Uploads the listing has been refreshed for. */
    let reflected = cloudUploads.getSnapshot().uploaded
    let refreshedAt = 0
    let timer: ReturnType<typeof setTimeout> | undefined

    const refresh = () => {
      clearTimeout(timer)
      timer = undefined
      reflected = cloudUploads.getSnapshot().uploaded
      refreshedAt = Date.now()
      refreshLibrary()
    }

    const unsubscribe = cloudUploads.subscribe(() => {
      const { uploaded, active } = cloudUploads.getSnapshot()
      // A cleared batch starts counting again.
      if (uploaded < reflected) reflected = uploaded
      if (uploaded === reflected) return
      if (!active) return refresh()
      timer ??= setTimeout(refresh, Math.max(0, refreshedAt + REFRESH_EVERY_MS - Date.now()))
    })

    return () => {
      unsubscribe()
      clearTimeout(timer)
    }
  }, [refreshLibrary])

  // Closing the tab mid-batch would drop every file still going.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!cloudUploads.getSnapshot().active) return
      event.preventDefault()
      // Browsers that predate `preventDefault` here only ask when this is set.
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [])
}
