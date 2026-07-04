import { BUILT_IN_PRESETS, EQ_BAND_COUNT, getAllPresets, isValidPreset } from '@/lib/eq-presets'

describe('eq-presets', () => {
  it('every built-in preset has 10 band gains within the ±12 dB slider range', () => {
    BUILT_IN_PRESETS.forEach((preset) => {
      expect(preset.gains).toHaveLength(EQ_BAND_COUNT)
      preset.gains.forEach((gain) => {
        expect(gain).toBeGreaterThanOrEqual(-12)
        expect(gain).toBeLessThanOrEqual(12)
      })
      expect(preset.preamp).toBeGreaterThanOrEqual(-12)
      expect(preset.preamp).toBeLessThanOrEqual(12)
      expect(preset.builtIn).toBe(true)
    })
  })

  it('built-in preset ids are unique', () => {
    const ids = BUILT_IN_PRESETS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('includes a Flat preset with all-zero gains', () => {
    const flat = BUILT_IN_PRESETS.find((p) => p.id === 'flat')
    expect(flat).toBeDefined()
    expect(flat!.gains.every((g) => g === 0)).toBe(true)
    expect(flat!.preamp).toBe(0)
  })

  it('getAllPresets lists built-ins before custom presets', () => {
    const custom = { id: 'custom-1', name: 'Mine', gains: Array(10).fill(1), preamp: -2 }
    const all = getAllPresets([custom])
    expect(all).toHaveLength(BUILT_IN_PRESETS.length + 1)
    expect(all[all.length - 1]).toEqual(custom)
  })

  describe('isValidPreset', () => {
    it('accepts a well-formed preset', () => {
      expect(isValidPreset({ id: 'x', name: 'X', gains: Array(10).fill(0), preamp: 0 })).toBe(true)
    })

    it('rejects malformed values', () => {
      expect(isValidPreset(null)).toBe(false)
      expect(isValidPreset({ id: 'x', name: 'X', gains: Array(9).fill(0), preamp: 0 })).toBe(false)
      expect(isValidPreset({ id: 'x', name: 'X', gains: Array(10).fill('3'), preamp: 0 })).toBe(false)
      expect(isValidPreset({ id: 'x', name: 'X', gains: Array(10).fill(NaN), preamp: 0 })).toBe(false)
      expect(isValidPreset({ id: 'x', gains: Array(10).fill(0), preamp: 0 })).toBe(false)
    })
  })
})
