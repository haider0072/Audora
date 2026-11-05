import { act, renderHook } from "@testing-library/react"
import { useState } from "react"

import type { Song } from "@/lib/song"
import { usePlaybackController, useTransportEvents } from "@/hooks/use-playback-controller"
import { toast } from "@/hooks/use-toast"
import { waitForCanPlay } from "@/lib/utils"

jest.mock("@/hooks/use-toast", () => ({ toast: jest.fn() }))
jest.mock("@/lib/loudness-analyzer", () => ({ LoudnessAnalyzer: { analyze: jest.fn() } }))
jest.mock("@/lib/media-source", () => ({
  songSource: (song: { file?: File } | null) => (song?.file ? { kind: "file", file: song.file } : null),
  createMediaUrl: (source: { file: File }) => `blob:${source.file.name}`,
  releaseMediaUrl: jest.fn(),
}))
jest.mock("@/lib/utils", () => ({
  ...jest.requireActual("@/lib/utils"),
  waitForCanPlay: jest.fn(),
}))

function makeSong(id: string): Song {
  return { id, title: `Song ${id}`, url: "", file: new File([""], `${id}.flac`) } as Song
}

/** A promise and its resolvers, to hold an engine call open. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

interface Setup {
  playing?: Song | null
  crossfade?: (source: unknown, signal?: AbortSignal) => Promise<boolean>
  isPreloaded?: boolean
  /** The library to start from, when it should not be the three test songs. */
  library?: Song[]
}

function setup({ playing = null, crossfade = async () => false, isPreloaded = false, library }: Setup = {}) {
  const songs = ["a", "b", "c"].map(makeSong)
  const audio = {
    src: "",
    pause: jest.fn(),
    load: jest.fn(),
    play: jest.fn(() => Promise.resolve()),
  } as unknown as HTMLAudioElement

  const engine = {
    isPlaying: playing !== null,
    setIsPlaying: jest.fn(),
    playPromiseRef: { current: null },
    initializeAudioContext: jest.fn(),
    play: jest.fn(() => Promise.resolve()),
    pause: jest.fn(),
    applyNormalization: jest.fn(),
    preloadNextSong: jest.fn(),
    swapToPreloaded: jest.fn(() => true),
    resetGaplessState: jest.fn(),
    isPreloaded,
    crossfadeTo: jest.fn(crossfade),
  }

  const notifySongSelected = jest.fn()
  const hook = renderHook(() => {
    const [currentSong, setCurrentSong] = useState<Song | null>(playing)
    // Changes when the cloud library arrives.
    const [sortedSongs, setLibrary] = useState<Song[]>(library ?? songs)
    const playlist = {
      currentSong,
      setCurrentSong,
      setSongs: jest.fn(),
      sortedSongs,
      getNextSong: () => songs[1],
      getPreviousSong: () => songs[0],
      notifySongSelected,
    }
    const events = useTransportEvents()
    const controller = usePlaybackController({
      audioRef: { current: audio },
      // The controller reads only the members mocked here.
      engine: engine as never,
      playlist: playlist as never,
      normalizationEnabled: false,
      preloadUpcomingSongs: jest.fn(),
      isFollowingRef: { current: false },
      events,
    })
    return { ...controller, currentSong, events, setLibrary }
  })
  return { hook, songs, engine, audio, notifySongSelected }
}

beforeEach(() => {
  jest.mocked(waitForCanPlay).mockReset().mockResolvedValue(undefined)
  jest.mocked(toast).mockClear()
})

