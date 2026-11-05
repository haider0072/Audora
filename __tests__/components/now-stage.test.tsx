import { createRef } from "react"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"

import { NowStage, type NowStageProps } from "@/components/desktop/now-stage"
import type { NowPlayerProps } from "@/components/now/now-panel"
import { albumPage, artistPage } from "@/lib/library-pages"
import type { Song } from "@/lib/song"
import { stubLibraryDom } from "@/testing/library-dom"

stubLibraryDom()

// The cover draws from the art cache, and the views load on demand; the stage
// around them is what is under test.
jest.mock("@/components/album-art-display", () => ({ AlbumArtDisplay: () => null }))
jest.mock("@/components/now/lazy-now-view", () => ({
  LazyNowView: ({ tab }: { tab: string }) => <p>The {tab} view</p>,
}))

const SONG = { id: "a", url: "blob:a", title: "Myth", artist: "Beach House", album: "Bloom", duration: 258 } as Song

function renderStage(props: Partial<NowStageProps> = {}) {
  const all: NowStageProps = {
    song: SONG,
    isPlaying: false,
    isLoading: false,
    direction: 1,
    duration: 258,
    canSkip: true,
    shuffle: false,
    onToggleShuffle: jest.fn(),
    onPlayPause: jest.fn(),
    onSkipPrevious: jest.fn(),
    onSkipNext: jest.fn(),
    onSeek: jest.fn(),
    onShowPage: jest.fn(),
    coverRef: createRef<HTMLButtonElement>(),
    onOpenFullscreen: jest.fn(),
    mode: "cover",
    onModeChange: jest.fn(),
    now: {} as NowPlayerProps,
    volume: [80],
    isMuted: false,
    onVolumeChange: jest.fn(),
    onToggleMute: jest.fn(),
    onOpenSound: jest.fn(),
    onOpenSync: jest.fn(),
    syncConnected: false,
    ...props,
  }
  return { ...render(<NowStage {...all} />), props: all }
}

/** Opens the More menu the way a mouse does. */
function openMore() {
  fireEvent.pointerDown(screen.getByRole("button", { name: "More" }), { button: 0, pointerType: "mouse" })
  return screen.getByRole("menu")
}

describe("NowStage", () => {
  it("shows the song and goes to its artist or album", () => {
    const { props } = renderStage()
    expect(screen.getByRole("heading", { level: 2, name: "Myth" })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Beach House" }))
    expect(props.onShowPage).toHaveBeenLastCalledWith(artistPage(SONG))
    fireEvent.click(screen.getByRole("button", { name: "Bloom" }))
    expect(props.onShowPage).toHaveBeenLastCalledWith(albumPage(SONG))
  })

  it("says nothing is playing, and offers nothing to play or open, before a song is picked", () => {
    renderStage({ song: null, canSkip: false })
    expect(screen.getByText("Nothing playing")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Play" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Previous track" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Next track" })).toBeDisabled()
    expect(screen.queryByRole("button", { name: "Beach House" })).not.toBeInTheDocument()

    const fullScreen = within(openMore()).getByRole("menuitem", { name: "Full screen" })
    expect(fullScreen).toHaveAttribute("data-disabled")
  })

  it("opens full screen from its cover by pointer, and from More by keyboard", async () => {
    const { container, props } = renderStage()
    const cover = container.querySelector<HTMLButtonElement>(".stage-cover")
    expect(cover).toHaveAttribute("aria-hidden", "true")
    expect(cover).toHaveAttribute("tabindex", "-1")
    expect(props.coverRef.current).toBe(cover)

    fireEvent.click(cover!)
    expect(props.onOpenFullscreen).toHaveBeenCalledTimes(1)

    fireEvent.click(within(openMore()).getByRole("menuitem", { name: "Full screen" }))
    await waitFor(() => expect(props.onOpenFullscreen).toHaveBeenCalledTimes(2))
  })

  it("reads a saved volume of nothing as muted", () => {
    const { rerender, props } = renderStage({ volume: [0], isMuted: false })
    fireEvent.click(screen.getByRole("button", { name: "Unmute" }))
    expect(props.onToggleMute).toHaveBeenCalledTimes(1)

    rerender(<NowStage {...props} volume={[80]} />)
    expect(screen.getByRole("button", { name: "Mute" })).toBeInTheDocument()
    expect(screen.getByRole("slider", { name: "Volume" })).toHaveAttribute("aria-valuetext", "80%")
  })

  it("says a muted volume is muted, keeping its level to come back to", () => {
    renderStage({ volume: [80], isMuted: true })
    expect(screen.getByRole("button", { name: "Unmute" })).toBeInTheDocument()
    expect(screen.getByRole("slider", { name: "Volume" })).toHaveAttribute("aria-valuetext", "Muted")
    expect(screen.getByRole("slider", { name: "Volume" })).toHaveAttribute("aria-valuenow", "80")
  })

  it("shows a view in the cover's place, and the cover again on a second press", () => {
    const { rerender, props } = renderStage()
    const views = screen.getByRole("group", { name: "Show in place of the cover" })
    expect(within(views).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Lyrics",
      "Queue",
      "About",
      "Video",
    ])
    fireEvent.click(screen.getByRole("button", { name: "Lyrics" }))
    expect(props.onModeChange).toHaveBeenLastCalledWith("lyrics")

    rerender(<NowStage {...props} mode="lyrics" />)
    const lyrics = screen.getByRole("button", { name: "Lyrics" })
    expect(lyrics).toHaveAttribute("aria-pressed", "true")
    const region = screen.getByRole("region", { name: "Lyrics" })
    expect(lyrics).toHaveAttribute("aria-controls", region.id)
    expect(within(region).getByText("The lyrics view")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Queue" })).not.toHaveAttribute("aria-controls")

    fireEvent.click(lyrics)
    expect(props.onModeChange).toHaveBeenLastCalledWith("cover")
  })

  it("opens what its menu asks for once the menu has closed, with focus back on More", async () => {
    let focusedOnOpen: Element | null = null
    const onOpenSound = jest.fn(() => {
      focusedOnOpen = document.activeElement
    })
    const { props } = renderStage({ onOpenSound, syncConnected: true })

    const menu = openMore()
    expect(within(menu).getByRole("menuitem", { name: "Two-device playback: on" })).toBeInTheDocument()
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Sound" }))

    await waitFor(() => expect(onOpenSound).toHaveBeenCalledTimes(1))
    expect(focusedOnOpen).toBe(screen.getByRole("button", { name: "More" }))
    expect(props.onOpenSync).not.toHaveBeenCalled()
  })
})
