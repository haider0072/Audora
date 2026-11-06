"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import type { Song } from "@/lib/song"
import { clearLibrarySnapshot, readLibrarySnapshot, saveLibrarySnapshot } from "@/lib/cloud/library-snapshot"
import { mergeCloudLibrary } from "@/lib/cloud/merge"
import { preconnect } from "@/lib/cloud/preconnect"
import { readError } from "@/lib/cloud/response-error"
import { prefetchThumbnails } from "@/lib/cloud/thumbnail-prefetch"
import { cloudUploads } from "@/lib/cloud/upload-queue"
import type { CloudIndexResponse, CloudLibraryResponse, CloudSong } from "@/lib/cloud/types"

/**
 * The cloud library on this device: sign-in state, the song list, and keeping
 * that list folded into the player's own.
 *
 * Signed URLs in the listing stay valid for days, but this is a player left
 * open for weeks, so the listing is refetched whenever the tab comes back into
 * view after `REFRESH_AFTER_MS`.
 */

export type CloudLibraryStatus =
  /** This deployment has no cloud library configured. */
  | "unavailable"
  | "signed-out"
  | "loading"
  | "ready"
  | "error"

const REFRESH_AFTER_MS = 12 * 60 * 60 * 1000

export interface UseCloudLibraryOptions {
  /** False until the local library has been restored; merging earlier would be overwritten. */
  isReady: boolean
  /** Local list length, so songs added later are re-checked against the cloud. */
  songCount: number
  setSongs: (update: (previous: Song[]) => Song[]) => void
}

export interface UseCloudLibraryReturn {
  status: CloudLibraryStatus
  songCount: number
  /** Uploads not yet indexed. Non-zero while indexing runs. */
  pending: number
  error: string | null
  signIn: (password: string) => Promise<boolean>
  /** Sign this device out, or with `everywhere` every device signed in. */
  signOut: (options?: { everywhere?: boolean }) => Promise<void>
  /** Fetch the listing again — or, while one is in flight, once more after it. */
  refresh: () => void
  /**
   * Send files up to the cloud library, while this device is signed in to it.
   * Otherwise nothing is sent: the files stay on this device, and Sync now in
   * the cloud panel sends them once it is signed in.
   */
  upload: (files: Iterable<File>) => void
}

