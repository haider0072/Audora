import { act, renderHook, waitFor } from "@testing-library/react"

import { toast } from "@/hooks/use-toast"
import { useTidalSearch, type UseTidalSearchOptions } from "@/hooks/use-tidal-search"
import { downloadTrack } from "@/lib/download-file"
import { embedFlacMetadata } from "@/lib/flac-art-embedder"
import { MetadataExtractor } from "@/lib/metadata-extractor"
import { PlaylistStorage } from "@/lib/playlist-storage"
import type { Song } from "@/lib/song"
import { TidalService } from "@/lib/tidal-service"
import type { TidalAlbum, TidalDiscographyResult, TidalSearchResult, TidalTrack } from "@/lib/tidal-types"

jest.mock("@/hooks/use-toast", () => ({ toast: jest.fn() }))
jest.mock("@/hooks/use-online-status", () => ({ useOnlineStatus: () => true }))
jest.mock("@/lib/tidal-service", () => ({
  TidalService: { search: jest.fn(), getAlbum: jest.fn(), getDiscography: jest.fn(), getStreamUrl: jest.fn() },
}))
// A download reads tags, stores the file and embeds art; these stand in for
// all of that, so a download can be followed to the song it hands over.
jest.mock("@/lib/metadata-extractor", () => ({ MetadataExtractor: { extractMetadata: jest.fn() } }))
jest.mock("@/lib/playlist-storage", () => ({
  PlaylistStorage: { hasSongFile: jest.fn(), storeSongFile: jest.fn() },
}))
jest.mock("@/lib/flac-art-embedder", () => ({ embedFlacMetadata: jest.fn() }))

const search = jest.mocked(TidalService.search)
const getAlbum = jest.mocked(TidalService.getAlbum)
const getDiscography = jest.mocked(TidalService.getDiscography)

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
const ARTIST = { artist: { id: "ar", name: "IU" }, albums: [] } as unknown as TidalDiscographyResult

function renderSearch() {
  return renderHook(() => useTidalSearch({ songs: [], onSongDownloaded: jest.fn() }))
}

/** A store's answer that comes only when told to. */
function answerLater<T>() {
  let answer: (value: T) => void = () => {}
  const promise = new Promise<T>((resolve) => {
    answer = resolve
  })
  return { promise, answer }
}

