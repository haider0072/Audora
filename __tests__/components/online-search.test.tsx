import { useState } from "react"
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"

import { DownloadIndicator } from "@/components/dab/download-indicator"
import { DownloadQueueBar } from "@/components/dab/download-queue-bar"
import { OnlineFilters } from "@/components/dab/online-filters"
import type { OnlineActions } from "@/components/dab/online-rows"
import { OnlineSearchSidebar } from "@/components/dab/online-search-sidebar"
import { PasteLinkField } from "@/components/dab/paste-link"
import { SearchResults } from "@/components/dab/search-results"
import type { OnlineFailure, TidalView, UseTidalSearchReturn } from "@/hooks/use-tidal-search"
import type { DownloadState, TidalAlbum, TidalSearchResult, TidalTrack } from "@/lib/tidal-types"
import { stubLibraryDom } from "@/testing/library-dom"

stubLibraryDom()

function track(id: string, title: string, fields: Partial<TidalTrack> = {}): TidalTrack {
  return {
    id,
    title,
    artist: "IU",
    artistId: "ar-iu",
    albumTitle: "Palette",
    albumId: "al-palette",
    albumCover: "",
    releaseDate: "2017-04-21",
    genre: "K-Pop",
    duration: 217,
    audioQuality: "LOSSLESS",
    source: "amazon",
    ...fields,
  }
}

const TRACKS = [track("t1", "Palette"), track("t2", "Ending Scene", { source: "qobuz" })]

const ALBUM: TidalAlbum = {
  id: "al-palette",
  title: "Palette",
  artist: "IU",
  artistId: "ar-iu",
  cover: "",
  releaseDate: "2017-04-21",
  genre: "K-Pop",
  tracks: TRACKS,
  trackCount: 2,
  totalDuration: 434,
  source: "amazon",
}

const RESULTS: TidalSearchResult = {
  tracks: TRACKS,
  albums: [ALBUM],
  artists: [],
  pagination: { total: 3, limit: 20, hasMore: false, loaded: 3 },
  query: "palette",
  searchType: "all",
}

function actions(): OnlineActions {
  return { preview: jest.fn(), download: jest.fn(), cancel: jest.fn(), openAlbum: jest.fn(), openArtist: jest.fn() }
}

function download(trackId: string, status: DownloadState["status"], progress = 0): DownloadState {
  return { trackId, trackTitle: trackId === "t1" ? "Palette" : "Ending Scene", artist: "IU", status, progress, bytesDownloaded: 0, totalBytes: 0 }
}

type ResultsProps = Partial<React.ComponentProps<typeof SearchResults>>

function renderResults(props: ResultsProps = {}) {
  const all = {
    results: RESULTS,
    type: "all" as const,
    layout: "desktop" as const,
    showSource: true,
    downloads: new Map<string, DownloadState>(),
    isInLibrary: () => false,
    preview: { trackId: null, playing: false, loading: false },
    opening: null,
    unopened: null,
    actions: actions(),
    onShowAll: jest.fn(),
    ...props,
  }
  return { ...render(<SearchResults {...all} />), props: all }
}

