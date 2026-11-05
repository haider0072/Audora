import { renderHook } from "@testing-library/react"

import { usePlaylistPersistence, type PlaylistPersistenceData } from "@/hooks/use-playlist-persistence"
import { PlaylistStorage } from "@/lib/playlist-storage"
import type { Song } from "@/lib/song"

jest.mock("@/hooks/use-toast", () => ({ toast: jest.fn() }))
jest.mock("@/lib/storage", () => ({ StorageManager: { saveData: jest.fn(), loadData: jest.fn() } }))
jest.mock("@/lib/playlist-storage", () => ({ PlaylistStorage: { savePlaylistMetadata: jest.fn() } }))

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