export function useCloudLibrary({ isReady, songCount, setSongs }: UseCloudLibraryOptions): UseCloudLibraryReturn {
  const [status, setStatus] = useState<CloudLibraryStatus>("loading")
  const [cloudSongs, setCloudSongs] = useState<CloudSong[]>([])
  const [pending, setPending] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const loadedAtRef = useRef(0)
  /** Bumped by every load and by sign-out, so a superseded load stops applying results. */
  const generationRef = useRef(0)
  /**
   * Set once the server has answered for the library itself — a listing, or
   * that there is none for this device. A snapshot arriving later is stale.
   */
  const settledRef = useRef(false)
  /** Loads running now, and whether the library changed after they started. */
  const activeLoadsRef = useRef(0)
  const staleRef = useRef(false)

  // Show the last listing this device saw while the fresh one is fetched.
  useEffect(() => {
    void readLibrarySnapshot().then((snapshot) => {
      if (!snapshot || settledRef.current) return
      setCloudSongs(snapshot.songs)
      setPending(snapshot.pending)
      setStatus("ready")
    })
  }, [])

  const load = useCallback(async function runLoad(): Promise<void> {
    const generation = ++generationRef.current
    const isCurrent = () => generation === generationRef.current

    setStatus((previous) => (previous === "ready" ? previous : "loading"))
    setError(null)
    activeLoadsRef.current++

    try {
      const session = await fetch("/api/cloud/session", { cache: "no-store" })
      if (!session.ok) throw new Error(await readError(session))
      const { configured, authenticated } = (await session.json()) as {
        configured: boolean
        authenticated: boolean
      }
      if (!isCurrent()) return
      if (!configured || !authenticated) settledRef.current = true
      if (!configured) return setStatus("unavailable")
      if (!authenticated) {
        setCloudSongs([])
        setPending(0)
        void clearLibrarySnapshot()
        return setStatus("signed-out")
      }

      // Index whatever has been uploaded since the last pass, showing the
      // library as it grows. A pass that makes no progress ends the loop: the
      // remaining files are unreadable, and retrying them in a tight loop
      // would only spin.
      for (;;) {
        const response = await fetch("/api/cloud/library", { cache: "no-store" })
        if (!response.ok) throw new Error(await readError(response))
        const library = (await response.json()) as CloudLibraryResponse
        if (!isCurrent()) return

        settledRef.current = true
        setCloudSongs(library.songs)
        setPending(library.pending)
        setStatus("ready")
        loadedAtRef.current = Date.now()
        void saveLibrarySnapshot(library)

        // Songs from an older indexer are already listed and playing; they
        // are brought up to date in the same loop, just without the badge.
        if (library.pending + library.outdated === 0) return

        const indexing = await fetch("/api/cloud/library/index", { method: "POST" })
        if (!indexing.ok) throw new Error(await readError(indexing))
        const result = (await indexing.json()) as CloudIndexResponse
        if (!isCurrent()) return
        if (result.indexed === 0) {
          setPending(result.pending)
          return
        }
      }
    } catch (cause) {
      if (!isCurrent()) return
      console.error("Cloud library load failed:", cause)
      setError(cause instanceof Error ? cause.message : "Could not reach the cloud library")
      setStatus((previous) => (previous === "ready" ? previous : "error"))
    } finally {
      activeLoadsRef.current--
      if (staleRef.current && activeLoadsRef.current === 0) {
        staleRef.current = false
        void runLoad()
      }
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return
      if (Date.now() - loadedAtRef.current < REFRESH_AFTER_MS) return
      void load()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
  }, [load])

  // Warm the connection and every list cover once the library is known, so
  // neither the first play nor scrolling waits on R2.
  useEffect(() => {
    if (cloudSongs.length === 0) return
    preconnect(new URL(cloudSongs[0].streamUrl).origin)

    const controller = new AbortController()
    const thumbnails = cloudSongs.flatMap((song) => (song.thumbUrl ? [song.thumbUrl] : []))
    void prefetchThumbnails(thumbnails, controller.signal)
    return () => controller.abort()
  }, [cloudSongs])

  // Fold the cloud list into the player's. `mergeCloudLibrary` returns the
  // previous array when nothing changes, so re-running on every local change
  // is free and cannot loop.
  useEffect(() => {
    if (!isReady) return
    setSongs((previous) => mergeCloudLibrary(previous, cloudSongs))
  }, [isReady, songCount, cloudSongs, setSongs])

  const signIn = useCallback(
    async (password: string) => {
      const response = await fetch("/api/cloud/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      })
      if (!response.ok) {
        setError(response.status === 401 ? "Wrong password" : await readError(response))
        return false
      }
      await load()
      return true
    },
    [load],
  )

  const signOut = useCallback(async ({ everywhere = false }: { everywhere?: boolean } = {}) => {
    generationRef.current++
    settledRef.current = true
    staleRef.current = false
    const response = await fetch(everywhere ? "/api/cloud/session?scope=all" : "/api/cloud/session", {
      method: "DELETE",
    })
    if (!response.ok) {
      setError(await readError(response))
      return
    }
    setCloudSongs([])
    setPending(0)
    setError(null)
    setStatus("signed-out")
    await clearLibrarySnapshot()
  }, [])

  // A refresh while a load runs would cut its indexing loop short only to
  // start it over; folding it into one more pass afterwards loses nothing,
  // since every pass lists the bucket afresh.
  const refresh = useCallback(() => {
    if (activeLoadsRef.current > 0) staleRef.current = true
    else void load()
  }, [load])

  const upload = useCallback(
    (files: Iterable<File>) => {
      if (status === "ready") cloudUploads.add(files)
    },
    [status],
  )

  return { status, songCount: cloudSongs.length, pending, error, signIn, signOut, refresh, upload }
}
