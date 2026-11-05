import { act, renderHook } from "@testing-library/react"

import { usePlaylistPersistence, type PlaylistPersistenceData } from "@/hooks/use-playlist-persistence"
import { PlaylistStorage } from "@/lib/playlist-storage"
import { StorageManager } from "@/lib/storage"
import type { Song } from "@/lib/song"

jest.mock("@/hooks/use-toast", () => ({ toast: jest.fn() }))
jest.mock("@/lib/storage", () => ({ StorageManager: { saveData: jest.fn(), loadData: jest.fn() } }))
jest.mock("@/lib/storage-quota", () => ({
  requestPersistentStorage: jest.fn(() => Promise.resolve(true)),
  formatBytes: jest.fn(),
}))
jest.mock("@/lib/playlist-storage", () => ({
  PlaylistStorage: {
    savePlaylistMetadata: jest.fn(),
    loadPlaylistMetadata: jest.fn(),
    validateStoredFiles: jest.fn(),
    getSongFile: jest.fn(),
    sweepOrphans: jest.fn(() => Promise.resolve({ removedRecords: 0, bytesReclaimed: 0 })),
  },
}))

function data(songs: Song[]): PlaylistPersistenceData {
  return {
    songs,
    equalizerBands: [],
    eqPresets: [],
    volume: 1,
    shuffleMode: false,
    viewMode: "grouped",
    showEqualizer: false,
    crossfadeDuration: 0,
    normalizationEnabled: false,
    preampDb: 0,
  }
}

describe("usePlaylistPersistence, saving", () => {
  it("keeps each song's track number, so albums come back in order", () => {
    const { result } = renderHook(() => usePlaylistPersistence())
    const song = {
      id: "a",
      url: "blob:a",
      title: "Lorelei",
      album: "Treasure",
      trackNumber: "2",
      file: new File([new Uint8Array(4)], "lorelei.flac", { type: "audio/flac" }),
    } as Song

    result.current.savePlaylist(data([song]))

    const [saved] = jest.mocked(PlaylistStorage.savePlaylistMetadata).mock.calls[0][0]
    expect(saved).toMatchObject({ id: "a", album: "Treasure", trackNumber: "2", fileName: "lorelei.flac", fileSize: 4 })
  })
})

describe("usePlaylistPersistence, restoring", () => {
  beforeEach(() => {
    jest.mocked(StorageManager.loadData).mockReturnValue({} as ReturnType<typeof StorageManager.loadData>)
  })

  async function restore() {
    const { result } = renderHook(() => usePlaylistPersistence())
    let restored!: Awaited<ReturnType<typeof result.current.restorePlaylist>>
    await act(async () => {
      restored = await result.current.restorePlaylist()
    })
    return restored
  }

  it("hands back the saved song's id when the song lives only in the cloud", async () => {
    jest.mocked(PlaylistStorage.loadPlaylistMetadata).mockReturnValue({
      songs: [],
      currentSongId: "cloud-song",
      lastUpdated: 0,
      version: "1",
    } as unknown as ReturnType<typeof PlaylistStorage.loadPlaylistMetadata>)

    const restored = await restore()

    expect(restored.songs).toEqual([])
    expect(restored.currentSong).toBeNull()
    expect(restored.savedSongId).toBe("cloud-song")
  })

  it("finds the saved song among the songs stored on this device", async () => {
    const stored = { id: "local-song", title: "Lorelei", fileName: "lorelei.flac", fileSize: 4 }
    jest.mocked(PlaylistStorage.loadPlaylistMetadata).mockReturnValue({
      songs: [stored],
      currentSongId: "local-song",
      lastUpdated: 0,
      version: "1",
    } as unknown as ReturnType<typeof PlaylistStorage.loadPlaylistMetadata>)
    jest.mocked(PlaylistStorage.validateStoredFiles).mockResolvedValue([stored] as never)
    jest.mocked(PlaylistStorage.getSongFile).mockResolvedValue(new File([new Uint8Array(4)], "lorelei.flac"))

    const restored = await restore()

    expect(restored.currentSong?.id).toBe("local-song")
    expect(restored.savedSongId).toBe("local-song")
  })
})
