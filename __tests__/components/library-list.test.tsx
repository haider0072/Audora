import { fireEvent, render, screen, within } from "@testing-library/react"

import { LibraryList, type LibraryActions, type LibraryJump } from "@/components/library/library-list"
import type { Song } from "@/lib/song"

// jsdom has no PointerEvent, and a plain Event drops `button` and `pointerType`.
if (typeof window.PointerEvent === "undefined") {
  class PointerEventStandIn extends MouseEvent {
    readonly pointerId: number
    readonly pointerType: string
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init)
      this.pointerId = init.pointerId ?? 0
      this.pointerType = init.pointerType ?? "mouse"
    }
  }
  window.PointerEvent = PointerEventStandIn as unknown as typeof PointerEvent
}
// Nor an AnimationEvent, which the list reads `animationName` from.
if (typeof window.AnimationEvent === "undefined") {
  class AnimationEventStandIn extends Event {
    readonly animationName: string
    constructor(type: string, init: AnimationEventInit = {}) {
      super(type, init)
      this.animationName = init.animationName ?? ""
    }
  }
  window.AnimationEvent = AnimationEventStandIn as unknown as typeof AnimationEvent
}

/** The viewport is 600 px tall. */
const VIEWPORT_HEIGHT = 600

// jsdom lays nothing out: give the list a viewport to fill, and scrolling that moves it.
const scrollTo = jest.fn(function (this: HTMLElement, options: ScrollToOptions) {
  this.scrollTop = options.top ?? 0
  this.dispatchEvent(new Event("scroll"))
})
beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => VIEWPORT_HEIGHT })
  HTMLElement.prototype.scrollTo = scrollTo as unknown as HTMLElement["scrollTo"]
})
afterAll(() => {
  delete (HTMLElement.prototype as { clientHeight?: number }).clientHeight
})
beforeEach(() => scrollTo.mockClear())

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

  it("says when the library is empty", () => {
    renderList({ songs: [] })
    expect(screen.getByText("Your library is empty")).toBeInTheDocument()
  })

  it("says nothing while songs are still arriving", () => {
    renderList({ songs: [], loading: true })
    expect(screen.queryByText("Your library is empty")).not.toBeInTheDocument()
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

  it("makes a jump asked for from outside, marks where it landed, and hands it back", () => {
    const onJumpDone = jest.fn()
    const jump: LibraryJump = { to: "artist", song: LIBRARY[4] }
    renderList({ jump, onJumpDone })
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 336, behavior: "smooth" })
    expect(onJumpDone).toHaveBeenCalledTimes(1)
    const header = screen.getByRole("heading", { level: 3, name: "Cocteau Twins" }).closest(".library-sticky")
    expect(header).toHaveAttribute("data-flash")
  })

  it("lands an album under its artist's header", () => {
    renderList({ jump: { to: "album", song: LIBRARY[4] }, onJumpDone: jest.fn() })
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 476 - 52, behavior: "smooth" })
  })

  it("lands at once when the jump is many screens away", () => {
    const many = Array.from({ length: 200 }, (_, i) =>
      song(`s${i}`, { title: `Track ${i}`, artist: `Artist ${String(i).padStart(3, "0")}`, album: "One" }),
    )
    renderList({ songs: many, jump: { to: "artist", song: many[150] }, onJumpDone: jest.fn() })
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 150 * (52 + 32 + 56), behavior: "instant" })
  })

  it("drops the mark once it has played", () => {
    renderList({ jump: { to: "artist", song: LIBRARY[0] }, onJumpDone: jest.fn() })
    const header = screen.getByRole("heading", { level: 3, name: "Air" }).closest(".library-sticky") as HTMLElement
    fireEvent.animationEnd(header, { animationName: "library-flash" })
    expect(header).not.toHaveAttribute("data-flash")
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

  it("goes to the song's album", () => {
    renderList()
    fireEvent.click(within(openMenu("Cherry-coloured Funk")).getByRole("menuitem", { name: "Go to album" }))
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 476 - 52, behavior: "smooth" })
    const album = screen.getByRole("heading", { level: 4, name: "Heaven or Las Vegas" }).closest(".library-slot")
    expect(album).toHaveAttribute("data-flash")
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
