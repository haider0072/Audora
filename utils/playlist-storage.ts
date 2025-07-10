interface StoredSong {
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
}

interface PlaylistData {
  songs: StoredSong[]
  currentSongId?: string
  lastUpdated: number
  version: string
}

export class PlaylistStorage {
  private static readonly DB_NAME = "enhanced-music-player-db"
  private static readonly DB_VERSION = 1
  private static readonly STORE_NAME = "audio-files"
  private static readonly METADATA_KEY = "playlist-metadata"
  private static readonly VERSION = "1.0"

  private static db: IDBDatabase | null = null

  // Initialize IndexedDB
  static async initDB(): Promise<IDBDatabase> {
    if (this.db) return this.db

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        this.db = request.result
        resolve(request.result)
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          db.createObjectStore(this.STORE_NAME, { keyPath: "id" })
        }
      }
    })
  }

  // Store a song file in IndexedDB
  static async storeSongFile(songId: string, file: File): Promise<void> {
    const db = await this.initDB()
    const transaction = db.transaction([this.STORE_NAME], "readwrite")
    const store = transaction.objectStore(this.STORE_NAME)

    return new Promise((resolve, reject) => {
      const request = store.put({
        id: songId,
        file: file,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        lastModified: file.lastModified,
      })

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  // Retrieve a song file from IndexedDB
  static async getSongFile(songId: string): Promise<File | null> {
    try {
      const db = await this.initDB()
      const transaction = db.transaction([this.STORE_NAME], "readonly")
      const store = transaction.objectStore(this.STORE_NAME)

      return new Promise((resolve, reject) => {
        const request = store.get(songId)

        request.onsuccess = () => {
          const result = request.result
          if (result && result.file) {
            resolve(result.file)
          } else {
            resolve(null)
          }
        }
        request.onerror = () => reject(request.error)
      })
    } catch (error) {
      console.error("Error retrieving song file:", error)
      return null
    }
  }

  // Remove a song file from IndexedDB
  static async removeSongFile(songId: string): Promise<void> {
    try {
      const db = await this.initDB()
      const transaction = db.transaction([this.STORE_NAME], "readwrite")
      const store = transaction.objectStore(this.STORE_NAME)

      return new Promise((resolve, reject) => {
        const request = store.delete(songId)
        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
      })
    } catch (error) {
      console.error("Error removing song file:", error)
    }
  }

  // Save playlist metadata to localStorage
  static savePlaylistMetadata(songs: StoredSong[], currentSongId?: string): void {
    try {
      const playlistData: PlaylistData = {
        songs,
        currentSongId,
        lastUpdated: Date.now(),
        version: this.VERSION,
      }

      localStorage.setItem(this.METADATA_KEY, JSON.stringify(playlistData))
    } catch (error) {
      console.error("Error saving playlist metadata:", error)
    }
  }

  // Load playlist metadata from localStorage
  static loadPlaylistMetadata(): PlaylistData | null {
    try {
      const stored = localStorage.getItem(this.METADATA_KEY)
      if (!stored) return null

      const data = JSON.parse(stored) as PlaylistData

      // Version check
      if (data.version !== this.VERSION) {
        console.log("Playlist version mismatch, clearing old data")
        this.clearPlaylist()
        return null
      }

      return data
    } catch (error) {
      console.error("Error loading playlist metadata:", error)
      return null
    }
  }

  // Store album art separately for better management
  static async storeAlbumArt(songId: string, albumArtUrl: string): Promise<string> {
    try {
      // Convert blob URL to actual blob data for persistent storage
      const response = await fetch(albumArtUrl)
      const blob = await response.blob()

      const db = await this.initDB()
      const transaction = db.transaction([this.STORE_NAME], "readwrite")
      const store = transaction.objectStore(this.STORE_NAME)

      return new Promise((resolve, reject) => {
        const albumArtKey = `${songId}_albumart`
        const request = store.put({
          id: albumArtKey,
          type: "albumart",
          songId: songId,
          blob: blob,
          mimeType: blob.type,
          size: blob.size,
          storedAt: Date.now(),
        })

        request.onsuccess = () => resolve(albumArtKey)
        request.onerror = () => reject(request.error)
      })
    } catch (error) {
      console.error("Error storing album art:", error)
      throw error
    }
  }

  // Retrieve album art and create a new blob URL
  static async getAlbumArt(songId: string): Promise<string | null> {
    try {
      const db = await this.initDB()
      const transaction = db.transaction([this.STORE_NAME], "readonly")
      const store = transaction.objectStore(this.STORE_NAME)

      return new Promise((resolve, reject) => {
        const albumArtKey = `${songId}_albumart`
        const request = store.get(albumArtKey)

        request.onsuccess = () => {
          const result = request.result
          if (result && result.blob) {
            // Create a new blob URL from stored data
            const url = URL.createObjectURL(result.blob)
            resolve(url)
          } else {
            resolve(null)
          }
        }
        request.onerror = () => reject(request.error)
      })
    } catch (error) {
      console.error("Error retrieving album art:", error)
      return null
    }
  }

  // Remove album art for a specific song
  static async removeAlbumArt(songId: string): Promise<void> {
    try {
      const db = await this.initDB()
      const transaction = db.transaction([this.STORE_NAME], "readwrite")
      const store = transaction.objectStore(this.STORE_NAME)

      return new Promise((resolve, reject) => {
        const albumArtKey = `${songId}_albumart`
        const request = store.delete(albumArtKey)
        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
      })
    } catch (error) {
      console.error("Error removing album art:", error)
    }
  }

  // Get all album art entries for cleanup
  static async getAllAlbumArtEntries(): Promise<Array<{ id: string; songId: string; size: number }>> {
    try {
      const db = await this.initDB()
      const transaction = db.transaction([this.STORE_NAME], "readonly")
      const store = transaction.objectStore(this.STORE_NAME)

      return new Promise((resolve, reject) => {
        const request = store.getAll()
        request.onsuccess = () => {
          const results = request.result
          const albumArtEntries = results
            .filter((item) => item.type === "albumart")
            .map((item) => ({
              id: item.id,
              songId: item.songId,
              size: item.size || 0,
            }))
          resolve(albumArtEntries)
        }
        request.onerror = () => reject(request.error)
      })
    } catch (error) {
      console.error("Error getting album art entries:", error)
      return []
    }
  }

  // Clear entire playlist including album art
  static async clearPlaylist(): Promise<void> {
    try {
      // Clear localStorage metadata
      localStorage.removeItem(this.METADATA_KEY)

      // Clear IndexedDB files and album art
      const db = await this.initDB()
      const transaction = db.transaction([this.STORE_NAME], "readwrite")
      const store = transaction.objectStore(this.STORE_NAME)

      return new Promise((resolve, reject) => {
        const request = store.clear()
        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
      })
    } catch (error) {
      console.error("Error clearing playlist:", error)
    }
  }

  // Get storage usage information including album art
  static async getStorageInfo(): Promise<{
    used: number
    available: number
    songs: number
    albumArtCount: number
    albumArtSize: number
  }> {
    try {
      const db = await this.initDB()
      const transaction = db.transaction([this.STORE_NAME], "readonly")
      const store = transaction.objectStore(this.STORE_NAME)

      return new Promise((resolve, reject) => {
        const request = store.getAll()
        request.onsuccess = () => {
          const files = request.result
          const songFiles = files.filter((file) => !file.type || file.type !== "albumart")
          const albumArtFiles = files.filter((file) => file.type === "albumart")

          const songSize = songFiles.reduce((total, file) => total + (file.fileSize || 0), 0)
          const albumArtSize = albumArtFiles.reduce((total, file) => total + (file.size || 0), 0)
          const totalUsed = songSize + albumArtSize

          // Estimate available storage
          const estimated = navigator.storage?.estimate?.() || Promise.resolve({ quota: 50 * 1024 * 1024 })

          estimated.then((estimate) => {
            resolve({
              used: totalUsed,
              available: (estimate.quota || 50 * 1024 * 1024) - totalUsed,
              songs: songFiles.length,
              albumArtCount: albumArtFiles.length,
              albumArtSize: albumArtSize,
            })
          })
        }
        request.onerror = () => reject(request.error)
      })
    } catch (error) {
      console.error("Error getting storage info:", error)
      return { used: 0, available: 0, songs: 0, albumArtCount: 0, albumArtSize: 0 }
    }
  }

  // Validate stored files against metadata
  static async validateStoredFiles(songs: StoredSong[]): Promise<StoredSong[]> {
    const validSongs: StoredSong[] = []

    for (const song of songs) {
      const file = await this.getSongFile(song.id)
      if (file) {
        // Verify file integrity
        if (file.name === song.fileName && file.size === song.fileSize && file.lastModified === song.fileLastModified) {
          validSongs.push(song)
        } else {
          // File mismatch, remove from storage
          await this.removeSongFile(song.id)
        }
      }
    }

    return validSongs
  }

  // Export playlist data (metadata only, for sharing)
  static exportPlaylistMetadata(): string {
    const data = this.loadPlaylistMetadata()
    if (!data) return JSON.stringify({ songs: [], version: this.VERSION })

    return JSON.stringify({
      songs: data.songs.map((song) => ({
        ...song,
        // Remove file-specific data for export
        id: undefined,
        fileName: song.fileName,
        fileSize: song.fileSize,
      })),
      exportedAt: new Date().toISOString(),
      version: this.VERSION,
    })
  }
}
