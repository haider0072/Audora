import { fireEvent, render, screen } from "@testing-library/react"

import { SearchPane } from "@/components/desktop/search-pane"
import { GLANCE_SONGS } from "@/lib/library-search"
import type { Song } from "@/lib/song"
import { stubLibraryDom } from "@/testing/library-dom"
import { fakeOnlineSearch } from "@/testing/online-search"

stubLibraryDom()

function song(n: number): Song {
  return { id: `air-${n}`, url: `blob:air-${n}`, title: `Air ${n}`, artist: "Air", album: "Moon Safari", duration: 200 } as Song
}

/** More matches than the results show at a glance, so the rest are under Show all. */
const LIBRARY = Array.from({ length: GLANCE_SONGS + 2 }, (_, i) => song(i + 1))

function renderPane() {
  return render(
    <SearchPane
      query="air"
      songs={LIBRARY}
      viewMode="list"
      onViewModeChange={jest.fn()}
      onSelect={jest.fn()}
      actions={{ playNext: jest.fn(), addToQueue: jest.fn(), removeSong: jest.fn() }}
      onShowPage={jest.fn()}
      online={fakeOnlineSearch({ isOnline: false })}
      onSearchPending={jest.fn()}
    />,
  )
}

describe("SearchPane", () => {
  it("hands focus to Back as every match covers Show all, and back to Show all after", () => {
    renderPane()
    const showAll = screen.getByRole("button", { name: "Show all" })
    showAll.focus()
    fireEvent.click(showAll)
    const back = screen.getByRole("button", { name: "Back to Results" })
    expect(back).toHaveFocus()

    fireEvent.click(back)
    expect(screen.getByRole("button", { name: "Show all" })).toHaveFocus()
  })
})
