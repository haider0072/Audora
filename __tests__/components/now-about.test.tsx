import { fireEvent, render, screen, within } from "@testing-library/react"

import { fileFacts, insightSections, NowAbout } from "@/components/now/now-about"
import type { SongResource } from "@/hooks/use-song-resource"
import type { InsightsResult } from "@/lib/insights-service"
import type { Song } from "@/lib/song"
import type { SpotifyResult } from "@/lib/spotify-service"

let mockInsights: SongResource<InsightsResult> = { status: "loading" }
let mockArtist: SongResource<SpotifyResult> = { status: "loading" }
const mockRetryArtist = jest.fn()
jest.mock("@/hooks/use-song-info", () => ({
  useSongInsights: () => ({ resource: mockInsights, retry: jest.fn() }),
  useArtistInfo: () => ({ resource: mockArtist, retry: mockRetryArtist }),
}))

const HI_RES: Song = {
  id: "s",
  url: "blob:s",
  title: "Behind The Shine",
  artist: "RIIZE",
  format: "flac",
  bitDepth: 24,
  sampleRate: 96000,
  bitrate: 2966,
  duration: 201,
  fileSize: 74_000_000,
  genre: "K-Pop",
  year: "2024",
} as Song

beforeEach(() => {
  mockInsights = { status: "loading" }
  mockArtist = { status: "loading" }
  mockRetryArtist.mockClear()
})

describe("fileFacts", () => {
  it("reads a lossless file's figures, its bitrate in kbps as the quality meter does", () => {
    expect(Object.fromEntries(fileFacts(HI_RES))).toEqual({
      Format: "FLAC",
      "Bit depth": "24-bit",
      "Sample rate": "96 kHz",
      Bitrate: "2,966 kbps",
      Length: "3:21",
      Size: "70.6 MB",
      Genre: "K-Pop",
      Year: "2024",
    })
  })

  it("leaves out a lossy file's bitrate, which is only an estimate", () => {
    const facts = Object.fromEntries(fileFacts({ ...HI_RES, format: "mp3", bitDepth: undefined, sampleRate: 44100, bitrate: 320 }))
    expect(facts.Format).toBe("MP3")
    expect(facts).not.toHaveProperty("Bitrate")
  })

  it("leaves out a bitrate whose format is not known", () => {
    expect(Object.fromEntries(fileFacts({ ...HI_RES, format: undefined }))).not.toHaveProperty("Bitrate")
  })

  it("names the album artist only where it differs from the artist", () => {
    expect(Object.fromEntries(fileFacts({ ...HI_RES, albumArtist: "RIIZE" }))).not.toHaveProperty("Album artist")
    expect(Object.fromEntries(fileFacts({ ...HI_RES, albumArtist: "Various" }))["Album artist"]).toBe("Various")
  })
})

describe("insightSections", () => {
  it("splits the text at its headings", () => {
    expect(insightSections("## The story\nWritten in a week.\n\n## Did you know?\nIt was a demo.")).toEqual([
      { title: "The story", content: "Written in a week." },
      { title: "Did you know?", content: "It was a demo." },
    ])
  })

  it("keeps text without headings as one untitled section", () => {
    expect(insightSections("Just a paragraph.")).toEqual([{ title: "", content: "Just a paragraph." }])
  })
})

describe("NowAbout", () => {
  it("explains a refusal from Spotify in its own words, and offers to ask again", () => {
    mockArtist = {
      status: "ready",
      value: { found: false, unavailable: "Active premium subscription required for the owner of the app." },
    }
    render(<NowAbout song={HI_RES} />)
    const artist = screen.getByRole("region", { name: "The artist" })
    expect(within(artist).getByText("Spotify isn't answering this app")).toBeInTheDocument()
    expect(
      within(artist).getByText("Spotify says: Active premium subscription required for the owner of the app."),
    ).toBeInTheDocument()

    fireEvent.click(within(artist).getByRole("button", { name: "Try again" }))
    expect(mockRetryArtist).toHaveBeenCalled()
  })

  it("tells a song Spotify does not know apart from a refusal", () => {
    mockArtist = { status: "ready", value: { found: false } }
    render(<NowAbout song={HI_RES} />)
    expect(screen.getByText("Spotify doesn't know this song")).toBeInTheDocument()
    expect(screen.queryByText("Spotify isn't answering this app")).not.toBeInTheDocument()
  })

  it("always shows the file's own details, whatever Spotify says", () => {
    mockArtist = { status: "error", error: "Couldn't reach Spotify." }
    render(<NowAbout song={HI_RES} />)
    const file = screen.getByRole("region", { name: "The file" })
    expect(within(file).getByText("Sample rate")).toBeInTheDocument()
    expect(within(file).getByText("2,966 kbps")).toBeInTheDocument()
  })

  it("shows what Spotify knows about the artist as plain text", () => {
    mockArtist = {
      status: "ready",
      value: {
        found: true,
        artist: {
          name: "RIIZE",
          followers: 1_234_567,
          genres: ["k-pop", "k-pop boy group"],
          popularity: 71,
          spotifyUrl: "https://open.spotify.com/artist/x",
        },
      } as SpotifyResult,
    }
    render(<NowAbout song={HI_RES} />)
    expect(screen.getByText("1.2M followers · k-pop · k-pop boy group")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Open on Spotify" })).toHaveAttribute("href", "https://open.spotify.com/artist/x")
    expect(screen.getByText("71 / 100")).toBeInTheDocument()
  })

  it("shows what was written about the song, section by section, with its model", () => {
    mockInsights = {
      status: "ready",
      value: { available: true, cached: false, content: "## The story\nWritten in a week.", model: "some-model" },
    }
    render(<NowAbout song={HI_RES} />)
    expect(screen.getByRole("heading", { name: "The story" })).toBeInTheDocument()
    expect(screen.getByText("Written in a week.")).toBeInTheDocument()
    expect(screen.getByText("AI-written · some-model")).toBeInTheDocument()
  })

  it("says when song insights are not set up", () => {
    mockInsights = { status: "ready", value: { available: false, cached: false, content: null } }
    render(<NowAbout song={HI_RES} />)
    expect(screen.getByText("Song insights aren't set up")).toBeInTheDocument()
  })

  it("waits for a song", () => {
    render(<NowAbout song={null} />)
    expect(screen.getByText("Nothing playing")).toBeInTheDocument()
  })
})