describe("SearchResults", () => {
  it("heads each kind it found, and previews a song or opens an album when pressed", () => {
    const { props } = renderResults()
    expect(screen.getByRole("heading", { level: 3, name: "Songs 2" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 3, name: "Albums 1" })).toBeInTheDocument()
    expect(screen.queryByRole("heading", { level: 3, name: /Artists/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: /Preview\s*Ending Scene/ }))
    expect(props.actions.preview).toHaveBeenCalledWith(TRACKS[1])
    const albums = screen.getByRole("region", { name: "Albums 1" })
    fireEvent.click(within(albums).getByRole("button", { name: /Palette/ }))
    expect(props.actions.openAlbum).toHaveBeenCalledWith("al-palette")
  })

  it("says where each result comes from only while it looks in more than one place", () => {
    const { rerender, props } = renderResults()
    expect(screen.getByText("Qobuz")).toBeInTheDocument()
    expect(screen.getAllByText("Amazon")).toHaveLength(2)

    rerender(<SearchResults {...props} showSource={false} />)
    expect(screen.queryByText("Qobuz")).not.toBeInTheDocument()
  })

  it("marks the song being previewed, and how it is doing", () => {
    renderResults({ preview: { trackId: "t2", playing: false, loading: true } })
    const previewed = screen.getByRole("button", { name: /Preview\s*Ending Scene/ })
    expect(previewed).toHaveAttribute("aria-pressed", "true")
    expect(previewed.closest(".library-row")).toHaveAttribute("data-playback", "loading")
    expect(screen.getByRole("button", { name: /Preview\s*Palette/ })).toHaveAttribute("aria-pressed", "false")
  })

  it("shows one kind on its own, under a heading only a screen reader needs", () => {
    renderResults({ type: "album" })
    expect(screen.queryByRole("button", { name: /Preview/ })).not.toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 3, name: "Albums 1" })).toHaveClass("sr-only")
  })

  it("offers everything found when the kind asked for has none", () => {
    const { props } = renderResults({ type: "artist" })
    expect(screen.getByText("No artists for “palette”")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Show everything found" }))
    expect(props.onShowAll).toHaveBeenCalledTimes(1)
  })

  it("says when nothing was found at all", () => {
    renderResults({ results: { ...RESULTS, tracks: [], albums: [], artists: [] } })
    expect(screen.getByText("Nothing online for “palette”")).toBeInTheDocument()
  })

  it("turns an arc on an album while it opens, and says so on it when it didn't", () => {
    const { rerender, props } = renderResults({ opening: "al-palette" })
    const albums = screen.getByRole("region", { name: "Albums 1" })
    expect(within(albums).getByRole("button")).toHaveAttribute("aria-busy", "true")

    rerender(<SearchResults {...props} opening={null} unopened={{ id: "al-palette", note: "Not available" }} />)
    expect(within(albums).getByRole("button", { name: /Not available/ })).not.toHaveAttribute("aria-busy")
  })
})

describe("DownloadIndicator", () => {
  function renderIndicator(state?: DownloadState, isInLibrary = false) {
    const props = { title: "Palette", state, isInLibrary, onDownload: jest.fn(), onCancel: jest.fn() }
    render(<DownloadIndicator {...props} />)
    return props
  }

  it("downloads a song not yet in the library", () => {
    const props = renderIndicator()
    fireEvent.click(screen.getByRole("button", { name: "Download Palette in FLAC" }))
    expect(props.onDownload).toHaveBeenCalledTimes(1)
  })

  it("stops a download still waiting its turn", () => {
    const waiting = renderIndicator(download("t1", "queued"))
    fireEvent.click(screen.getByRole("button", { name: "Queued: stop downloading Palette" }))
    expect(waiting.onCancel).toHaveBeenCalledTimes(1)
  })

  it("says how far a download has come, and stops it when pressed", () => {
    const props = renderIndicator(download("t1", "downloading", 42))
    fireEvent.click(screen.getByRole("button", { name: "Stop downloading Palette, 42%" }))
    expect(props.onCancel).toHaveBeenCalledTimes(1)
  })

  it("offers to try a failed download again, in words", () => {
    const props = renderIndicator({ ...download("t1", "error"), error: "Network error" })
    const retry = screen.getByRole("button", { name: "Palette didn't download: try again" })
    expect(retry).toHaveAttribute("title", "Network error")
    fireEvent.click(retry)
    expect(props.onDownload).toHaveBeenCalledTimes(1)
  })

  it("is no button while a download is finished off, or once the song is in the library", () => {
    renderIndicator(download("t1", "processing", 100))
    expect(screen.getByText("Finishing the download")).toBeInTheDocument()
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })

  it("says a song in the library is there", () => {
    renderIndicator(undefined, true)
    expect(screen.getByText("In your library")).toBeInTheDocument()
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })
})