describe("usePlaybackController", () => {
  it("shows a pick at once and keeps it loading until the crossfade lands", async () => {
    const fade = deferred<boolean>()
    const { hook, songs } = setup({ playing: makeSong("x"), crossfade: () => fade.promise })

    act(() => void hook.result.current.selectSong(songs[1]))

    expect(hook.result.current.displaySong?.id).toBe("b")
    expect(hook.result.current.isLoading).toBe(true)
    expect(hook.result.current.currentSong?.id).toBe("x") // still the one you hear

    await act(async () => fade.resolve(true))

    expect(hook.result.current.currentSong?.id).toBe("b")
    expect(hook.result.current.displaySong?.id).toBe("b")
    expect(hook.result.current.isLoading).toBe(false)
  })

  it("lets a newer pick keep the screen when an older one finishes late", async () => {
    const fades = [deferred<boolean>(), deferred<boolean>()]
    let call = 0
    const { hook, songs } = setup({ playing: makeSong("x"), crossfade: () => fades[call++].promise })

    act(() => void hook.result.current.selectSong(songs[0]))
    await act(async () => {}) // let the first pick reach the crossfade
    act(() => void hook.result.current.selectSong(songs[2]))
    await act(async () => {})

    await act(async () => fades[0].resolve(true))
    expect(hook.result.current.displaySong?.id).toBe("c")
    expect(hook.result.current.isLoading).toBe(true)
    expect(hook.result.current.currentSong?.id).toBe("x")

    await act(async () => fades[1].resolve(true))
    expect(hook.result.current.currentSong?.id).toBe("c")
    expect(hook.result.current.isLoading).toBe(false)
  })

  it("loads from silence into the primary element and clears the loading state once it plays", async () => {
    const ready = deferred<void>()
    jest.mocked(waitForCanPlay).mockReturnValue(ready.promise)
    const { hook, songs, audio } = setup()

    act(() => void hook.result.current.selectSong(songs[0]))
    await act(async () => {})

    expect(hook.result.current.isLoading).toBe(true)
    expect(audio.src).toBe("blob:a.flac")

    await act(async () => ready.resolve())

    expect(audio.play).toHaveBeenCalled()
    expect(hook.result.current.isLoading).toBe(false)
    expect(hook.result.current.displaySong?.id).toBe("a")
  })

  it("reports a song that fails to load and stops showing it as loading", async () => {
    jest.mocked(waitForCanPlay).mockRejectedValue(new Error("Failed to load audio"))
    jest.spyOn(console, "error").mockImplementation(() => {})
    const { hook, songs, engine } = setup()

    await act(async () => void (await hook.result.current.selectSong(songs[0])))

    expect(hook.result.current.isLoading).toBe(false)
    expect(engine.setIsPlaying).toHaveBeenLastCalledWith(false)
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }))
    jest.mocked(console.error).mockRestore()
  })

  it("asks for a tap, without an error, when the browser blocks playback", async () => {
    const { hook, songs, audio } = setup()
    jest.mocked(audio.play).mockRejectedValue(new DOMException("blocked", "NotAllowedError"))

    await act(async () => void (await hook.result.current.selectSong(songs[0])))

    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Tap play to start" }))
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }))
  })

  it("swaps a preloaded next song in without a loading state", async () => {
    const { hook, songs, engine } = setup({ playing: makeSong("x"), isPreloaded: true })

    // The engine reports the end of the track: the controller preloads the next song...
    act(() => hook.result.current.events.handlers.current.nearEnd())
    expect(engine.preloadNextSong).toHaveBeenCalled()

    // ...and the song ending advances to it.
    await act(async () => hook.result.current.events.handlers.current.ended())

    expect(engine.swapToPreloaded).toHaveBeenCalled()
    expect(engine.crossfadeTo).not.toHaveBeenCalled()
    expect(hook.result.current.currentSong?.id).toBe(songs[1].id)
    expect(hook.result.current.isLoading).toBe(false)
  })

  it("reads a pick earlier in the list as a skip back, and a later one as forward", async () => {
    const { hook, songs } = setup()
    await act(async () => void (await hook.result.current.selectSong(songs[2])))

    await act(async () => hook.result.current.handleSongSelect(songs[0]))
    expect(hook.result.current.direction).toBe(-1)

    await act(async () => hook.result.current.handleSongSelect(songs[1]))
    expect(hook.result.current.direction).toBe(1)
  })

  it("plays a queued song picked from the queue as one off the queue", async () => {
    const { hook, songs, notifySongSelected } = setup({ playing: makeSong("x"), crossfade: async () => true })
    await act(async () => hook.result.current.playFromQueue(songs[2]))
    expect(notifySongSelected).toHaveBeenLastCalledWith(songs[2], false, true)
  })

  it("plays a pick from the list as a pick, and an advance as one off the queue where it was queued", async () => {
    const { hook, songs, notifySongSelected } = setup({ playing: makeSong("x"), crossfade: async () => true })
    await act(async () => hook.result.current.handleSongSelect(songs[2]))
    expect(notifySongSelected).toHaveBeenLastCalledWith(songs[2], false, false)

    await act(async () => hook.result.current.skipToNext())
    expect(notifySongSelected).toHaveBeenLastCalledWith(songs[1], true, true)
  })
})

describe("usePlaybackController resuming the last session", () => {
  it("brings back a song stored on this device at once, paused, with its source loading", () => {
    const { hook, songs, engine, audio } = setup()

    act(() => hook.result.current.resumeSession(songs[1], songs[1].id))

    expect(hook.result.current.currentSong?.id).toBe("b")
    expect(audio.src).toBe("blob:b.flac")
    expect(audio.load).toHaveBeenCalledTimes(1)
    expect(engine.play).not.toHaveBeenCalled()
  })

  it("waits for a song that lives only in the cloud, and brings it back when the cloud library arrives", () => {
    const { hook, audio } = setup({ library: [] })

    act(() => hook.result.current.resumeSession(null, "cloud"))
    expect(hook.result.current.currentSong).toBeNull()

    act(() => hook.result.current.setLibrary([makeSong("other"), makeSong("cloud")]))

    expect(hook.result.current.currentSong?.id).toBe("cloud")
    expect(audio.src).toBe("blob:cloud.flac")
    expect(audio.load).toHaveBeenCalledTimes(1)
  })

  it("keeps a song picked before the cloud library arrives", async () => {
    const { hook, songs } = setup({ library: [] })
    act(() => hook.result.current.resumeSession(null, "cloud"))

    await act(async () => void (await hook.result.current.selectSong(songs[0])))
    act(() => hook.result.current.setLibrary([songs[0], makeSong("cloud")]))

    expect(hook.result.current.currentSong?.id).toBe("a")
  })

  it("leaves the player empty when nothing was saved", () => {
    const { hook, audio } = setup()

    act(() => hook.result.current.resumeSession(null, undefined))

    expect(hook.result.current.currentSong).toBeNull()
    expect(audio.load).not.toHaveBeenCalled()
  })
})
