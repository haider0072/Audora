import { act, renderHook } from "@testing-library/react"

import { useAudioEngine } from "@/hooks/use-audio-engine"
import { DEFAULT_EQUALIZER_BANDS } from "@/hooks/use-equalizer-manager"

function renderEngine() {
  const primary = document.createElement("audio")
  const secondary = document.createElement("audio")
  const audioRef = { current: primary }
  const secondaryAudioRef = { current: secondary }
  const hook = renderHook(() =>
    useAudioEngine({ audioRef, secondaryAudioRef, equalizerBands: DEFAULT_EQUALIZER_BANDS }),
  )
  return { ...hook, primary, secondary }
}

describe("useAudioEngine and pauses it did not make", () => {
  it("shows the song as paused when something else pauses it", () => {
    const { result, primary } = renderEngine()
    act(() => result.current.setIsPlaying(true))

    act(() => {
      primary.dispatchEvent(new Event("pause"))
    })

    expect(result.current.isPlaying).toBe(false)
  })

  it("ignores the idle element pausing, as a faded-out track does", () => {
    const { result, secondary } = renderEngine()
    act(() => result.current.setIsPlaying(true))

    act(() => {
      secondary.dispatchEvent(new Event("pause"))
    })

    expect(result.current.isPlaying).toBe(true)
  })

  it("leaves a song reaching its end to the end handler, which advances", () => {
    const onEnded = jest.fn()
    const primary = document.createElement("audio")
    const audioRef = { current: primary }
    const { result } = renderHook(() =>
      useAudioEngine({ audioRef, equalizerBands: DEFAULT_EQUALIZER_BANDS, onEnded }),
    )
    act(() => result.current.setIsPlaying(true))
    Object.defineProperty(primary, "ended", { configurable: true, get: () => true })

    act(() => {
      primary.dispatchEvent(new Event("pause"))
    })
    expect(result.current.isPlaying).toBe(true)
    expect(onEnded).not.toHaveBeenCalled()

    act(() => {
      primary.dispatchEvent(new Event("ended"))
    })
    expect(onEnded).toHaveBeenCalledTimes(1)
  })

  it("stops listening to both elements once unmounted", () => {
    const { primary, secondary, unmount } = renderEngine()
    const removed = [jest.spyOn(primary, "removeEventListener"), jest.spyOn(secondary, "removeEventListener")]

    unmount()

    for (const spy of removed) {
      expect(spy).toHaveBeenCalledWith("pause", expect.any(Function))
      expect(spy).toHaveBeenCalledWith("ended", expect.any(Function))
    }
  })
})
