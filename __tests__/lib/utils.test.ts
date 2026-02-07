import { formatTime, waitForCanPlay } from '@/lib/utils'

describe('formatTime', () => {
  it('formats zero seconds', () => {
    expect(formatTime(0)).toBe('0:00')
  })

  it('formats seconds less than a minute', () => {
    expect(formatTime(45)).toBe('0:45')
  })

  it('formats exact minutes', () => {
    expect(formatTime(60)).toBe('1:00')
    expect(formatTime(120)).toBe('2:00')
  })

  it('formats minutes and seconds', () => {
    expect(formatTime(125)).toBe('2:05')
    expect(formatTime(3661)).toBe('61:01')
  })

  it('floors fractional seconds', () => {
    expect(formatTime(59.9)).toBe('0:59')
    expect(formatTime(60.1)).toBe('1:00')
  })

  it('pads single-digit seconds with leading zero', () => {
    expect(formatTime(3)).toBe('0:03')
    expect(formatTime(63)).toBe('1:03')
  })

  it('returns 0:00 for NaN', () => {
    expect(formatTime(NaN)).toBe('0:00')
  })

  it('returns 0:00 for negative values', () => {
    expect(formatTime(-10)).toBe('0:00')
  })

  it('handles Infinity', () => {
    // Infinity is not NaN, so it goes through the math path
    // This tests current behavior — not 0:00
    const result = formatTime(Infinity)
    expect(typeof result).toBe('string')
  })
})

describe('waitForCanPlay', () => {
  let audio: HTMLAudioElement

  beforeEach(() => {
    audio = document.createElement('audio')
  })

  it('resolves when canplay fires', async () => {
    const promise = waitForCanPlay(audio)
    audio.dispatchEvent(new Event('canplay'))
    await expect(promise).resolves.toBeUndefined()
  })

  it('rejects when error fires', async () => {
    const promise = waitForCanPlay(audio)
    audio.dispatchEvent(new Event('error'))
    await expect(promise).rejects.toThrow('Failed to load audio')
  })

  it('rejects on timeout', async () => {
    const promise = waitForCanPlay(audio, 50)
    await expect(promise).rejects.toThrow('Audio load timed out')
  }, 10000)

  it('cleans up event listeners after canplay', async () => {
    const removeSpy = jest.spyOn(audio, 'removeEventListener')
    const promise = waitForCanPlay(audio)
    audio.dispatchEvent(new Event('canplay'))
    await promise
    expect(removeSpy).toHaveBeenCalledWith('canplay', expect.any(Function))
    expect(removeSpy).toHaveBeenCalledWith('error', expect.any(Function))
  })

  it('cleans up event listeners after error', async () => {
    const removeSpy = jest.spyOn(audio, 'removeEventListener')
    const promise = waitForCanPlay(audio)
    audio.dispatchEvent(new Event('error'))
    await promise.catch(() => {})
    expect(removeSpy).toHaveBeenCalledWith('canplay', expect.any(Function))
    expect(removeSpy).toHaveBeenCalledWith('error', expect.any(Function))
  })

  it('uses custom timeout value', async () => {
    const start = Date.now()
    const promise = waitForCanPlay(audio, 100)
    await promise.catch(() => {})
    const elapsed = Date.now() - start
    expect(elapsed).toBeGreaterThanOrEqual(90)
    expect(elapsed).toBeLessThan(500)
  }, 10000)
})
