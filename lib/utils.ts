import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format seconds into MM:SS display string
 */
export function formatTime(time: number): string {
  if (isNaN(time) || time < 0) return "0:00"
  const minutes = Math.floor(time / 60)
  const seconds = Math.floor(time % 60)
  return `${minutes}:${seconds.toString().padStart(2, "0")}`
}

/** A long stretch of music, such as an album or a whole library: "62h 13m", or "42 min" under an hour. */
export function formatTotalDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m} min`
}

/** "1 song", "12 songs": a count with its noun, plural unless the count is one. */
export function formatCount(count: number, noun: string): string {
  return `${count} ${count === 1 ? noun : `${noun}s`}`
}

/** Facts about something on one line, "2019 · 12 songs · 48 min", leaving out the ones it lacks. */
export function formatDetails(...parts: Array<string | number | false | null | undefined>): string {
  return parts.filter((part) => part !== undefined && part !== null && part !== false && part !== "").join(" · ")
}

const compactNumber = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 })

/** A large count, shortened: "12.3M", "4.5K", "950". */
export function formatCompact(count: number): string {
  return compactNumber.format(count)
}

/**
 * Wait for an audio element to fire "canplay", with a timeout fallback.
 * Rejects on error or timeout to prevent infinite UI hang.
 */
export function waitForCanPlay(
  audio: HTMLAudioElement,
  timeoutMs = 8000,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const onCanPlay = () => {
      audio.removeEventListener("canplay", onCanPlay)
      audio.removeEventListener("error", onError)
      clearTimeout(timer)
      resolve()
    }
    const onError = (e: Event) => {
      audio.removeEventListener("canplay", onCanPlay)
      audio.removeEventListener("error", onError)
      clearTimeout(timer)
      reject(new Error(`Failed to load audio: ${(e.target as HTMLAudioElement)?.error?.message || "Unknown error"}`))
    }
    audio.addEventListener("canplay", onCanPlay)
    audio.addEventListener("error", onError)

    const timer = setTimeout(() => {
      audio.removeEventListener("canplay", onCanPlay)
      audio.removeEventListener("error", onError)
      reject(new Error("Audio load timed out"))
    }, timeoutMs)
  })
}
