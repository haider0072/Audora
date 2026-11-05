import { createRef } from "react"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"

import { PlayerBar, type PlayerBarProps } from "@/components/desktop/player-bar"
import { albumPage, artistPage } from "@/lib/library-pages"
import type { Song } from "@/lib/song"
import { stubLibraryDom } from "@/testing/library-dom"

stubLibraryDom()

// The cover draws from the art cache; the bar around it is what is under test.
jest.mock("@/components/album-art-display", () => ({ AlbumArtDisplay: () => null }))

const SONG = { id: "a", url: "blob:a", title: "Myth", artist: "Beach House", album: "Bloom", duration: 258 } as Song

function renderBar(props: Partial<PlayerBarProps> = {}) {
  const all: PlayerBarProps = {
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
    nowOpen: false,
    onToggleNow: jest.fn(),
    nowToggleRef: createRef<HTMLButtonElement>(),
    volume: [80],
    isMuted: false,
    onVolumeChange: jest.fn(),
    onToggleMute: jest.fn(),
    onOpenSound: jest.fn(),
    onOpenSync: jest.fn(),
    syncConnected: false,
    ...props,
  }
  return { ...render(<PlayerBar {...all} />), props: all }
}

/** Opens the More menu the way a mouse does. */
function openMore() {
  fireEvent.pointerDown(screen.getByRole("button", { name: "More" }), { button: 0, pointerType: "mouse" })
  return screen.getByRole("menu")
}

describe("PlayerBar", () => {
  it("shows the song and goes to its artist or album", () => {
    const { props } = renderBar()
    expect(screen.getByText("Myth")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Beach House" }))
    expect(props.onShowPage).toHaveBeenLastCalledWith(artistPage(SONG))
    fireEvent.click(screen.getByRole("button", { name: "Bloom" }))
    expect(props.onShowPage).toHaveBeenLastCalledWith(albumPage(SONG))
  })

  it("offers nothing to play or open before a song is picked", () => {
    renderBar({ song: null, canSkip: false })
    expect(screen.getByRole("button", { name: "Play" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Previous track" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Next track" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Full screen" })).toBeDisabled()
    expect(screen.queryByRole("button", { name: "Beach House" })).not.toBeInTheDocument()
  })

  it("opens full screen from its cover by pointer, and leaves the keyboard one Full screen button", () => {
    const { container, props } = renderBar()
    const cover = container.querySelector<HTMLButtonElement>(".player-bar-cover")
    expect(cover).toHaveAttribute("aria-hidden", "true")
    expect(cover).toHaveAttribute("tabindex", "-1")
    expect(props.coverRef.current).toBe(cover)
    expect(screen.getAllByRole("button", { name: "Full screen" })).toHaveLength(1)

    fireEvent.click(cover!)
    expect(props.onOpenFullscreen).toHaveBeenCalledTimes(1)
  })

  it("reads a saved volume of nothing as muted", () => {
    const { rerender, props } = renderBar({ volume: [0], isMuted: false })
    fireEvent.click(screen.getByRole("button", { name: "Unmute" }))
    expect(props.onToggleMute).toHaveBeenCalledTimes(1)

    rerender(<PlayerBar {...props} volume={[80]} />)
    expect(screen.getByRole("button", { name: "Mute" })).toBeInTheDocument()
  })

  it("toggles the Now panel, saying whether it is open", () => {
    const { props } = renderBar({ nowOpen: true })
    const toggle = screen.getByRole("button", { name: "Now playing" })
    expect(toggle).toHaveAttribute("aria-pressed", "true")
    expect(props.nowToggleRef.current).toBe(toggle)

    fireEvent.click(toggle)
    expect(props.onToggleNow).toHaveBeenCalledTimes(1)
  })

  it("opens what its menu asks for once the menu has closed, with focus back on its button", async () => {
    let focusedOnOpen: Element | null = null
    const onOpenSound = jest.fn(() => {
      focusedOnOpen = document.activeElement
    })
    const { props } = renderBar({ onOpenSound, syncConnected: true })

    const menu = openMore()
    expect(within(menu).getByRole("menuitem", { name: "Two-device playback: on" })).toBeInTheDocument()
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Sound" }))

    await waitFor(() => expect(onOpenSound).toHaveBeenCalledTimes(1))
    expect(focusedOnOpen).toBe(screen.getByRole("button", { name: "More" }))
    expect(props.onOpenSync).not.toHaveBeenCalled()
  })
})
