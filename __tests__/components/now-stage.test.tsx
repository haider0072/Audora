import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"

import { NowStage, type NowStageProps } from "@/components/desktop/now-stage"
import { albumPage, artistPage } from "@/lib/library-pages"
import type { Song } from "@/lib/song"
import { stubLibraryDom } from "@/testing/library-dom"

stubLibraryDom()

// The cover draws from the art cache; the stage around it is what is under test.
jest.mock("@/components/album-art-display", () => ({ AlbumArtDisplay: () => null }))

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
    volume: [64],
    isMuted: false,
    onVolumeChange: jest.fn(),
    onToggleMute: jest.fn(),
    onShowPage: jest.fn(),
    fullscreen: false,
    onToggleFullscreen: jest.fn(),
    onOpenSound: jest.fn(),
    onOpenSync: jest.fn(),
    syncConnected: false,
    views: <p>Song views</p>,
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

  it("keeps the artist and the album apart, so each can shorten on its own", () => {
    const { container } = renderStage()
    const credits = container.querySelector(".stage-credits .roll > span")
    const [artist, separator, album] = Array.from(credits?.children ?? [])
    expect(artist).toHaveTextContent("Beach House")
    expect(separator).toHaveAttribute("aria-hidden", "true")
    expect(album).toHaveTextContent("Bloom")
  })

  it("shows the artist alone when the song has no album", () => {
    renderStage({ song: { ...SONG, album: "" } })
    expect(screen.getByRole("button", { name: "Beach House" })).toBeInTheDocument()
    expect(screen.queryByText("—")).not.toBeInTheDocument()
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

  it("goes full screen from its cover by pointer, and from More by keyboard", async () => {
    const { container, props } = renderStage()
    const cover = container.querySelector<HTMLButtonElement>(".stage-cover")
    expect(cover).toHaveAttribute("aria-hidden", "true")
    expect(cover).toHaveAttribute("tabindex", "-1")

    fireEvent.click(cover!)
    expect(props.onToggleFullscreen).toHaveBeenCalledTimes(1)

    fireEvent.click(within(openMore()).getByRole("menuitem", { name: "Full screen" }))
    await waitFor(() => expect(props.onToggleFullscreen).toHaveBeenCalledTimes(2))
  })

  it("leaves full screen from More, its cover idle there", async () => {
    const { container, props } = renderStage({ fullscreen: true })
    const cover = container.querySelector<HTMLButtonElement>(".stage-cover")
    expect(cover).toBeDisabled()
    expect(cover).not.toHaveAttribute("title")

    fireEvent.click(within(openMore()).getByRole("menuitem", { name: "Exit full screen" }))
    await waitFor(() => expect(props.onToggleFullscreen).toHaveBeenCalledTimes(1))
  })

  it("keeps More beside the title, the volume at the end of the transport, and the views under it", () => {
    renderStage()
    const names = screen.getAllByRole("button").map((button) => button.getAttribute("aria-label") ?? button.textContent)
    expect(names).toEqual(["Beach House", "Bloom", "More", "Shuffle", "Previous track", "Play", "Next track", "Mute"])
    expect(screen.getByRole("slider", { name: "Volume" })).toHaveAttribute("aria-orientation", "vertical")
    expect(screen.getByText("Song views")).toBeInTheDocument()
  })

  it("mutes from its speaker, and reads a saved volume of nothing as muted", () => {
    const onToggleMute = jest.fn()
    const { rerender, props } = renderStage({ volume: [0], onToggleMute })
    fireEvent.click(screen.getByRole("button", { name: "Unmute" }))
    expect(onToggleMute).toHaveBeenCalledTimes(1)

    rerender(<NowStage {...props} volume={[80]} isMuted />)
    expect(screen.getByRole("button", { name: "Unmute" })).toBeInTheDocument()
    const fader = screen.getByRole("slider", { name: "Volume" })
    expect(fader).toHaveAttribute("aria-valuetext", "Muted")
    expect(fader).toHaveAttribute("aria-valuenow", "80")
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
