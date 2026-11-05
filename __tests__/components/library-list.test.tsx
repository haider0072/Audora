import { fireEvent, render, screen, within } from "@testing-library/react"

import { LibraryList } from "@/components/library/library-list"
import type { LibraryActions } from "@/components/library/use-row-actions"
import type { Song } from "@/lib/song"
import { stubLibraryDom } from "@/testing/library-dom"

// jsdom lays nothing out: the list gets a 600 px viewport, and scrolling that moves it.
const scrollTo = stubLibraryDom(600)

function song(id: string, fields: Partial<Song> = {}): Song {
  return { id, url: `blob:${id}`, title: id, duration: 200, ...fields } as Song
}

/**
 * In playback order. Grouped, with desktop heights (artist 52, album 32,
 * song 56), the rows start at:
 *   0 Air 0 · 1 Moon Safari 52 · 2 La femme d'argent 84 · 3 Sexy Boy 140 ·
 *   4 Beach House 196 · 5 Bloom 248 · 6 Myth 280 ·
 *   7 Cocteau Twins 336 · 8 Treasure 388 · 9 Lorelei 420 · 10 Heaven or Las Vegas 476 · 11 Cherry-coloured Funk 508
 */
const LIBRARY: Song[] = [
  song("air-1", { title: "La femme d'argent", artist: "Air", album: "Moon Safari", trackNumber: "1" }),
  song("air-2", { title: "Sexy Boy", artist: "Air", album: "Moon Safari", trackNumber: "2" }),
  song("bh-1", { title: "Myth", artist: "Beach House", album: "Bloom", trackNumber: "1" }),
  song("ct-1", { title: "Lorelei", artist: "Cocteau Twins", album: "Treasure", trackNumber: "2" }),
  song("ct-2", { title: "Cherry-coloured Funk", artist: "Cocteau Twins", album: "Heaven or Las Vegas", trackNumber: "1" }),
]

function actions(): LibraryActions {
  return { playNext: jest.fn(), addToQueue: jest.fn(), removeSong: jest.fn() }
}

type Props = Partial<React.ComponentProps<typeof LibraryList>>

function renderList(props: Props = {}) {
  const all = {
    songs: LIBRARY,
    viewMode: "grouped" as const,
    layout: "desktop" as const,
    onSelect: jest.fn(),
    actions: actions(),
    onOpen: jest.fn(),
    ...props,
  }
  const view = render(<LibraryList {...all} />)
  return { ...view, props: all, rerenderWith: (next: Props) => view.rerender(<LibraryList {...all} {...next} />) }
}

function rowOf(title: string): HTMLElement {
  return screen.getByText(title).closest(".library-row") as HTMLElement
}

/** Opens a row's ⋯ menu the way a mouse does. */
function openMenu(title: string) {
  fireEvent.pointerDown(screen.getByRole("button", { name: `More for ${title}` }), { button: 0, pointerType: "mouse" })
  return screen.getByRole("menu")
}

describe("LibraryList, grouped", () => {
  it("shows each artist and album over their songs, with counts", () => {
    renderList()
    expect(screen.getByRole("heading", { level: 3, name: "Air" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 4, name: "Heaven or Las Vegas" })).toBeInTheDocument()
    expect(screen.getByText("Cherry-coloured Funk")).toBeInTheDocument()
    const cocteau = screen.getByRole("heading", { level: 3, name: "Cocteau Twins" }).parentElement as HTMLElement
    expect(within(cocteau).getByText("2 songs")).toBeInTheDocument()
  })

  it("opens an artist's or an album's page from its header", () => {
    const { props } = renderList()
    fireEvent.click(screen.getByRole("button", { name: "Beach House" }))
    expect(props.onOpen).toHaveBeenLastCalledWith({ kind: "artist", artist: "Beach House" })
    fireEvent.click(screen.getByRole("button", { name: "Heaven or Las Vegas" }))
    expect(props.onOpen).toHaveBeenLastCalledWith({ kind: "album", artist: "Cocteau Twins", album: "Heaven or Las Vegas" })
  })

  it("places every row where its height says", () => {
    renderList()
    const slot = (title: string) => screen.getByText(title).closest(".library-slot") as HTMLElement
    const group = (artist: string) => screen.getByRole("heading", { level: 3, name: artist }).closest(".library-group") as HTMLElement
    expect(group("Cocteau Twins").style.top).toBe("336px")
    expect(group("Cocteau Twins").style.height).toBe("228px")
    // Inside its artist's block, from the block's top.
    expect(slot("Cherry-coloured Funk").style.top).toBe("172px")
    expect(slot("Cherry-coloured Funk").style.height).toBe("56px")
  })

  it("marks the current song with how it is doing, and no other", () => {
    renderList({ currentSongId: "bh-1", playback: "playing" })
    expect(rowOf("Myth")).toHaveAttribute("data-playback", "playing")
    expect(screen.getByText("Now playing")).toBeInTheDocument()
    expect(rowOf("Sexy Boy")).not.toHaveAttribute("data-playback")
  })

  it("plays the song you pick", () => {
    const { props } = renderList()
    fireEvent.click(screen.getByText("Lorelei"))
    expect(props.onSelect).toHaveBeenCalledWith(LIBRARY[3])
  })

  it("draws only the rows near the view, however long the library", () => {
    const many = Array.from({ length: 400 }, (_, i) =>
      song(`s${i}`, { title: `Track ${i}`, artist: `Artist ${String(i).padStart(3, "0")}`, album: "One" }),
    )
    const { container } = renderList({ songs: many })
    const drawn = container.querySelectorAll(".library-row").length
    expect(drawn).toBeGreaterThan(0)
    expect(drawn).toBeLessThan(20)
  })
})

