import { act, fireEvent, render, screen } from "@testing-library/react"

import { NowVideo } from "@/components/now/now-video"
import type { SongResource } from "@/hooks/use-song-resource"
import type { Song } from "@/lib/song"
import { loadYouTubeApi, type YouTubePlayerOptions } from "@/lib/youtube-player"
import type { VideoSearchResult, YouTubeVideo } from "@/lib/youtube-service"

let mockVideos: SongResource<VideoSearchResult> = { status: "loading" }
jest.mock("@/hooks/use-song-info", () => ({
  useMusicVideos: () => ({ resource: mockVideos, retry: jest.fn() }),
}))

const PLAYING = 1
const player = { pauseVideo: jest.fn(), destroy: jest.fn() }
let options: YouTubePlayerOptions | undefined
jest.mock("@/lib/youtube-player", () => ({ loadYouTubeApi: jest.fn() }))
const loadApi = loadYouTubeApi as jest.Mock

function video(id: string, title: string): YouTubeVideo {
  return {
    id,
    title,
    thumbnail: `https://i.ytimg.com/vi/${id}/hq.jpg`,
    duration: 215,
    channelTitle: "Channel",
    publishedAt: "2024-01-01",
    viewCount: 12_300_000,
    relevanceScore: 1,
  }
}

const SONG = { id: "s", url: "blob:s", title: "Myth", artist: "Beach House" } as Song
const VIDEOS = [video("v1", "Myth (Official Video)"), { ...video("v2", "Myth (Live)"), duration: 301 }]

beforeEach(() => {
  mockVideos = { status: "ready", value: { videos: VIDEOS } as VideoSearchResult }
  options = undefined
  player.pauseVideo.mockClear()
  player.destroy.mockClear()
  loadApi.mockReset().mockResolvedValue({
    Player: jest.fn((_mount: HTMLElement, given: YouTubePlayerOptions) => {
      options = given
      return player
    }),
    PlayerState: { PLAYING },
  })
})

function renderVideo(props: Partial<React.ComponentProps<typeof NowVideo>> = {}) {
  const all = { song: SONG, musicPlaying: false, onVideoPlay: jest.fn(), ...props }
  const view = render(<NowVideo {...all} />)
  return { ...view, props: all, rerenderWith: (next: Partial<typeof all>) => view.rerender(<NowVideo {...all} {...next} />) }
}

/** Taps the poster, and waits for YouTube's player to be made. */
async function start(title = "Myth (Official Video)") {
  fireEvent.click(screen.getByRole("button", { name: `Play the video: ${title}` }))
  await act(async () => {})
}

describe("NowVideo", () => {
  it("starts nothing by itself: the video waits behind its poster", () => {
    renderVideo()
    expect(screen.getByRole("button", { name: "Play the video: Myth (Official Video)" })).toBeInTheDocument()
    expect(screen.getByText("Channel · 3:35 · 12.3M views")).toBeInTheDocument()
    expect(loadApi).not.toHaveBeenCalled()
  })

  it("plays the video tapped, inside the panel", async () => {
    renderVideo()
    await start()
    expect(options).toMatchObject({ videoId: "v1", playerVars: { autoplay: 1, playsinline: 1 } })
  })

  it("pauses the music when the video starts", async () => {
    const { props } = renderVideo({ musicPlaying: true })
    await start()
    act(() => options?.events?.onStateChange?.({ data: PLAYING, target: player }))
    expect(props.onVideoPlay).toHaveBeenCalled()
  })

  it("pauses the video when the music starts again", async () => {
    const { rerenderWith } = renderVideo()
    await start()
    rerenderWith({ musicPlaying: true })
    expect(player.pauseVideo).toHaveBeenCalled()
  })

  it("switches to another video from the list", async () => {
    renderVideo()
    fireEvent.click(screen.getByRole("button", { name: /Myth \(Live\)/ }))
    await act(async () => {})
    expect(options).toMatchObject({ videoId: "v2" })
  })

  it("takes YouTube's player down with the panel", async () => {
    const { unmount } = renderVideo()
    await start()
    unmount()
    expect(player.destroy).toHaveBeenCalled()
  })

  it("says when YouTube has no video for the song", () => {
    mockVideos = { status: "ready", value: { videos: [] } as unknown as VideoSearchResult }
    renderVideo()
    expect(screen.getByText("No music video found")).toBeInTheDocument()
  })

  it("waits for a song", () => {
    renderVideo({ song: null })
    expect(screen.getByText("Nothing playing")).toBeInTheDocument()
  })
})
