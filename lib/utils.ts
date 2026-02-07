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
