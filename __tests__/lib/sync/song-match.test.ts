import { findTrackByKey, trackLabel, trackSyncKey } from '@/lib/sync/song-match'

describe('trackSyncKey', () => {
  it('builds a key from byte size and file name', () => {
    expect(trackSyncKey({ fileName: 'Song.flac', fileSize: 1234 })).toBe('1234:song.flac')
  })

  it('reads name and size off an attached File when metadata is absent', () => {
    expect(trackSyncKey({ file: { name: 'Song.flac', size: 1234 } })).toBe('1234:song.flac')
  })

  it('prefers metadata over the File so a rehydrated track keys the same', () => {
    const key = trackSyncKey({
      fileName: 'Song.flac',
      fileSize: 1234,
      file: { name: 'Song.flac', size: 1234 },
    })
    expect(key).toBe('1234:song.flac')
  })

  it('agrees across devices that disagree on case', () => {
    expect(trackSyncKey({ fileName: 'SONG.FLAC', fileSize: 10 })).toBe(
      trackSyncKey({ fileName: 'song.flac', fileSize: 10 }),
    )
  })

  it('agrees across devices that disagree on Unicode composition', () => {
    // macOS stores the decomposed form, Windows the composed one.
    const decomposed = 'Bjo\u0308rk.flac' // o + combining diaeresis
    const composed = 'Bj\u00f6rk.flac' // precomposed o-umlaut
    expect(decomposed).not.toBe(composed)
    expect(trackSyncKey({ fileName: decomposed, fileSize: 99 })).toBe(
      trackSyncKey({ fileName: composed, fileSize: 99 }),
    )
  })

  it('ignores surrounding whitespace', () => {
    expect(trackSyncKey({ fileName: '  song.flac  ', fileSize: 10 })).toBe('10:song.flac')
  })

  it('separates two files that differ only in size', () => {
    expect(trackSyncKey({ fileName: 'song.flac', fileSize: 10 })).not.toBe(
      trackSyncKey({ fileName: 'song.flac', fileSize: 11 })
    )
  })

  it('is null when the track carries no usable size', () => {
    expect(trackSyncKey({ fileName: 'song.flac' })).toBeNull()
    expect(trackSyncKey({ fileName: 'song.flac', fileSize: 0 })).toBeNull()
    expect(trackSyncKey({ fileName: 'song.flac', fileSize: Number.NaN })).toBeNull()
  })

  it('is null when the track carries no name', () => {
    expect(trackSyncKey({ fileSize: 100 })).toBeNull()
  })

  it('is null for a missing track', () => {
    expect(trackSyncKey(null)).toBeNull()
    expect(trackSyncKey(undefined)).toBeNull()
  })
})

describe('findTrackByKey', () => {
  const library = [
    { fileName: 'a.flac', fileSize: 1 },
    { fileName: 'b.flac', fileSize: 2 },
  ]

  it('finds the matching track', () => {
    expect(findTrackByKey(library, '2:b.flac')).toBe(library[1])
  })

  it('returns null when the library does not hold the track', () => {
    expect(findTrackByKey(library, '3:c.flac')).toBeNull()
  })

  it('returns null for a null key rather than matching the first unkeyable track', () => {
    expect(findTrackByKey([{ fileName: 'a.flac' }], null)).toBeNull()
  })
})

describe('trackLabel', () => {
  it('joins title and artist', () => {
    expect(trackLabel({ title: 'Karma Police', artist: 'Radiohead' })).toBe(
      'Karma Police — Radiohead',
    )
  })

  it('falls back to the file name when there is no title', () => {
    expect(trackLabel({ fileName: 'track01.flac' })).toBe('track01.flac')
  })

  it('drops a blank artist instead of leaving a dangling dash', () => {
    expect(trackLabel({ title: 'Untitled', artist: '   ' })).toBe('Untitled')
  })

  it('describes an absent track', () => {
    expect(trackLabel(null)).toBe('Nothing playing')
  })
})
