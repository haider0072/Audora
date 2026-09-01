// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom'

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
})

// Mock IntersectionObserver.
//
// Reports everything it is given as intersecting. jsdom has no layout, so the
// honest answer is unknowable, and "visible" is the useful default: components
// that gate work on visibility then behave in tests as they do on a screen the
// user is actually looking at. A silent no-op would leave them waiting forever.
global.IntersectionObserver = class IntersectionObserver {
  constructor(callback) {
    this.callback = callback
  }
  disconnect() {}
  observe(target) {
    this.callback([{ target, isIntersecting: true, intersectionRatio: 1 }], this)
  }
  takeRecords() {
    return []
  }
  unobserve() {}
}

// Mock Web Audio API
global.AudioContext = jest.fn().mockImplementation(() => ({
  createMediaElementSource: jest.fn(),
  createGain: jest.fn(() => ({
    connect: jest.fn(),
    gain: { value: 1 },
  })),
  createAnalyser: jest.fn(() => ({
    connect: jest.fn(),
  })),
  createBiquadFilter: jest.fn(() => ({
    connect: jest.fn(),
    type: 'peaking',
    Q: { value: 1 },
    frequency: { value: 1000 },
    gain: { value: 0 },
  })),
  destination: {},
  state: 'running',
  resume: jest.fn().mockResolvedValue(undefined),
}))

// Mock IndexedDB
global.indexedDB = {
  open: jest.fn(),
  deleteDatabase: jest.fn(),
}