beforeEach(() => {
  search.mockReset()
  getAlbum.mockReset()
  getDiscography.mockReset()
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

describe("useTidalSearch, pages over the results", () => {
  it("goes back to the results from however many pages are open", async () => {
    getAlbum.mockResolvedValue(ALBUM)
    getDiscography.mockResolvedValue(ARTIST)
    const { result } = renderSearch()
    await act(() => result.current.viewAlbum("al"))
    await act(() => result.current.viewArtist("ar"))
    expect(result.current).toMatchObject({ currentView: "artist", previousView: "album" })

    act(() => result.current.closePages())
    expect(result.current).toMatchObject({ currentView: "search", previousView: "search" })
  })

  it("drops a page that answers after the results came back", async () => {
    const album = answerLater<TidalAlbum>()
    getAlbum.mockReturnValueOnce(album.promise)
    const { result } = renderSearch()
    let opening: Promise<void> = Promise.resolve()
    act(() => {
      opening = result.current.viewAlbum("al")
    })
    expect(result.current.isLoadingDetail).toBe(true)

    act(() => result.current.closePages())
    expect(result.current.isLoadingDetail).toBe(false)
    await act(async () => {
      album.answer(ALBUM)
      await opening
    })
    expect(result.current).toMatchObject({ currentView: "search", isLoadingDetail: false, error: null })
  })

  it("drops a page that answers after Back", async () => {
    getAlbum.mockResolvedValue(ALBUM)
    const artist = answerLater<TidalDiscographyResult>()
    getDiscography.mockReturnValueOnce(artist.promise)
    const { result } = renderSearch()
    await act(() => result.current.viewAlbum("al"))
    let opening: Promise<void> = Promise.resolve()
    act(() => {
      opening = result.current.viewArtist("ar")
    })

    act(() => result.current.goBack())
    await act(async () => {
      artist.answer(ARTIST)
      await opening
    })
    expect(result.current).toMatchObject({ currentView: "search", isLoadingDetail: false })
  })

  it("opens only the last of two pages asked for at once", async () => {
    const first = answerLater<TidalAlbum>()
    const second = { ...ALBUM, id: "al-2", title: "Lilac" } as TidalAlbum
    getAlbum.mockReturnValueOnce(first.promise).mockResolvedValueOnce(second)
    const { result } = renderSearch()
    let openingFirst: Promise<void> = Promise.resolve()
    act(() => {
      openingFirst = result.current.viewAlbum("al")
    })
    await act(() => result.current.viewAlbum("al-2"))
    await act(async () => {
      first.answer(ALBUM)
      await openingFirst
    })
    expect(result.current).toMatchObject({ currentView: "album", previousView: "search", selectedAlbum: second })
  })
})

describe("useTidalSearch, downloads", () => {
  const TRACK: TidalTrack = {
    id: "bib",
    title: "Back In Black",
    artist: "AC/DC",
    artistId: "acdc",
    albumTitle: "Back In Black",
    albumId: "bib-album",
    // No cover, so the download asks for nothing but the audio.
    albumCover: "",
    releaseDate: "1980-07-25",
    genre: "Rock",
    duration: 255,
    audioQuality: "HI_RES_LOSSLESS",
  }

  /** The stream's answer: one chunk of FLAC, then the end. */
  function audioResponse() {
    let sent = false
    return {
      ok: true,
      status: 200,
      headers: { get: (name: string) => (name === "content-type" ? "audio/flac" : null) },
      body: {
        getReader: () => ({
          read: async () => {
            if (sent) return { done: true, value: undefined }
            sent = true
            return { done: false, value: new Uint8Array([0x66, 0x4c, 0x61, 0x43]) }
          },
        }),
      },
    }
  }

  const originalFetch = global.fetch
  let linkClick: jest.SpyInstance

  beforeAll(() => {
    // jsdom has no object URLs, which a download makes to save its file.
    Object.assign(URL, { createObjectURL: () => "blob:download", revokeObjectURL: () => {} })
  })

  beforeEach(() => {
    jest.mocked(PlaylistStorage.hasSongFile).mockResolvedValue(false)
    jest.mocked(PlaylistStorage.storeSongFile).mockResolvedValue(undefined)
    jest.mocked(MetadataExtractor.extractMetadata).mockRejectedValue(new Error("No tags"))
    jest.mocked(embedFlacMetadata).mockImplementation(async (blob) => blob)
    global.fetch = jest.fn().mockResolvedValue(audioResponse())
    // Saving to the Downloads folder clicks a link, which jsdom cannot follow.
    linkClick = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
  })

  afterEach(() => {
    global.fetch = originalFetch
    linkClick.mockRestore()
  })

  it("hands a finished download to the host's latest callback, under a name the cloud takes", async () => {
    const first = jest.fn<void, [Song]>()
    const latest = jest.fn<void, [Song]>()
    const { result, rerender } = renderHook(
      ({ onSongDownloaded }) => useTidalSearch({ songs: [], onSongDownloaded }),
      { initialProps: { onSongDownloaded: first } },
    )
    rerender({ onSongDownloaded: latest })

    await act(() => result.current.downloadTrack(TRACK))
    await waitFor(() => expect(result.current.downloads.get(TRACK.id)?.status).toBe("complete"))

    expect(first).not.toHaveBeenCalled()
    expect(latest).toHaveBeenCalledTimes(1)
    const [song] = latest.mock.calls[0]
    expect(song).toMatchObject({ id: "tidal-bib", title: "Back In Black", artist: "AC/DC" })
    expect(song.file?.name).toBe("AC-DC - Back In Black.flac")
    expect(PlaylistStorage.storeSongFile).toHaveBeenCalledWith("tidal-bib", song.file)
  })

  describe("straight to the cloud", () => {
    type FetchArgs = [RequestInfo | URL, RequestInit?]
    let fetchMock: jest.Mock<Promise<Response>, FetchArgs>

    /** The server's answer once it has saved a track, or found it already there. */
    function saved(status: "stored" | "exists") {
      return { ok: true, status: 200, json: async () => ({ status, key: "library/x.flac" }) } as unknown as Response
    }

    function renderCloud(props: Partial<UseTidalSearchOptions> = {}) {
      const onSavedToCloud = jest.fn()
      const onSongDownloaded = jest.fn<void, [Song]>()
      const view = renderHook(
        (overrides: Partial<UseTidalSearchOptions>) =>
          useTidalSearch({
            songs: [],
            onSongDownloaded,
            downloadTarget: "cloud",
            cloudReady: true,
            onSavedToCloud,
            ...overrides,
          }),
        { initialProps: props },
      )
      return { ...view, onSavedToCloud, onSongDownloaded }
    }

    const tracks = ["one", "two", "three"].map((id) => ({ ...TRACK, id, title: `Song ${id}` }))

    beforeEach(() => {
      // Calls from earlier tests would read as this one's; what the mocks answer stays.
      jest.clearAllMocks()
      fetchMock = jest.fn<Promise<Response>, FetchArgs>().mockResolvedValue(saved("stored"))
      global.fetch = fetchMock
    })

    it("has the server save the track, keeping nothing here, then lists the library again", async () => {
      const answer = answerLater<Response>()
      fetchMock.mockReturnValue(answer.promise)
      const { result, onSavedToCloud, onSongDownloaded } = renderCloud()

      await act(() => result.current.downloadTrack(TRACK))
      expect(result.current.downloads.get(TRACK.id)?.status).toBe("saving")
      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toBe("/api/cloud/imports")
      expect(init?.method).toBe("POST")
      expect(JSON.parse(String(init?.body))).toEqual(downloadTrack(TRACK))

      await act(async () => answer.answer(saved("stored")))
      await waitFor(() => expect(result.current.downloads.get(TRACK.id)?.status).toBe("complete"))
      expect(onSavedToCloud).toHaveBeenCalledTimes(1)
      expect(toast).toHaveBeenCalledWith({ title: "Saved to the cloud: Back In Black" })
      expect(onSongDownloaded).not.toHaveBeenCalled()
      expect(PlaylistStorage.hasSongFile).not.toHaveBeenCalled()
      expect(PlaylistStorage.storeSongFile).not.toHaveBeenCalled()
      expect(linkClick).not.toHaveBeenCalled()
    })

    it("says so when the cloud already held the track", async () => {
      fetchMock.mockResolvedValue(saved("exists"))
      const { result } = renderCloud()
      await act(() => result.current.downloadTrack(TRACK))
      await waitFor(() => expect(result.current.downloads.get(TRACK.id)?.status).toBe("complete"))
      expect(toast).toHaveBeenCalledWith({ title: "Already in the cloud: Back In Black" })
    })

    it("says why a save failed, as the server put it", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => ({ error: "The source could not send the song" }),
      } as unknown as Response)
      const { result, onSavedToCloud } = renderCloud()
      jest.spyOn(console, "error").mockImplementation(() => {})

      await act(() => result.current.downloadTrack(TRACK))
      await waitFor(() => expect(result.current.downloads.get(TRACK.id)?.status).toBe("error"))
      expect(result.current.downloads.get(TRACK.id)?.error).toBe("The source could not send the song")
      expect(toast).toHaveBeenCalledWith({ title: "Couldn't save to the cloud: Back In Black", variant: "destructive" })
      expect(onSavedToCloud).not.toHaveBeenCalled()
      jest.mocked(console.error).mockRestore()
    })

    it("refuses while the cloud library is signed out, saying so once even for an album", async () => {
      const { result } = renderCloud({ cloudReady: false })

      await act(() => result.current.downloadTrack(TRACK))
      await act(() => result.current.downloadAlbum({ ...ALBUM, tracks }))
      expect(fetchMock).not.toHaveBeenCalled()
      expect(result.current.downloads.size).toBe(0)
      const refusals = jest.mocked(toast).mock.calls.filter(([shown]) => shown.title === "Sign in to the cloud library to save there")
      expect(refusals).toHaveLength(2)
    })

    it("stops the save on the server too when it is stopped", async () => {
      let signal: AbortSignal | undefined
      fetchMock.mockImplementation((_url, init) => {
        signal = init?.signal ?? undefined
        return new Promise((_resolve, reject) =>
          signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))),
        )
      })
      const { result, onSavedToCloud } = renderCloud()

      await act(() => result.current.downloadTrack(TRACK))
      act(() => result.current.cancelDownload(TRACK.id))
      expect(signal?.aborted).toBe(true)
      await waitFor(() => expect(result.current.downloads.get(TRACK.id)?.status).toBe("cancelled"))
      expect(onSavedToCloud).not.toHaveBeenCalled()
    })

    it("sends a waiting download where it was asked to go, after the setting changes", async () => {
      const answers = tracks.map(() => answerLater<Response>())
      answers.forEach((answer) => fetchMock.mockReturnValueOnce(answer.promise))
      const { result, rerender } = renderCloud()

      for (const track of tracks) await act(() => result.current.downloadTrack(track))
      // Two at a time, so the third waits its turn.
      expect(result.current.downloads.get("three")?.status).toBe("queued")
      rerender({ downloadTarget: "device" })

      await act(async () => answers[0].answer(saved("stored")))
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
      expect(fetchMock.mock.calls[2][0]).toBe("/api/cloud/imports")
      expect(result.current.downloads.get("three")?.status).toBe("saving")
    })

    it("takes a waiting download out of the queue when it is stopped", async () => {
      const answers = tracks.map(() => answerLater<Response>())
      answers.forEach((answer) => fetchMock.mockReturnValueOnce(answer.promise))
      const { result } = renderCloud()

      for (const track of tracks) await act(() => result.current.downloadTrack(track))
      act(() => result.current.cancelDownload("three"))
      await act(async () => {
        answers[0].answer(saved("stored"))
        answers[1].answer(saved("stored"))
      })

      await waitFor(() => expect(result.current.downloads.get("two")?.status).toBe("complete"))
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(result.current.downloads.get("three")?.status).toBe("cancelled")
    })
  })
})

