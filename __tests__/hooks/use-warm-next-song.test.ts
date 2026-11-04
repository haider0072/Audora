import { renderHook } from "@testing-library/react"

import { useWarmNextSong } from "@/hooks/use-warm-next-song"
import type { Song } from "@/components/enhanced-playlist"
import { warmSong } from "@/lib/song-warmup"

jest.mock("@/lib/song-warmup", () => ({ warmSong: jest.fn() }))

const next = { id: "next", url: "", cloud: { key: "library/n.flac", streamUrl: "https://r2.test/n" } } as Song

describe("useWarmNextSong", () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.mocked(warmSong).mockClear()
  })
  afterEach(() => jest.useRealTimers())

  it("warms the next song a moment after the current one starts playing", () => {
    renderHook(() => useWarmNextSong("current", true, () => next))
    jest.advanceTimersByTime(2_999)
    expect(warmSong).not.toHaveBeenCalled()
    jest.advanceTimersByTime(1)
    expect(warmSong).toHaveBeenCalledWith(next)
  })

  it("does nothing while paused", () => {
    renderHook(() => useWarmNextSong("current", false, () => next))
    jest.advanceTimersByTime(10_000)
    expect(warmSong).not.toHaveBeenCalled()
  })

  it("starts over when the song changes before the moment passes", () => {
    const { rerender } = renderHook(({ id }) => useWarmNextSong(id, true, () => next), {
      initialProps: { id: "first" },
    })
    jest.advanceTimersByTime(2_000)
    rerender({ id: "second" })
    jest.advanceTimersByTime(2_000)
    expect(warmSong).not.toHaveBeenCalled()
    jest.advanceTimersByTime(1_000)
    expect(warmSong).toHaveBeenCalledTimes(1)
  })
})
