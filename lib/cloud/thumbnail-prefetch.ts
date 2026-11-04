/**
 * Fetch every cloud thumbnail into the browser's HTTP cache in the
 * background, so a list row never waits on R2 for its cover. Client only.
 *
 * Thumbnails are a few kilobytes each and served `immutable`, so the whole
 * library's worth is a few megabytes fetched once; after that every row
 * draws from disk. Requests go out at low priority and a few at a time, so
 * the song playing and anything on screen always come first.
 */

const CONCURRENCY = 4

/** Thumbnails already fetched by this page. */
const fetched = new Set<string>()

interface NetworkInformationLike {
  saveData?: boolean
}

function prefersSavingData(): boolean {
  const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection
  return connection?.saveData === true
}

export async function prefetchThumbnails(urls: string[], signal: AbortSignal): Promise<void> {
  if (typeof window === "undefined" || prefersSavingData()) return

  const queue = urls.filter((url) => !fetched.has(url))
  let failures = 0

  const worker = async () => {
    while (queue.length > 0 && !signal.aborted) {
      const url = queue.shift()!
      try {
        const response = await fetch(url, { priority: "low", signal })
        // Reading the body is what lets the cache keep the whole response.
        await response.blob()
        if (response.ok) fetched.add(url)
        else failures++
      } catch (error) {
        if (signal.aborted) return
        failures++
        if (failures === 1) console.warn("Thumbnail prefetch failed; covers will load on demand:", error)
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  if (failures > 1) console.warn(`${failures} thumbnails could not be prefetched; they will load on demand.`)
}