describe("useTidalSearch, what the library holds", () => {
  const TRACK = { id: "bib", title: "Back In Black", artist: "AC/DC", albumTitle: "Back In Black" } as TidalTrack

  function holding(songs: Partial<Song>[]) {
    const { result } = renderHook(() => useTidalSearch({ songs: songs as Song[], onSongDownloaded: jest.fn() }))
    return result.current.isInLibrary
  }

  it("knows a download to this device by the id it was given", () => {
    expect(holding([{ id: "tidal-bib" }])(TRACK)).toBe(true)
  })

  it.each([
    ["saved straight to the cloud", "AC-DC - Back In Black.flac", "Back In Black"],
    ["that came as AAC", "AC-DC - Back In Black.m4a", "Back In Black"],
    ["named in another case", "ac-dc - back in black.FLAC", "BACK IN BLACK"],
  ])("knows a song %s by the name its download is given, on its album", (_label, fileName, album) => {
    expect(holding([{ id: "cloud-1", fileName, album }])(TRACK)).toBe(true)
  })

  it("does not take a song of the same name on another album for it, as with an intro", () => {
    const intro = { ...TRACK, title: "Intro", albumTitle: "Second" }
    expect(holding([{ id: "cloud-1", fileName: "AC-DC - Intro.flac", album: "First" }])(intro)).toBe(false)
  })

  it("does not take another song for it", () => {
    const songs = [{ id: "cloud-1", fileName: "AC-DC - Hells Bells.flac", album: "Back In Black" }, { id: "tidal-hb" }]
    expect(holding(songs)(TRACK)).toBe(false)
  })
})