describe("LibraryList, list view", () => {
  it("numbers every song and names its artist and album", () => {
    renderList({ viewMode: "list" })
    expect(screen.queryByRole("heading", { level: 3 })).not.toBeInTheDocument()
    expect(screen.getByText("Cocteau Twins · Treasure")).toBeInTheDocument()
    expect(within(rowOf("Cherry-coloured Funk")).getByText("5")).toBeInTheDocument()
  })
})

describe("LibraryList, empty", () => {
  it("says when nothing matches a search", () => {
    renderList({ query: "  no such song " })
    expect(screen.getByText("Nothing matches “no such song”")).toBeInTheDocument()
  })

  it("says when the library is empty, and offers a way to fill it", () => {
    const onClick = jest.fn()
    renderList({ songs: [], emptyAction: { label: "Add a folder", onClick } })
    expect(screen.getByText("Your library is quiet")).toBeInTheDocument()
    expect(screen.getByText("Drop music anywhere, or add a folder.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Add a folder" }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it("does not talk about dropping files on a phone", () => {
    renderList({ songs: [], layout: "phone" })
    expect(screen.getByText("Add songs to start listening.")).toBeInTheDocument()
  })

  it("says so when the library is empty because the device is offline", () => {
    const onLine = jest.spyOn(navigator, "onLine", "get").mockReturnValue(false)
    renderList({ songs: [] })
    expect(screen.getByText("You're offline")).toBeInTheDocument()
    onLine.mockRestore()
  })

  it("says nothing while songs are still arriving", () => {
    renderList({ songs: [], loading: true })
    expect(screen.queryByText("Your library is quiet")).not.toBeInTheDocument()
  })
})

describe("LibraryList, moving around", () => {
  it("jumps to a letter at once", () => {
    renderList()
    fireEvent.click(screen.getByRole("button", { name: "Jump to C" }))
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 336, behavior: "instant" })
  })

  it("offers only the letters the library has", () => {
    renderList()
    expect(screen.getByRole("button", { name: "Jump to B" })).toBeEnabled()
    expect(screen.getByRole("button", { name: "Jump to Z" })).toBeDisabled()
  })

  it("starts a new search from the top", () => {
    const { rerenderWith } = renderList()
    fireEvent.click(screen.getByRole("button", { name: "Jump to C" }))
    rerenderWith({ query: "a" })
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: "instant" })
  })

  it("keeps the song at the top in place when the view changes", () => {
    const { rerenderWith } = renderList()
    // Cocteau Twins at the top: under the sticky header sits their first song, Lorelei.
    fireEvent.click(screen.getByRole("button", { name: "Jump to C" }))
    rerenderWith({ viewMode: "list" })
    // In the list view Lorelei is the fourth song.
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 3 * 56, behavior: "instant" })
  })
})

describe("LibraryList, a song's menu", () => {
  it("queues a song, plays it next, or removes it", () => {
    const { props } = renderList()
    fireEvent.click(within(openMenu("Myth")).getByRole("menuitem", { name: "Add to queue" }))
    expect(props.actions.addToQueue).toHaveBeenCalledWith(LIBRARY[2])

    fireEvent.click(within(openMenu("Myth")).getByRole("menuitem", { name: "Play next" }))
    expect(props.actions.playNext).toHaveBeenCalledWith(LIBRARY[2])

    fireEvent.click(within(openMenu("Myth")).getByRole("menuitem", { name: "Remove" }))
    expect(props.actions.removeSong).toHaveBeenCalledWith("bh-1")
  })

  it("goes to the song's artist or album", () => {
    const { props } = renderList()
    fireEvent.click(within(openMenu("Cherry-coloured Funk")).getByRole("menuitem", { name: "Go to album" }))
    expect(props.onOpen).toHaveBeenLastCalledWith({ kind: "album", artist: "Cocteau Twins", album: "Heaven or Las Vegas" })
    fireEvent.click(within(openMenu("Cherry-coloured Funk")).getByRole("menuitem", { name: "Go to artist" }))
    expect(props.onOpen).toHaveBeenLastCalledWith({ kind: "artist", artist: "Cocteau Twins" })
  })

  it("does not offer to remove a song that lives only in the cloud", () => {
    const cloudOnly = song("cloud-1", {
      title: "Teardrop",
      artist: "Massive Attack",
      album: "Mezzanine",
      cloud: { key: "library/teardrop.flac", streamUrl: "https://example.test/teardrop" },
    })
    renderList({ songs: [cloudOnly] })
    const menu = openMenu("Teardrop")
    expect(within(menu).queryByRole("menuitem", { name: "Remove" })).not.toBeInTheDocument()
    expect(within(menu).getByRole("menuitem", { name: "Go to artist" })).toBeInTheDocument()
  })
})
