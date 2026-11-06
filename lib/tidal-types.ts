export interface TidalTrack {
  id: string
  title: string
  artist: string
  artistId: string
  albumTitle: string
  albumId: string
  albumCover: string
  releaseDate: string
  genre: string
  duration: number
  audioQuality: string
  trackNumber?: number
  discNumber?: number
  copyright?: string
  isrc?: string
  source?: "qobuz" | "amazon"
}

export interface TidalAlbum {
  id: string
  title: string
  artist: string
  artistId: string
  cover: string
  releaseDate: string
  genre: string
  tracks: TidalTrack[]
  trackCount: number
  totalDuration: number
  label?: string
  source?: "qobuz" | "amazon"
}

export interface TidalArtist {
  id: string
  name: string
  image: string
  biography?: string
  albumCount?: number
}

export interface TidalSearchResult {
  tracks: TidalTrack[]
  albums: TidalAlbum[]
  artists: TidalArtist[]
  pagination: {
    total: number
    limit: number
    hasMore: boolean
    loaded: number
  }
  query: string
  searchType: string
}

export interface TidalDiscographyResult {
  artist: TidalArtist
  albums: TidalAlbum[]
}

/**
 * Where an online download is saved: in this browser (and the cloud library
 * too, while it is signed in), or straight into the cloud library alone.
 */
export type DownloadTarget = "device" | "cloud"

export interface DownloadState {
  trackId: string
  trackTitle: string
  artist: string
  /**
   * `downloading` and `processing` are a download to this device: coming
   * down, then being tagged and stored. `saving` is one the server is saving
   * straight to the cloud, which reports no progress until it is done.
   */
  status: "queued" | "downloading" | "processing" | "saving" | "complete" | "error" | "cancelled"
  progress: number
  bytesDownloaded: number
  totalBytes: number
  error?: string
}

const ACTIVE_STATUSES = ["queued", "downloading", "processing", "saving"] as const

/** A download still under way: waiting its turn, coming down, being finished, or being saved to the cloud. */
export type ActiveDownload = DownloadState & { status: (typeof ACTIVE_STATUSES)[number] }

export function isDownloadActive(download: DownloadState): download is ActiveDownload {
  return (ACTIVE_STATUSES as readonly string[]).includes(download.status)
}
