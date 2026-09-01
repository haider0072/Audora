/**
 * The store's whole reason to exist is controlling *when* subscribers are woken,
 * so these tests are mostly about notification behaviour rather than the value.
 */

type Store = typeof import('@/lib/playback-time-store')

/** Fresh module per test — the store keeps position in module scope. */
function loadStore(): Store {
  let store!: Store
  jest.isolateModules(() => {
    store = require('@/lib/playback-time-store')
  })
  return store
}

/** jsdom reports document.hidden as false; override it for the hidden cases. */
function setHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => hidden,
  })
}

describe('playback-time-store', () => {
  afterEach(() => {
    setHidden(false)
  })

  describe('while visible', () => {
    it('reports the position it was given', () => {
      const store = loadStore()
      store.setPlaybackTime(12.5)
      expect(store.getPlaybackTime()).toBe(12.5)
    })

    it('starts at zero', () => {
      expect(loadStore().getPlaybackTime()).toBe(0)
    })

    it('notifies subscribers when the position changes', () => {
      const store = loadStore()
      const listener = jest.fn()
      store.subscribeToPlaybackTime(listener)

      store.setPlaybackTime(1)
      store.setPlaybackTime(2)

      expect(listener).toHaveBeenCalledTimes(2)
    })

    it('drops repeat values without notifying', () => {
      const store = loadStore()
      const listener = jest.fn()
      store.subscribeToPlaybackTime(listener)

      store.setPlaybackTime(3)
      store.setPlaybackTime(3)

      expect(listener).toHaveBeenCalledTimes(1)
    })

    it('stops notifying once unsubscribed', () => {
      const store = loadStore()
      const listener = jest.fn()
      const unsubscribe = store.subscribeToPlaybackTime(listener)

      store.setPlaybackTime(1)
      unsubscribe()
      store.setPlaybackTime(2)

      expect(listener).toHaveBeenCalledTimes(1)
    })

    it('notifies every subscriber', () => {
      const store = loadStore()
      const first = jest.fn()
      const second = jest.fn()
      store.subscribeToPlaybackTime(first)
      store.subscribeToPlaybackTime(second)

      store.setPlaybackTime(1)

      expect(first).toHaveBeenCalledTimes(1)
      expect(second).toHaveBeenCalledTimes(1)
    })
  })

  describe('while hidden', () => {
    it('records the position but wakes nobody', () => {
      const store = loadStore()
      const listener = jest.fn()
      store.subscribeToPlaybackTime(listener)

      setHidden(true)
      store.setPlaybackTime(42)

      expect(store.getPlaybackTime()).toBe(42)
      expect(listener).not.toHaveBeenCalled()
    })

    it('notifies once on the way back to visible, not once per missed tick', () => {
      const store = loadStore()
      const listener = jest.fn()
      store.subscribeToPlaybackTime(listener)

      setHidden(true)
      store.setPlaybackTime(1)
      store.setPlaybackTime(2)
      store.setPlaybackTime(3)
      expect(listener).not.toHaveBeenCalled()

      setHidden(false)
      document.dispatchEvent(new Event('visibilitychange'))

      expect(listener).toHaveBeenCalledTimes(1)
      expect(store.getPlaybackTime()).toBe(3)
    })

    it('still delivers a reset immediately', () => {
      const store = loadStore()
      const listener = jest.fn()
      store.subscribeToPlaybackTime(listener)

      store.setPlaybackTime(10)
      listener.mockClear()

      setHidden(true)
      store.resetPlaybackTime()

      expect(store.getPlaybackTime()).toBe(0)
      expect(listener).toHaveBeenCalledTimes(1)
    })
  })

  describe('resetPlaybackTime', () => {
    it('returns the position to zero', () => {
      const store = loadStore()
      store.setPlaybackTime(30)
      store.resetPlaybackTime()
      expect(store.getPlaybackTime()).toBe(0)
    })

    it('does not notify when already at zero', () => {
      const store = loadStore()
      const listener = jest.fn()
      store.subscribeToPlaybackTime(listener)

      store.resetPlaybackTime()

      expect(listener).not.toHaveBeenCalled()
    })
  })

  describe('server snapshot', () => {
    it('is zero, so hydration has a stable starting value', () => {
      const store = loadStore()
      store.setPlaybackTime(99)
      expect(store.getServerPlaybackTime()).toBe(0)
    })
  })
})