describe("DownloadQueueBar", () => {
  it("is gone while nothing is under way", () => {
    const { container } = render(<DownloadQueueBar downloads={new Map([["t1", download("t1", "complete", 100)]])} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("follows the song coming down, and counts the rest", () => {
    const downloads = new Map([
      ["t2", download("t2", "queued")],
      ["t1", download("t1", "downloading", 42)],
    ])
    const { container } = render(<DownloadQueueBar downloads={downloads} />)
    expect(screen.getByText("Palette")).toBeInTheDocument()
    expect(screen.getByText(/Downloading/)).toBeInTheDocument()
    expect(screen.getByText("1 more song")).toBeInTheDocument()
    expect(screen.getByText("42%")).toBeInTheDocument()
    expect(container.querySelector<HTMLElement>(".online-strip")?.style.getPropertyValue("--progress")).toBe("0.42")
  })
})

describe("OnlineFilters", () => {
  function renderFilters(results: TidalSearchResult | null) {
    const props = { type: "all" as const, onTypeChange: jest.fn(), source: "auto" as const, onSourceChange: jest.fn(), results }
    render(<OnlineFilters {...props} />)
    return props
  }

  it("counts each kind the search looked for, and only those", () => {
    renderFilters({ ...RESULTS, searchType: "track" })
    expect(screen.getByRole("radio", { name: "Songs 2" })).toBeInTheDocument()
    expect(screen.getByRole("radio", { name: "Albums" })).toBeInTheDocument()
  })

  it("chooses with the arrow keys, one stop for Tab", () => {
    const props = renderFilters(RESULTS)
    const show = screen.getByRole("radiogroup", { name: "Show" })
    const all = within(show).getByRole("radio", { name: "All" })
    expect(all).toHaveAttribute("aria-checked", "true")
    expect(all).toHaveAttribute("tabindex", "0")
    expect(within(show).getByRole("radio", { name: "Songs 2" })).toHaveAttribute("tabindex", "-1")

    fireEvent.keyDown(all, { key: "ArrowDown" })
    expect(props.onTypeChange).toHaveBeenLastCalledWith("track")
    fireEvent.keyDown(all, { key: "ArrowLeft" })
    expect(props.onTypeChange).toHaveBeenLastCalledWith("artist")

    const sources = screen.getByRole("radiogroup", { name: "Search in" })
    fireEvent.click(within(sources).getByRole("radio", { name: "Qobuz" }))
    expect(props.onSourceChange).toHaveBeenCalledWith("qobuz")
  })
})

describe("PasteLinkField", () => {
  function renderField(resolves: boolean, resolving = false) {
    const props = { id: "paste", onSubmit: jest.fn(async () => resolves), resolving, onClose: jest.fn() }
    render(<PasteLinkField {...props} />)
    return { props, input: screen.getByRole("textbox", { name: "Song link" }) }
  }

  it("takes focus as it opens, and closes on Escape", () => {
    const { props, input } = renderField(true)
    expect(input).toHaveFocus()
    fireEvent.keyDown(input, { key: "Escape" })
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })

  it("asks for nothing until there is a link", () => {
    const { props } = renderField(true)
    const send = screen.getByRole("button", { name: "Download" })
    expect(send).toHaveAttribute("aria-disabled", "true")
    fireEvent.click(send)
    expect(props.onSubmit).not.toHaveBeenCalled()
  })

  it("hands on the link, and closes once it works", async () => {
    const works = renderField(true)
    fireEvent.change(works.input, { target: { value: "https://music.amazon.com/tracks/x" } })
    fireEvent.click(screen.getByRole("button", { name: "Download" }))
    await waitFor(() => expect(works.props.onClose).toHaveBeenCalledTimes(1))
    expect(works.props.onSubmit).toHaveBeenCalledWith("https://music.amazon.com/tracks/x")
  })

  it("stays open when a link doesn't work", async () => {
    const fails = renderField(false)
    fireEvent.change(fails.input, { target: { value: "https://example.com" } })
    fireEvent.click(screen.getByRole("button", { name: "Download" }))
    await waitFor(() => expect(fails.props.onSubmit).toHaveBeenCalledTimes(1))
    expect(fails.props.onClose).not.toHaveBeenCalled()
  })

  it("says so while it looks the link up", () => {
    renderField(true, true)
    expect(screen.getByRole("button", { name: "Finding…" })).toHaveAttribute("aria-disabled", "true")
  })
})

/** The online search's state as the hook hands it over, with nothing done yet. */
function fakeDab(fields: Partial<UseTidalSearchReturn> = {}): UseTidalSearchReturn {
  return {
    searchQuery: "palette",
    setSearchQuery: jest.fn(),
    searchType: "all",
    setSearchType: jest.fn(),
    searchSource: "auto",
    setSearchSource: jest.fn(),
    searchResults: null,
    isSearching: false,
    search: jest.fn(),
    currentView: "search",
    previousView: "search",
    selectedAlbum: null,
    selectedArtist: null,
    isLoadingDetail: false,
    viewAlbum: jest.fn(),
    viewArtist: jest.fn(),
    goBack: jest.fn(),
    downloads: new Map(),
    downloadTrack: jest.fn(),
    downloadFromUrl: jest.fn(),
    isResolvingUrl: false,
    downloadAlbum: jest.fn(),
    cancelDownload: jest.fn(),
    activeDownloadCount: 0,
    isInLibrary: () => false,
    quality: "HI_RES_LOSSLESS",
    setQuality: jest.fn(),
    error: null,
    retry: jest.fn(),
    isOnline: true,
    previewTrackId: null,
    previewIsPlaying: false,
    previewIsLoading: false,
    togglePreview: jest.fn(),
    stopPreview: jest.fn(),
    ...fields,
  }
}

describe("OnlineSearchSidebar", () => {
  it("says it can't search while offline", () => {
    render(<OnlineSearchSidebar dab={fakeDab({ isOnline: false })} layout="desktop" />)
    expect(screen.getByText("You're offline")).toBeInTheDocument()
  })

  it("searches from its own field, where it has one", () => {
    const dab = fakeDab()
    render(<OnlineSearchSidebar dab={dab} layout="phone" />)
    const field = screen.getByRole("searchbox", { name: "Search online" })
    fireEvent.submit(field.closest("form")!)
    expect(dab.search).toHaveBeenCalledTimes(1)
  })

  it("offers to look for words typed since the last search", () => {
    const onSearchPending = jest.fn()
    render(
      <OnlineSearchSidebar
        dab={fakeDab({ searchResults: RESULTS })}
        layout="desktop"
        hideSearch
        pendingQuery="palette iu"
        onSearchPending={onSearchPending}
      />,
    )
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /Search online for “palette iu”/ }))
    expect(onSearchPending).toHaveBeenCalledTimes(1)
  })

  it("says a search failed over the results, and tries again", () => {
    const error: OnlineFailure = {
      title: "Couldn't search online",
      detail: "Check the connection and try again.",
      request: { kind: "search", query: "palette" },
      retryable: true,
    }
    const dab = fakeDab({ searchResults: RESULTS, error })
    render(<OnlineSearchSidebar dab={dab} layout="desktop" hideSearch />)
    expect(screen.getByText("Couldn't search online")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(dab.retry).toHaveBeenCalledTimes(1)
  })

  it("says an album that didn't open is not available, on its own row, and aloud", () => {
    const error: OnlineFailure = {
      title: "This album isn't available",
      detail: "The store didn't send its songs.",
      request: { kind: "album", id: "al-palette" },
      retryable: false,
    }
    render(<OnlineSearchSidebar dab={fakeDab({ searchResults: RESULTS, error })} layout="desktop" hideSearch />)
    const albums = screen.getByRole("region", { name: "Albums 1" })
    expect(within(albums).getByText("Not available")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument()
    expect(screen.getByText("This album isn't available. The store didn't send its songs.")).toHaveAttribute("role", "status")
  })

  it("opens an album over the results, and Back hands focus to the row that opened it", async () => {
    function Harness() {
      const [view, setView] = useState<TidalView>("search")
      const dab = fakeDab({
        searchResults: RESULTS,
        currentView: view,
        selectedAlbum: view === "album" ? ALBUM : null,
        viewAlbum: async () => setView("album"),
        goBack: () => setView("search"),
      })
      return <OnlineSearchSidebar dab={dab} layout="desktop" hideSearch />
    }
    render(<Harness />)

    const albums = screen.getByRole("region", { name: "Albums 1" })
    const row = within(albums).getByRole("button", { name: /Palette/ })
    row.focus()
    await act(async () => {
      fireEvent.click(row)
    })

    const title = await screen.findByRole("heading", { level: 2, name: "Palette" })
    await waitFor(() => expect(title).toHaveFocus())
    expect(screen.getByRole("button", { name: "Results" })).toBeInTheDocument()
    expect(row.closest(".library-layer")).toHaveAttribute("data-covered")

    fireEvent.keyDown(title, { key: "Escape" })
    await waitFor(() => expect(row).toHaveFocus())
    expect(screen.queryByRole("heading", { level: 2, name: "Palette" })).not.toBeInTheDocument()
  })
})
