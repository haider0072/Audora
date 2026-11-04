type Warmer = typeof import("@/lib/cloud/audio-warmer")["audioWarmer"]

/** A fresh warmer per test: the module holds a singleton. */
function freshWarmer(): Warmer {
  let warmer!: Warmer
  jest.isolateModules(() => {
    warmer = jest.requireActual<typeof import("@/lib/cloud/audio-warmer")>("@/lib/cloud/audio-warmer").audioWarmer
  })
  return warmer
}

describe("audioWarmer", () => {
  let load: jest.SpyInstance

  beforeEach(() => {
    jest.useFakeTimers()
    // jsdom does not implement media loading.
    load = jest.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {})
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  /** Elements `load()` was called on while they had a source. */
  const loadedSources = () =>
    (load.mock.contexts as HTMLAudioElement[]).map((element) => element.getAttribute("src")).filter(Boolean)

  it("loads a song in a muted element that shares the player's CORS mode", () => {
    freshWarmer().warm("https://r2.test/a.flac")
    const element = load.mock.contexts[0] as HTMLAudioElement
    expect(element.getAttribute("src")).toBe("https://r2.test/a.flac")
    expect(element.muted).toBe(true)
    expect(element.crossOrigin).toBe("anonymous")
  })

  it("does not warm a song that is already loading", () => {
    const warmer = freshWarmer()
    warmer.warm("https://r2.test/a.flac")
    warmer.warm("https://r2.test/a.flac")
    expect(loadedSources()).toEqual(["https://r2.test/a.flac"])
  })

  it("lets the newest intent take the longest-running slot", () => {
    const warmer = freshWarmer()
    warmer.warm("https://r2.test/a.flac")
    jest.advanceTimersByTime(10)
    warmer.warm("https://r2.test/b.flac")
    jest.advanceTimersByTime(10)
    warmer.warm("https://r2.test/c.flac")

    const elements = new Set(load.mock.contexts as HTMLAudioElement[])
    expect(elements.size).toBe(2)
    const sources = [...elements].map((element) => element.getAttribute("src"))
    expect(sources.sort()).toEqual(["https://r2.test/b.flac", "https://r2.test/c.flac"])
  })

  it("releases the element once playback could start, and remembers the song", () => {
    const warmer = freshWarmer()
    warmer.warm("https://r2.test/a.flac")
    const element = load.mock.contexts[0] as HTMLAudioElement

    element.dispatchEvent(new Event("canplay"))
    expect(element.getAttribute("src")).toBeNull()

    load.mockClear()
    warmer.warm("https://r2.test/a.flac")
    expect(load).not.toHaveBeenCalled()
  })

  it("gives up on a warm-up that never becomes playable", () => {
    freshWarmer().warm("https://r2.test/slow.flac")
    const element = load.mock.contexts[0] as HTMLAudioElement
    jest.advanceTimersByTime(10_000)
    expect(element.getAttribute("src")).toBeNull()
  })
})
