interface StorageData {
  songs: Array<{
    id: string
    title?: string
    artist?: string
    album?: string
    year?: string
    genre?: string
    bitrate?: number
    sampleRate?: number
    duration?: number
    isHiRes?: boolean
    albumArt?: string
    fileSize?: number
    format?: string
    loudnessLUFS?: number
    gainCorrection?: number
    fileName: string
    fileLastModified: number
    fileType: string
  }>
  equalizerBands: Array<{
    frequency: number
    gain: number
    label: string
  }>
  eqPresets: Array<{
    id: string
    name: string
    gains: number[]
    preamp: number
  }>
  activeEqPresetId?: string
  playerSettings: {
    volume: number
    shuffleMode: boolean
    viewMode: "grouped" | "list"
    showEqualizer: boolean
    showLyrics?: boolean
    crossfadeDuration?: number
    /** Loudness normalization to -14 LUFS. Off by default (transparent playback). */
    normalizationEnabled?: boolean
    /** Manual pre-EQ gain in dB. */
    preampDb?: number
  }
  currentSongId?: string
}

/** True for the quota-exceeded DOMException across browsers. */
function isQuotaExceededError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "QuotaExceededError" ||
      error.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      error.code === 22)
  )
}

export class StorageManager {
  private static readonly STORAGE_KEY = "enhanced-music-player"
  private static readonly VERSION = "1.1" // Version bump for safety

  /**
   * localStorage keys of expendable caches, in eviction order. Player state
   * is the critical payload — when the shared ~5MB origin quota fills up,
   * caches are dropped (they rebuild themselves) rather than silently losing
   * the user's playlist/EQ settings.
   */
  private static readonly EVICTABLE_CACHE_KEYS = [
    "music_player_insights_cache",
    "music_player_video_cache",
    "music_player_spotify_cache",
    "audora_dab_cache_v2",
    "audora_tidal_cache_v2",
  ]

  static saveData(data: Partial<StorageData>): void {
    let payload: string
    try {
      const existingData = this.loadData()
      const updatedData = {
        ...existingData,
        ...data,
        version: this.VERSION,
        lastSaved: Date.now(),
      }
      payload = JSON.stringify(updatedData)
    } catch (error) {
      console.error("Failed to serialize data for localStorage:", error)
      return
    }

    try {
      localStorage.setItem(this.STORAGE_KEY, payload)
    } catch (error) {
      if (!isQuotaExceededError(error)) {
        console.error("Failed to save data to localStorage:", error)
        return
      }
      // Quota full: evict caches one by one and retry after each.
      for (const cacheKey of this.EVICTABLE_CACHE_KEYS) {
        try {
          localStorage.removeItem(cacheKey)
        } catch {
          // ignore — key may not exist
        }
        try {
          localStorage.setItem(this.STORAGE_KEY, payload)
          console.warn(`localStorage quota exceeded — evicted "${cacheKey}" to save player state`)
          return
        } catch (retryError) {
          if (!isQuotaExceededError(retryError)) {
            console.error("Failed to save data to localStorage:", retryError)
            return
          }
        }
      }
      console.error("Failed to save player state: localStorage quota exceeded even after evicting caches")
    }
  }

  static loadData(): StorageData {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY)
      if (!stored) return this.getDefaultData()

      const data = JSON.parse(stored)

      if (data.version !== this.VERSION) {
        // Migrate: preserve user data, just update the version stamp
        console.info(`Storage version migrated: ${data.version} → ${this.VERSION}`)
        data.version = this.VERSION
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data))
      }

      return {
        ...this.getDefaultData(),
        ...data,
      }
    } catch (error) {
      console.error("Failed to load data from localStorage:", error)
      return this.getDefaultData()
    }
  }

  static clearData(): void {
    try {
      localStorage.removeItem(this.STORAGE_KEY)
    } catch (error) {
      console.error("Failed to clear localStorage:", error)
    }
  }

  static getDefaultData(): StorageData {
    return {
      songs: [],
      equalizerBands: [
        { frequency: 32, gain: 0, label: "32Hz" },
        { frequency: 64, gain: 0, label: "64Hz" },
        { frequency: 125, gain: 0, label: "125Hz" },
        { frequency: 250, gain: 0, label: "250Hz" },
        { frequency: 500, gain: 0, label: "500Hz" },
        { frequency: 1000, gain: 0, label: "1kHz" },
        { frequency: 2000, gain: 0, label: "2kHz" },
        { frequency: 4000, gain: 0, label: "4kHz" },
        { frequency: 8000, gain: 0, label: "8kHz" },
        { frequency: 16000, gain: 0, label: "16kHz" },
      ],
      eqPresets: [],
      playerSettings: {
        volume: 80,
        shuffleMode: false,
        viewMode: "grouped",
        showEqualizer: false,
        showLyrics: false,
        crossfadeDuration: 0,
        normalizationEnabled: false,
        preampDb: 0,
      },
    }
  }
}
