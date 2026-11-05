import { act, renderHook, waitFor } from "@testing-library/react"

import { useLibraryStorage } from "@/hooks/use-library-storage"
import { toast } from "@/hooks/use-toast"
import { PlaylistStorage, type StorageInfo } from "@/lib/playlist-storage"
import { VideoCache } from "@/lib/video-cache"

jest.mock("@/hooks/use-toast", () => ({ toast: jest.fn() }))
jest.mock("@/lib/playlist-storage", () => ({
  PlaylistStorage: {
    getStorageInfo: jest.fn(),
    loadPlaylistMetadata: jest.fn(),
    countOrphans: jest.fn(),
    sweepOrphans: jest.fn(),
    exportPlaylistMetadata: jest.fn(),
  },
}))
jest.mock("@/lib/video-cache", () => ({
  VideoCache: { getCacheStats: jest.fn(), clearAllCachedVideos: jest.fn() },
}))

const storage = PlaylistStorage as jest.Mocked<typeof PlaylistStorage>
const videos = VideoCache as jest.Mocked<typeof VideoCache>
const say = toast as jest.Mock

function info(used: number): StorageInfo {
  return {
    used,
    songs: 2,
    albumArtCount: 1,
    albumArtSize: 100,
    quota: { usage: used, quota: 0, available: 0, percentUsed: 0, persisted: true, supported: true, reliable: false },
  }
}

function saved(...ids: string[]) {
  storage.loadPlaylistMetadata.mockReturnValue({ songs: ids.map((id) => ({ id })) } as never)
}

beforeEach(() => {
  jest.clearAllMocks()
  storage.getStorageInfo.mockResolvedValue(info(1000))
  videos.getCacheStats.mockReturnValue({ totalEntries: 4, totalSize: 0, oldestEntry: null, newestEntry: null })
  saved("a", "b")
})

async function renderStorage(songCount = 2) {
  const hook = renderHook(({ count }) => useLibraryStorage(count), { initialProps: { count: songCount } })
  await waitFor(() => expect(hook.result.current.info).not.toBeNull())
  return hook
}

/** Lets every promise already settling finish: a macrotask runs only once they all have. */
function settle() {
  return act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)))
}

describe("useLibraryStorage", () => {
  it("measures the library on mount, and again when songs come or go", async () => {
    const { result, rerender } = await renderStorage()
    expect(result.current.info?.used).toBe(1000)
    expect(result.current.videoLookups).toBe(4)

    storage.getStorageInfo.mockResolvedValue(info(400))
    rerender({ count: 1 })
    await waitFor(() => expect(result.current.info?.used).toBe(400))
  })

  it("keeps only the latest measurement, however the store walks finish", async () => {
    const { result, rerender } = await renderStorage()
    let finishFirst: (value: StorageInfo) => void = () => {}
    storage.getStorageInfo
      .mockImplementationOnce(() => new Promise((resolve) => (finishFirst = resolve)))
      .mockResolvedValueOnce(info(2000))

    // Songs come twice: the first walk is still going when the second ends.
    rerender({ count: 3 })
    rerender({ count: 4 })
    await settle()
    expect(result.current.info?.used).toBe(2000)

    finishFirst(info(1))
    await settle()
    expect(result.current.info?.used).toBe(2000)
  })

  it("counts the files no song uses, against the songs the library saved", async () => {
    storage.countOrphans.mockResolvedValue({ records: 3, bytes: 50 })
    const { result } = await renderStorage()

    await expect(result.current.findOrphans()).resolves.toBe(3)
    expect(storage.countOrphans).toHaveBeenCalledWith(["a", "b"])
  })

  it("says when there is nothing to reclaim", async () => {
    storage.countOrphans.mockResolvedValue({ records: 0, bytes: 0 })
    const { result } = await renderStorage()

    await expect(result.current.findOrphans()).resolves.toBe(0)
    expect(say).toHaveBeenCalledWith(expect.objectContaining({ title: "Nothing to reclaim" }))
  })

  it("won't count or sweep without the library's saved list, since every file would look unused", async () => {
    storage.loadPlaylistMetadata.mockReturnValue(null)
    const { result } = await renderStorage()

    await expect(result.current.findOrphans()).resolves.toBe(0)
    await expect(result.current.reclaim()).resolves.toBe(false)
    expect(storage.countOrphans).not.toHaveBeenCalled()
    expect(storage.sweepOrphans).not.toHaveBeenCalled()
    expect(say).toHaveBeenCalledWith(expect.objectContaining({ title: "Couldn't check storage" }))
  })

  it("reclaims, says what it freed, and measures again", async () => {
    storage.sweepOrphans.mockResolvedValue({ removedRecords: 2, bytesReclaimed: 2048, skippedRecent: 0, repairedRefCounts: 0 })
    const { result } = await renderStorage()
    storage.getStorageInfo.mockClear()

    let done = false
    await act(async () => {
      done = await result.current.reclaim()
    })

    expect(done).toBe(true)
    expect(storage.sweepOrphans).toHaveBeenCalledWith(["a", "b"])
    expect(say).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Space reclaimed", description: expect.stringContaining("2 files") }),
    )
    expect(storage.getStorageInfo).toHaveBeenCalledTimes(1)
  })

  it("says so when reclaiming fails", async () => {
    storage.sweepOrphans.mockRejectedValue(new Error("Store is busy"))
    const quiet = jest.spyOn(console, "error").mockImplementation(() => {})
    const { result } = await renderStorage()

    await expect(result.current.reclaim()).resolves.toBe(false)
    expect(say).toHaveBeenCalledWith(expect.objectContaining({ title: "Couldn't reclaim space", description: "Store is busy" }))
    quiet.mockRestore()
  })

  it("clears the saved video lookups", async () => {
    const { result } = await renderStorage()

    act(() => result.current.clearVideoLookups())
    expect(videos.clearAllCachedVideos).toHaveBeenCalledTimes(1)
    expect(result.current.videoLookups).toBe(0)
  })
})
