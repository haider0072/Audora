import { fireEvent, render, screen, within } from "@testing-library/react"

import { NowQueue, queueRows, type NowQueueProps } from "@/components/now/now-queue"
import type { Song } from "@/lib/song"
import { stubLibraryDom } from "@/testing/library-dom"

stubLibraryDom(600)

function song(id: string, title: string): Song {
  return { id, url: `blob:${id}`, title, artist: "Artist", duration: 200 } as Song
}

const QUEUED = [song("q1", "Queued one"), song("q2", "Queued two")]
const NEXT = [song("n1", "Next one"), song("n2", "Next two")]

function renderQueue(props: Partial<NowQueueProps> = {}) {
  const all: NowQueueProps = {
    queued: QUEUED,
    upNext: NEXT,
    shuffle: false,
    layout: "desktop",
    onSelect: jest.fn(),
    onPlayQueued: jest.fn(),
    playNext: jest.fn(),
    addToQueue: jest.fn(),
    onDequeue: jest.fn(),
    onClear: jest.fn(),
    ...props,
  }
  return { ...render(<NowQueue {...all} />), props: all }
}

/** Opens a row's ⋯ menu the way a mouse does. */
function openMenu(title: string) {
  fireEvent.pointerDown(screen.getByRole("button", { name: `More for ${title}` }), { button: 0, pointerType: "mouse" })
  return screen.getByRole("menu")
}

describe("queueRows", () => {
  it("puts what was queued first, then what the library plays after it", () => {
    const rows = queueRows(QUEUED, NEXT, false)
    expect(rows.map((row) => (row.kind === "heading" ? row.title : row.song.title))).toEqual([
      "Queued · 2 songs",
      "Queued one",
      "Queued two",
      "Then, from your library",
      "Next one",
      "Next two",
    ])
    expect(rows.map((row) => row.key)).toEqual(["queued", "queued:q1", "queued:q2", "next", "next:n1", "next:n2"])
  })

  it("names the shuffle when it is on, and leaves out an empty part", () => {
    const rows = queueRows([], NEXT, true)
    expect(rows[0]).toMatchObject({ kind: "heading", title: "Then, shuffled", clearable: false })
    expect(rows).toHaveLength(3)
  })

  it("has no rows when nothing plays next", () => {
    expect(queueRows([], [], false)).toEqual([])
  })
})

describe("NowQueue", () => {
  it("shows both parts of the queue under their headings", () => {
    renderQueue()
    expect(screen.getByRole("heading", { name: "Queued · 2 songs" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Then, from your library" })).toBeInTheDocument()
    expect(screen.getByText("Queued one")).toBeInTheDocument()
    expect(screen.getByText("Next two")).toBeInTheDocument()
  })

  it("plays a queued song off the queue, and a library song from the library", () => {
    const { props } = renderQueue()
    fireEvent.click(screen.getByText("Queued two"))
    expect(props.onPlayQueued).toHaveBeenCalledWith(QUEUED[1])
    expect(props.onSelect).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText("Next one"))
    expect(props.onSelect).toHaveBeenCalledWith(NEXT[0])
  })

  it("clears the queue", () => {
    const { props } = renderQueue()
    fireEvent.click(screen.getByRole("button", { name: "Clear" }))
    expect(props.onClear).toHaveBeenCalled()
  })

  it("takes a queued song off the queue from its menu", () => {
    const { props } = renderQueue()
    fireEvent.click(within(openMenu("Queued one")).getByRole("menuitem", { name: "Remove from queue" }))
    expect(props.onDequeue).toHaveBeenCalledWith("q1")
  })

  it("offers no way to take a library song off the queue, which it is not on", () => {
    renderQueue()
    const menu = openMenu("Next one")
    expect(within(menu).queryByRole("menuitem", { name: "Remove from queue" })).not.toBeInTheDocument()
    expect(within(menu).getByRole("menuitem", { name: "Play next" })).toBeInTheDocument()
  })

  it("says when nothing plays next", () => {
    renderQueue({ queued: [], upNext: [] })
    expect(screen.getByText("Nothing to play next")).toBeInTheDocument()
  })
})
