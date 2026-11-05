"use client"

import { InsightsService, type InsightsResult } from "@/lib/insights-service"
import type { Song } from "@/lib/song"
import { SpotifyService, type SpotifyResult } from "@/lib/spotify-service"
import { YouTubeService, type VideoSearchResult } from "@/lib/youtube-service"
import { songInfoKey, useSongResource } from "./use-song-resource"

/** What has been written about the song: its story, meaning and trivia. */
export function useSongInsights(song: Song | null) {
  return useSongResource<InsightsResult>(songInfoKey(song), () =>
    InsightsService.getInsights(song!.title!, song!.artist!, song!.album, song!.year, song!.genre),
  )
}

/** What Spotify knows about the song, its album and its artist. */
export function useArtistInfo(song: Song | null) {
  return useSongResource<SpotifyResult>(songInfoKey(song), () => SpotifyService.getArtistInfo(song!.artist!, song!.title!))
}

/** The song's music videos, best match first. */
export function useMusicVideos(song: Song | null) {
  return useSongResource<VideoSearchResult>(songInfoKey(song), () =>
    YouTubeService.searchMusicVideo(song!.artist!, song!.title!),
  )
}
