import { renderHook, act } from '@testing-library/react'
import { useEqualizerManager } from '../use-equalizer-manager'
import type { EqualizerBand } from '@/components/refined-equalizer'

describe('useEqualizerManager', () => {
  // Mock filter nodes
  const createMockFilterNode = (): BiquadFilterNode => ({
    gain: { value: 0 } as any,
    connect: jest.fn(),
    disconnect: jest.fn(),
  } as any)

  const mockFilterNodes = Array(10).fill(null).map(() => createMockFilterNode())

  it('should initialize with default bands', () => {
    const { result } = renderHook(() =>
      useEqualizerManager({ filterNodes: mockFilterNodes })
    )

    expect(result.current.equalizerBands).toHaveLength(10)
    expect(result.current.equalizerBands[0].frequency).toBe(32)
    expect(result.current.equalizerBands[9].frequency).toBe(16000)
    expect(result.current.showEqualizer).toBe(false)
  })

  it('should initialize with custom bands', () => {
    const customBands: EqualizerBand[] = [
      { frequency: 100, gain: 5, label: '100Hz' },
      { frequency: 200, gain: -3, label: '200Hz' },
    ]

    const { result } = renderHook(() =>
      useEqualizerManager({
        initialBands: customBands,
        filterNodes: mockFilterNodes.slice(0, 2),
      })
    )

    expect(result.current.equalizerBands).toHaveLength(2)
    expect(result.current.equalizerBands[0].gain).toBe(5)
    expect(result.current.equalizerBands[1].gain).toBe(-3)
  })

  it('should update band gain', () => {
    const { result } = renderHook(() =>
      useEqualizerManager({ filterNodes: mockFilterNodes })
    )

    act(() => {
      result.current.updateBand(0, 10)
    })

    expect(result.current.equalizerBands[0].gain).toBe(10)
    expect(mockFilterNodes[0].gain.value).toBe(10)
  })

  it('should reset equalizer', () => {
    const { result } = renderHook(() =>
      useEqualizerManager({ filterNodes: mockFilterNodes })
    )

    // Set some gains
    act(() => {
      result.current.updateBand(0, 5)
      result.current.updateBand(1, -3)
      result.current.updateBand(2, 8)
    })

    // Verify gains are set
    expect(result.current.equalizerBands[0].gain).toBe(5)
    expect(result.current.equalizerBands[1].gain).toBe(-3)
    expect(result.current.equalizerBands[2].gain).toBe(8)

    // Reset
    act(() => {
      result.current.resetEqualizer()
    })

    // Verify all gains are 0
    result.current.equalizerBands.forEach((band) => {
      expect(band.gain).toBe(0)
    })

    mockFilterNodes.forEach((node) => {
      expect(node.gain.value).toBe(0)
    })
  })

  it('should toggle equalizer visibility', () => {
    const { result } = renderHook(() =>
      useEqualizerManager({ filterNodes: mockFilterNodes })
    )

    expect(result.current.showEqualizer).toBe(false)

    act(() => {
      result.current.setShowEqualizer(true)
    })

    expect(result.current.showEqualizer).toBe(true)

    act(() => {
      result.current.setShowEqualizer(false)
    })

    expect(result.current.showEqualizer).toBe(false)
  })

  it('should set custom equalizer bands', () => {
    const { result } = renderHook(() =>
      useEqualizerManager({ filterNodes: mockFilterNodes })
    )

    const newBands: EqualizerBand[] = [
      { frequency: 50, gain: 2, label: '50Hz' },
      { frequency: 100, gain: -2, label: '100Hz' },
    ]

    act(() => {
      result.current.setEqualizerBands(newBands)
    })

    expect(result.current.equalizerBands).toEqual(newBands)
  })
})
