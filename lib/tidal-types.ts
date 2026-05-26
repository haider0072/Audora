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
