import { storedArtRef, isStoredArtRef, songIdFromArtRef } from '@/lib/album-art-ref'

describe('album-art-ref', () => {
  it('round-trips a song id', () => {
    const ref = storedArtRef('dab-12345')
    expect(songIdFromArtRef(ref)).toBe('dab-12345')
  })

  it('recognises its own references', () => {
    expect(isStoredArtRef(storedArtRef('song-1'))).toBe(true)
  })

  it('does not claim the URL forms art used to travel as', () => {
    expect(isStoredArtRef('blob:https://example.com/abc')).toBe(false)
    expect(isStoredArtRef('https://example.com/cover.jpg')).toBe(false)
    expect(isStoredArtRef('data:image/png;base64,AAAA')).toBe(false)
  })

  it('returns null rather than a guess for a non-reference', () => {
    expect(songIdFromArtRef('blob:https://example.com/abc')).toBeNull()
  })

  it('keeps ids that contain separators intact', () => {
    // Song ids are not sanitised anywhere, so the scheme must not depend on
    // them being free of colons or slashes.
    const id = 'tidal-1:2/3'
    expect(songIdFromArtRef(storedArtRef(id))).toBe(id)
  })
})
