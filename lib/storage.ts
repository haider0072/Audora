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
    fileName: string
    fileLastModified: number
    fileType: string
  }>
  equalizerBands: Array<{
    frequency: number
    gain: number
    label: string
  }>
  playerSettings: {
    volume: number
    shuffleMode: boolean
    viewMode: "grouped" | "list"
    showEqualizer: boolean
    showLyrics?: boolean
  }
  currentSongId?: string
}

export class StorageManager {
  private static readonly STORAGE_KEY = "enhanced-music-player"
  private static readonly VERSION = "1.1" // Version bump for safety

  static saveData(data: Partial<StorageData>): void {
    try {
      const existingData = this.loadData()
      const updatedData = {
        ...existingData,
        ...data,
        version: this.VERSION,
        lastSaved: Date.now(),
      }
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(updatedData))
    } catch (error) {
      console.error("Failed to save data to localStorage:", error)
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
      playerSettings: {
        volume: 80,
        shuffleMode: false,
        viewMode: "grouped",
        showEqualizer: false,
        showLyrics: false,
      },
    }
  }
}
