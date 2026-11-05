import { useState } from "react"
import { act, renderHook } from "@testing-library/react"

import { useLibraryNavigation } from "@/hooks/use-library-navigation"
import type { LibraryPage } from "@/lib/library-pages"
import type { Song } from "@/lib/song"

function song(id: string, artist: string, album: string): Song {
  return { id, url: `blob:${id}`, title: id, artist, album } as Song
}

const LIBRARY = [song("a", "Air", "Moon Safari"), song("b", "Beach House", "Bloom")]
const AIR: LibraryPage = { kind: "artist", artist: "Air" }
const MOON: LibraryPage = { kind: "album", artist: "Air", album: "Moon Safari" }
const BLOOM: LibraryPage = { kind: "album", artist: "Beach House", album: "Bloom" }

function renderNavigation(songs: Song[] = LIBRARY, query = "") {
  return renderHook(({ songs, query }) => useLibraryNavigation(songs, query), { initialProps: { songs, query } })
}

describe("useLibraryNavigation", () => {
  it("starts on the list", () => {
    const { result } = renderNavigation()
    expect(result.current.stack).toEqual([])
  })

  it("opens pages on top of each other, and goes back one at a time", () => {
    const { result } = renderNavigation()
    act(() => result.current.open(AIR))
    act(() => result.current.open(MOON))
    expect(result.current.stack).toEqual([AIR, MOON])
    act(() => result.current.back())
    expect(result.current.stack).toEqual([AIR])
  })

  it("shows a page asked for from elsewhere over the list alone", () => {
    const { result } = renderNavigation()
    act(() => result.current.open(AIR))
    act(() => result.current.open(MOON))
    act(() => result.current.show(BLOOM))
    expect(result.current.stack).toEqual([BLOOM])
  })

  it("keeps a page shown under the search that changes in the same moment", () => {
    const { result } = renderHook(() => {
      const [query, setQuery] = useState("air")
      return { setQuery, navigation: useLibraryNavigation(LIBRARY, query) }
    })
    act(() => {
      result.current.setQuery("")
      result.current.navigation.show(BLOOM, "")
    })
    expect(result.current.navigation.stack).toEqual([BLOOM])
  })

  it("goes back to the list when the search changes", () => {
    const { result, rerender } = renderNavigation()
    act(() => result.current.open(AIR))
    rerender({ songs: LIBRARY, query: "bloom" })
    expect(result.current.stack).toEqual([])
  })

  it("closes only the pages whose songs are gone", () => {
    const { result, rerender } = renderNavigation()
    act(() => result.current.open(AIR))
    act(() => result.current.open(BLOOM))
    rerender({ songs: [LIBRARY[0]], query: "" })
    expect(result.current.stack).toEqual([AIR])
  })

  it("keeps its identity while nothing about it changes", () => {
    const { result, rerender } = renderNavigation()
    act(() => result.current.open(AIR))
    const before = result.current
    rerender({ songs: [...LIBRARY], query: "" })
    expect(result.current.stack).toBe(before.stack)
    expect(result.current.back).toBe(before.back)
  })
})
