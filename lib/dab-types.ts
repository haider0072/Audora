export interface DabTrack {
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
  source?: "qobuz" | "amazon"
}

export interface DabAlbum {
  id: string
  title: string
  artist: string
  artistId: string
  cover: string
  releaseDate: string
  genre: string
  tracks: DabTrack[]
  trackCount: number
  totalDuration: number
  label?: string
  source?: "qobuz" | "amazon"
}

export interface DabArtist {
  id: string
  name: string
  image: string
  biography?: string
  albumCount?: number
}

export interface DabSearchResult {
  tracks: DabTrack[]
  albums: DabAlbum[]
  artists: DabArtist[]
  pagination: {
    total: number
    limit: number
    hasMore: boolean
    loaded: number
  }
  query: string
  searchType: string
}

export interface DabDiscographyResult {
  artist: DabArtist
  albums: DabAlbum[]
}

export interface DownloadState {
  trackId: string
  trackTitle: string
  artist: string
  status: "queued" | "downloading" | "processing" | "complete" | "error" | "cancelled"
  progress: number
  bytesDownloaded: number
  totalBytes: number
  error?: string
}
