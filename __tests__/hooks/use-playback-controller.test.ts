import { act, renderHook } from "@testing-library/react"
import { useState } from "react"

import type { Song } from "@/components/enhanced-playlist"
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
}

function setup({ playing = null, crossfade = async () => false, isPreloaded = false }: Setup = {}) {
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

  const hook = renderHook(() => {
    const [currentSong, setCurrentSong] = useState<Song | null>(playing)
    const playlist = {
      currentSong,
      setCurrentSong,
      setSongs: jest.fn(),
      sortedSongs: songs,
      getNextSong: () => songs[1],
      getPreviousSong: () => songs[0],
      notifySongSelected: jest.fn(),
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
    return { ...controller, currentSong, events }
  })
  return { hook, songs, engine, audio }
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
})
