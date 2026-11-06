import { act, renderHook, waitFor } from "@testing-library/react"

import { useCloudLibrary } from "@/hooks/use-cloud-library"
import { cloudUploads } from "@/lib/cloud/upload-queue"

jest.mock("@/lib/cloud/library-snapshot", () => ({
  readLibrarySnapshot: jest.fn().mockResolvedValue(null),
  saveLibrarySnapshot: jest.fn().mockResolvedValue(undefined),
  clearLibrarySnapshot: jest.fn().mockResolvedValue(undefined),
}))
jest.mock("@/lib/cloud/preconnect", () => ({ preconnect: jest.fn() }))
jest.mock("@/lib/cloud/thumbnail-prefetch", () => ({ prefetchThumbnails: jest.fn().mockResolvedValue(undefined) }))
jest.mock("@/lib/cloud/upload-queue", () => ({ cloudUploads: { add: jest.fn() } }))

const SONG_FILE = new File([new Uint8Array([0x66, 0x4c, 0x61, 0x43])], "IU - Palette.flac", { type: "audio/flac" })

function answer(body: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: async () => body })
}

/** The server as it stands for this device: its session, and an empty library. */
function serve(session: { configured: boolean; authenticated: boolean }) {
  global.fetch = jest.fn((url: string) =>
    url === "/api/cloud/session" ? answer(session) : answer({ songs: [], pending: 0, outdated: 0 }),
  ) as unknown as typeof fetch
}

function renderLibrary() {
  return renderHook(() => useCloudLibrary({ isReady: true, songCount: 0, setSongs: jest.fn() }))
}

const originalFetch = global.fetch

afterEach(() => {
  global.fetch = originalFetch
  jest.mocked(cloudUploads.add).mockClear()
})

describe("useCloudLibrary, uploads", () => {
  it("sends files up while this device is signed in", async () => {
    serve({ configured: true, authenticated: true })
    const { result } = renderLibrary()
    await waitFor(() => expect(result.current.status).toBe("ready"))

    act(() => result.current.upload([SONG_FILE]))
    expect(cloudUploads.add).toHaveBeenCalledWith([SONG_FILE])
  })

  it.each([
    ["signed out", { configured: true, authenticated: false }, "signed-out"],
    ["without a cloud library", { configured: false, authenticated: false }, "unavailable"],
  ])("sends nothing while %s", async (_, session, status) => {
    serve(session)
    const { result } = renderLibrary()
    await waitFor(() => expect(result.current.status).toBe(status))

    act(() => result.current.upload([SONG_FILE]))
    expect(cloudUploads.add).not.toHaveBeenCalled()
  })

  it("sends nothing before the server has said whether it is signed in", () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch
    const { result, unmount } = renderLibrary()
    expect(result.current.status).toBe("loading")

    act(() => result.current.upload([SONG_FILE]))
    expect(cloudUploads.add).not.toHaveBeenCalled()
    unmount()
  })
})
