import { cancelRamps, dbToGain, rampToValue, volumeToGain, GAIN_RAMP_TC } from '@/lib/audio-params'

describe('audio-params', () => {
  describe('dbToGain', () => {
    it('maps 0 dB to exactly unity', () => {
      expect(dbToGain(0)).toBe(1)
    })

    it('maps ±6 dB to ~2x / ~0.5x', () => {
      expect(dbToGain(6)).toBeCloseTo(1.995, 2)
      expect(dbToGain(-6)).toBeCloseTo(0.501, 2)
    })
  })

  describe('volumeToGain', () => {
    it('maps slider 100 to exactly unity (transparent)', () => {
      expect(volumeToGain(100)).toBe(1)
    })

    it('maps slider 0 to silence', () => {
      expect(volumeToGain(0)).toBe(0)
    })

    it('uses the squared taper (80 → 0.64)', () => {
      expect(volumeToGain(80)).toBeCloseTo(0.64, 10)
      expect(volumeToGain(50)).toBeCloseTo(0.25, 10)
    })
  })

  describe('cancelRamps', () => {
    it('prefers cancelAndHoldAtTime when available', () => {
      const param = {
        cancelAndHoldAtTime: jest.fn(),
        cancelScheduledValues: jest.fn(),
      } as unknown as AudioParam
      cancelRamps(param, 1.5)
      expect((param as any).cancelAndHoldAtTime).toHaveBeenCalledWith(1.5)
      expect(param.cancelScheduledValues).not.toHaveBeenCalled()
    })

    it('falls back to cancelScheduledValues', () => {
      const param = {
        cancelScheduledValues: jest.fn(),
      } as unknown as AudioParam
      cancelRamps(param, 2)
      expect(param.cancelScheduledValues).toHaveBeenCalledWith(2)
    })
  })

  describe('rampToValue', () => {
    it('cancels, ramps toward the target, then snaps exactly', () => {
      const param = {
        cancelScheduledValues: jest.fn(),
        setTargetAtTime: jest.fn(),
        setValueAtTime: jest.fn(),
      } as unknown as AudioParam
      const ctx = { currentTime: 10 } as BaseAudioContext

      rampToValue(param, ctx, 0.5)

      expect(param.cancelScheduledValues).toHaveBeenCalledWith(10)
      expect(param.setTargetAtTime).toHaveBeenCalledWith(0.5, 10, GAIN_RAMP_TC)
      // Exact snap after the exponential has settled — unity really is 1.0.
      expect(param.setValueAtTime).toHaveBeenCalledWith(0.5, 10 + GAIN_RAMP_TC * 8)
    })

    it('respects a custom time constant', () => {
      const param = {
        cancelScheduledValues: jest.fn(),
        setTargetAtTime: jest.fn(),
        setValueAtTime: jest.fn(),
      } as unknown as AudioParam
      const ctx = { currentTime: 0 } as BaseAudioContext

      rampToValue(param, ctx, 1, 0.01)

      expect(param.setTargetAtTime).toHaveBeenCalledWith(1, 0, 0.01)
      expect(param.setValueAtTime).toHaveBeenCalledWith(1, 0.08)
    })
  })
})
