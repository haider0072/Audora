import { act, fireEvent, render, screen } from "@testing-library/react"

import { lineAt, lineDistance, NowLyrics } from "@/components/now/now-lyrics"
import { LyricsService, type LyricLine, type LyricsData } from "@/lib/lyrics-service"
import { resetPlaybackTime, setPlaybackTime } from "@/lib/playback-time-store"
import type { Song } from "@/lib/song"
import { stubLibraryDom } from "@/testing/library-dom"

stubLibraryDom(600)

jest.mock("@/lib/lyrics-service", () => ({
  LyricsService: { fetchLyrics: jest.fn(), withTranslations: jest.fn() },
}))
const fetchLyrics = LyricsService.fetchLyrics as jest.Mock
const withTranslations = LyricsService.withTranslations as jest.Mock

const LINES: LyricLine[] = [
  { time: 10, text: "First line" },
  { time: 20, text: "Second line" },
  { time: 30, text: "Third line" },
]

// Lyrics are kept per song for the session, so every test plays a song of its own.
let songCount = 0
function newSong(fields: Partial<Song> = {}): Song {
  songCount += 1
  return { id: `s${songCount}`, url: "blob:s", title: `Song ${songCount}`, artist: "Artist", duration: 200, ...fields } as Song
}

function synced(lines = LINES): LyricsData {
  return { synced: lines } as LyricsData
}

beforeEach(() => {
  fetchLyrics.mockReset()
  withTranslations.mockReset().mockResolvedValue(null)
  resetPlaybackTime()
})

describe("lineAt", () => {
  it("is -1 before the first line, and for no lines at all", () => {
    expect(lineAt([], 12)).toBe(-1)
    expect(lineAt(LINES, 9.9)).toBe(-1)
  })

  it("is the last line to have started", () => {
    expect(lineAt(LINES, 10)).toBe(0)
    expect(lineAt(LINES, 25)).toBe(1)
    expect(lineAt(LINES, 30)).toBe(2)
    expect(lineAt(LINES, 999)).toBe(2)
  })
})

describe("lineDistance", () => {
  it("steps the next three lines back one by one, then the rest at once", () => {
    expect([5, 6, 7, 8, 9, 20].map((index) => lineDistance(index, 5))).toEqual([undefined, "1", "2", "3", "far", "far"])
  })

  it("leaves the last two lines sung as they are, and sends older ones far", () => {
    expect([4, 3, 2, 0].map((index) => lineDistance(index, 5))).toEqual([undefined, undefined, "far", "far"])
  })

  it("counts from before the first line while nothing is being sung", () => {
    expect([0, 1, 2, 3].map((index) => lineDistance(index, -1))).toEqual(["1", "2", "3", "far"])
  })
})

describe("NowLyrics", () => {
  it("brings the line being sung into focus and steps the rest back", async () => {
    fetchLyrics.mockResolvedValue(synced())
    render(<NowLyrics song={newSong()} following onSeek={jest.fn()} />)
    await screen.findByText("Second line")

    act(() => setPlaybackTime(21))
    const state = (text: string) => screen.getByText(text).closest(".lyrics-line")
    expect(state("First line")).toHaveAttribute("data-state", "past")
    expect(state("Second line")).toHaveAttribute("data-state", "current")
    expect(state("Second line")).toHaveAttribute("aria-current", "true")
    expect(state("Third line")).toHaveAttribute("data-state", "next")
  })

  it("seeks to a line when it is tapped", async () => {
    fetchLyrics.mockResolvedValue(synced())
    const onSeek = jest.fn()
    render(<NowLyrics song={newSong()} following onSeek={onSeek} />)
    fireEvent.click(await screen.findByText("Third line"))
    expect(onSeek).toHaveBeenCalledWith(30)
  })

  it("follows nothing, and seeks nowhere, while a picked song is still loading", async () => {
    fetchLyrics.mockResolvedValue(synced())
    const onSeek = jest.fn()
    render(<NowLyrics song={newSong()} following={false} onSeek={onSeek} />)
    act(() => setPlaybackTime(21))
    fireEvent.click(await screen.findByText("Third line"))
    expect(onSeek).not.toHaveBeenCalled()
    expect(screen.getByText("Second line").closest(".lyrics-line")).toHaveAttribute("data-state", "next")
  })

  it("shows English under lines in other languages once translated", async () => {
    const lyrics = synced([{ time: 10, text: "Hola" }])
    fetchLyrics.mockResolvedValue(lyrics)
    withTranslations.mockResolvedValue(synced([{ time: 10, text: "Hola", translation: "Hello" }]))
    render(<NowLyrics song={newSong()} following onSeek={jest.fn()} />)
    expect(await screen.findByText("Hello")).toHaveClass("lyrics-translation")
  })

  it("reads plain lyrics as text, keeping the breaks between verses", async () => {
    fetchLyrics.mockResolvedValue({ plain: "Verse one\n\nVerse two" } as LyricsData)
    render(<NowLyrics song={newSong()} following onSeek={jest.fn()} />)
    const line = await screen.findByText("Verse one")
    expect(line.closest(".lyrics-line")).toHaveAttribute("data-state", "plain")
    expect(screen.getAllByRole("listitem")).toHaveLength(3)
  })

  it("says so when the song has no lyrics", async () => {
    fetchLyrics.mockResolvedValue(null)
    render(<NowLyrics song={newSong()} following onSeek={jest.fn()} />)
    expect(await screen.findByText("No lyrics for this song")).toBeInTheDocument()
  })

  it("offers to try again when the lyrics service can't be reached", async () => {
    fetchLyrics.mockRejectedValueOnce(new Error("Could not connect to the lyrics service.")).mockResolvedValue(synced())
    const quiet = jest.spyOn(console, "error").mockImplementation(() => {})
    render(<NowLyrics song={newSong()} following onSeek={jest.fn()} />)
    expect(await screen.findByText("Couldn't reach the lyrics service")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(await screen.findByText("First line")).toBeInTheDocument()
    expect(fetchLyrics).toHaveBeenCalledTimes(2)
    quiet.mockRestore()
  })

  it("looks for nothing without an artist, a title and a length", () => {
    render(<NowLyrics song={newSong({ duration: undefined })} following onSeek={jest.fn()} />)
    expect(screen.getByText("No lyrics to look for")).toBeInTheDocument()
    expect(fetchLyrics).not.toHaveBeenCalled()
  })

  it("waits for a song", () => {
    render(<NowLyrics song={null} following onSeek={jest.fn()} />)
    expect(screen.getByText("Nothing playing")).toBeInTheDocument()
  })
})
