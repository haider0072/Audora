import { useState } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'

import type { Song } from '@/lib/song'
import type { ByteSource } from '@/lib/metadata-extractor'
import { useStreamInfoBackfill } from '@/hooks/use-stream-info-backfill'
import { byteSource } from '@/testing/byte-source'
import { buildFlac } from '@/testing/flac-fixture'
import { buildMp3 } from '@/testing/mp3-fixture'

/** A song stored before stream info was read. */
function storedSong(id: string, file: ByteSource | undefined, overrides: Partial<Song> = {}): Song {
  return {
    id,
    title: id,
    url: '',
    format: 'FLAC',
    duration: 1,
    bitrate: 9999,
    file: file as File | undefined,
    ...overrides,
  } as Song
}

function useLibrary(initial: Song[]) {
  const [songs, setSongs] = useState(initial)
  useStreamInfoBackfill(songs, setSongs)
  return { songs, setSongs }
}

const hiRes = () =>
  buildFlac({ bitDepth: 24, sampleRate: 96_000, cover: new Uint8Array(50_000), audioBytes: 300_000, durationSeconds: 1 })

describe('useStreamInfoBackfill', () => {
  it('reads the stream info of stored lossless songs that lack it', async () => {
    const mp3File = byteSource(buildMp3(), 'mp3.mp3')
    const knownFile = byteSource(hiRes(), 'known.flac')
    const flac = storedSong('flac', byteSource(hiRes(), 'flac.flac'))
    const mp3 = storedSong('mp3', mp3File, { format: 'MP3' })
    const known = storedSong('known', knownFile, { sampleRate: 96_000, bitDepth: 24 })
    const cloud = storedSong('cloud', undefined)

    const { result } = renderHook(() => useLibrary([flac, mp3, known, cloud]))

    await waitFor(() =>
      expect(result.current.songs[0]).toMatchObject({ sampleRate: 96_000, bitDepth: 24, bitrate: 2400 }),
    )
    expect(result.current.songs.slice(1)).toEqual([mp3, known, cloud])
    expect(mp3File.reads).toEqual([])
    expect(knownFile.reads).toEqual([])
  })

  it('tries each song once, leaving one whose file says nothing or cannot be read', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const blankFile = byteSource(new Uint8Array(8192), 'blank.flac')
    const unreadable = {
      ...byteSource(hiRes(), 'broken.flac'),
      slice: () => ({ arrayBuffer: () => Promise.reject(new Error('gone')) }),
    }
    const blank = storedSong('blank', blankFile)
    const broken = storedSong('broken', unreadable)

    const { result } = renderHook(() => useLibrary([blank, broken]))
    await waitFor(() => expect(warn).toHaveBeenCalledTimes(1))
    expect(warn.mock.calls[0][0]).toContain('broken.flac')
    expect(result.current.songs).toEqual([blank, broken])
    const blankReads = blankFile.reads.length

    // The list changes; only the song not tried yet is read.
    act(() => result.current.setSongs((songs) => [...songs, storedSong('later', byteSource(hiRes(), 'later.flac'))]))
    await waitFor(() => expect(result.current.songs[2]).toMatchObject({ bitDepth: 24 }))
    expect(blankFile.reads).toHaveLength(blankReads)
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })
})
