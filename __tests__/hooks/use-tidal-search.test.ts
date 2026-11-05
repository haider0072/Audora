import { act, renderHook, waitFor } from "@testing-library/react"

import { useTidalSearch } from "@/hooks/use-tidal-search"
import { TidalService } from "@/lib/tidal-service"
import type { TidalAlbum, TidalSearchResult } from "@/lib/tidal-types"

jest.mock("@/hooks/use-toast", () => ({ toast: jest.fn() }))
jest.mock("@/hooks/use-online-status", () => ({ useOnlineStatus: () => true }))
jest.mock("@/lib/tidal-service", () => ({
  TidalService: { search: jest.fn(), getAlbum: jest.fn(), getDiscography: jest.fn(), getStreamUrl: jest.fn() },
}))
// Downloads write to storage and embed art; none of that is under test here.
jest.mock("@/lib/metadata-extractor", () => ({ MetadataExtractor: {} }))
jest.mock("@/lib/playlist-storage", () => ({ PlaylistStorage: {} }))
jest.mock("@/lib/flac-art-embedder", () => ({ embedFlacMetadata: jest.fn() }))

const search = jest.mocked(TidalService.search)
const getAlbum = jest.mocked(TidalService.getAlbum)

function results(fields: Partial<TidalSearchResult> = {}): TidalSearchResult {
  return {
    tracks: [],
    albums: [],
    artists: [],
    pagination: { total: 0, limit: 20, hasMore: false, loaded: 0 },
    query: "palette",
    searchType: "all",
    ...fields,
  }
}

const ALBUM = { id: "al", title: "Palette", artist: "IU", artistId: "ar", tracks: [] } as unknown as TidalAlbum

function renderSearch() {
  return renderHook(() => useTidalSearch({ songs: [], onSongDownloaded: jest.fn() }))
}

beforeEach(() => {
  search.mockReset()
  getAlbum.mockReset()
  localStorage.clear()
})

describe("useTidalSearch, searching", () => {
  it("says plainly when a search fails, and tries it again", async () => {
    search.mockResolvedValueOnce(null)
    const { result } = renderSearch()
    await act(() => result.current.search("  palette "))
    expect(search).toHaveBeenLastCalledWith("palette", "all", 20, "auto")
    expect(result.current.error).toMatchObject({ title: "Couldn't search online", retryable: true })

    search.mockResolvedValueOnce(results())
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.searchResults).toEqual(results()))
    expect(result.current.error).toBeNull()
    expect(search).toHaveBeenCalledTimes(2)
  })

  it("says how long to wait when searches come too fast", async () => {
    search.mockRejectedValueOnce(new Error("rate_limited:12"))
    const { result } = renderSearch()
    await act(() => result.current.search("palette"))
    expect(result.current.error).toMatchObject({ title: "Too many searches at once", detail: "Try again in 12 seconds." })
  })

  it("drops a search that answers after a later one", async () => {
    let answerFirst: (answer: TidalSearchResult) => void = () => {}
    search.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answerFirst = resolve
        }),
    )
    search.mockResolvedValueOnce(results({ query: "rose" }))
    const { result } = renderSearch()

    let first: Promise<void> = Promise.resolve()
    act(() => {
      first = result.current.search("palette")
    })
    await act(() => result.current.search("rose"))
    await act(async () => {
      answerFirst(results({ query: "palette" }))
      await first
    })
    expect(result.current.searchResults?.query).toBe("rose")
    expect(result.current.isSearching).toBe(false)
  })
})

describe("useTidalSearch, choosing what to show and where to look", () => {
  it("filters results that hold every kind without looking again", async () => {
    search.mockResolvedValue(results())
    const { result } = renderSearch()
    await act(() => result.current.search("palette"))
    search.mockClear()

    act(() => result.current.setSearchType("artist"))
    expect(result.current.searchType).toBe("artist")
    expect(search).not.toHaveBeenCalled()
  })

  it("looks again for a kind the results don't hold", async () => {
    search.mockResolvedValue(results({ searchType: "track" }))
    const { result } = renderSearch()
    act(() => result.current.setSearchType("track"))
    await act(() => result.current.search("palette"))
    search.mockClear()

    await act(async () => result.current.setSearchType("album"))
    expect(search).toHaveBeenCalledWith("palette", "album", 20, "auto")
  })

  it("looks again in the place chosen, and remembers the choice", async () => {
    search.mockResolvedValue(results())
    const { result } = renderSearch()
    await act(() => result.current.search("palette"))
    search.mockClear()

    await act(async () => result.current.setSearchSource("qobuz"))
    expect(search).toHaveBeenCalledWith("palette", "all", 20, "qobuz")
    expect(localStorage.getItem("audora_search_source")).toBe("qobuz")

    search.mockClear()
    act(() => result.current.setSearchSource("qobuz"))
    expect(search).not.toHaveBeenCalled()
  })
})

describe("useTidalSearch, albums", () => {
  it("opens an album over the results, and Back returns to them", async () => {
    getAlbum.mockResolvedValue(ALBUM)
    const { result } = renderSearch()
    await act(() => result.current.viewAlbum("al"))
    expect(result.current.currentView).toBe("album")
    expect(result.current.selectedAlbum).toBe(ALBUM)
    expect(result.current.previousView).toBe("search")

    act(() => result.current.goBack())
    expect(result.current.currentView).toBe("search")
  })

  it("tells an album the store hasn't got from one that failed to load, and asks again only for that", async () => {
    getAlbum.mockResolvedValueOnce(null)
    const { result } = renderSearch()
    await act(() => result.current.viewAlbum("al"))
    expect(result.current.error).toMatchObject({
      title: "This album isn't available",
      request: { kind: "album", id: "al" },
      retryable: false,
    })
    expect(result.current.currentView).toBe("search")

    const logged = jest.spyOn(console, "error").mockImplementation(() => {})
    getAlbum.mockRejectedValueOnce(new Error("Album request failed: 500"))
    await act(() => result.current.viewAlbum("al"))
    expect(result.current.error).toMatchObject({ title: "Couldn't open the album", retryable: true })
    expect(logged).toHaveBeenCalled()
    logged.mockRestore()

    getAlbum.mockResolvedValueOnce(ALBUM)
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.currentView).toBe("album"))
  })
})
