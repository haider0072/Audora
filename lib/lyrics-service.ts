export interface LyricLine {
  time: number // time in seconds
  text: string
}

export interface LyricsData {
  synced: LyricLine[] | null
  plain: string | null
}

export class LyricsService {
  private static readonly API_BASE_URL = "https://lrclib.net/api"

  /**
   * Fetches lyrics from Lrclib, matching by query and duration.
   * @param artist The artist of the song.
   * @param title The title of the song.
   * @param duration The duration of the song in seconds.
   * @returns A promise that resolves to the lyrics data or null.
   */
  public static async fetchLyrics(artist: string, title: string, duration: number): Promise<LyricsData | null> {
    if (!artist || !title || !duration) {
      return null
    }

    const query = `${title} ${artist}`
    const url = `${this.API_BASE_URL}/search?q=${encodeURIComponent(query)}`

    try {
      const response = await fetch(url)
      if (!response.ok) {
        console.error(`Failed to fetch lyrics: ${response.statusText}`)
        return null
      }

      const songs = await response.json()
      if (!Array.isArray(songs) || songs.length === 0) {
        return null
      }

      // 1. Filter songs by duration proximity (within 5 seconds) and availability of lyrics
      const matchedSongs = songs.filter(
        (song: any) => Math.abs(song.duration - duration) <= 5 && (song.syncedLyrics || song.plainLyrics),
      )

      if (matchedSongs.length === 0) {
        return null
      }

      // 2. Sort to prioritize songs with synced lyrics
      matchedSongs.sort((a: any, b: any) => {
        if (a.syncedLyrics && !b.syncedLyrics) return -1
        if (!a.syncedLyrics && b.syncedLyrics) return 1
        return 0
      })

      const bestMatch = matchedSongs[0]

      const synced = bestMatch.syncedLyrics ? this.parseLRC(bestMatch.syncedLyrics) : null
      const plain = bestMatch.plainLyrics || null

      return { synced, plain }
    } catch (error) {
      console.error("Error fetching or parsing lyrics:", error)
      // Re-throw the error to be caught by the caller
      throw new Error("Could not connect to the lyrics service.")
    }
  }

  /**
   * Parses an LRC format string into an array of LyricLine objects.
   * @param lrcText The LRC string.
   * @returns An array of LyricLine objects.
   */
  private static parseLRC(lrcText: string): LyricLine[] {
    return lrcText
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => {
        const match = line.match(/^\[(\d{2}):(\d{2}(?:\.\d{1,3})?)\](.*)/)
        if (match) {
          const minutes = Number.parseInt(match[1], 10)
          const seconds = Number.parseFloat(match[2])
          const time = minutes * 60 + seconds // Time in seconds
          let text = match[3].trim()
          if (text === "") {
            text = "♪"
          }
          return { time, text }
        }
        return null
      })
      .filter((line): line is LyricLine => line !== null)
  }
}
