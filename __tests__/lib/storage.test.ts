import { StorageManager } from '@/lib/storage'

describe('StorageManager', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('getDefaultData', () => {
    it('returns valid default structure', () => {
      const defaults = StorageManager.getDefaultData()
      expect(defaults.songs).toEqual([])
      expect(defaults.equalizerBands).toHaveLength(10)
      expect(defaults.playerSettings).toBeDefined()
      expect(defaults.playerSettings.volume).toBe(80)
      expect(defaults.playerSettings.shuffleMode).toBe(false)
    })

    it('has correct EQ band frequencies', () => {
      const defaults = StorageManager.getDefaultData()
      const frequencies = defaults.equalizerBands.map(b => b.frequency)
      expect(frequencies).toEqual([32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000])
    })

    it('all EQ bands have zero gain', () => {
      const defaults = StorageManager.getDefaultData()
      defaults.equalizerBands.forEach(band => {
        expect(band.gain).toBe(0)
      })
    })
  })

  describe('saveData / loadData', () => {
    it('persists and retrieves data', () => {
      const defaults = StorageManager.getDefaultData()
      defaults.playerSettings.volume = 50
      StorageManager.saveData(defaults)

      const loaded = StorageManager.loadData()
      expect(loaded.playerSettings.volume).toBe(50)
    })

    it('adds version and lastSaved metadata on save', () => {
      StorageManager.saveData(StorageManager.getDefaultData())
      const raw = JSON.parse(localStorage.getItem('enhanced-music-player')!)
      expect(raw.version).toBeDefined()
      expect(raw.lastSaved).toBeDefined()
    })

    it('returns default data when storage is empty', () => {
      const loaded = StorageManager.loadData()
      expect(loaded.songs).toEqual([])
      expect(loaded.equalizerBands).toHaveLength(10)
    })

    it('returns default data on parse error', () => {
      localStorage.setItem('enhanced-music-player', 'invalid json {{{')
      const loaded = StorageManager.loadData()
      expect(loaded.songs).toEqual([])
    })
  })

  describe('clearData', () => {
    it('removes all stored data', () => {
      StorageManager.saveData(StorageManager.getDefaultData())
      expect(localStorage.getItem('enhanced-music-player')).not.toBeNull()

      StorageManager.clearData()
      expect(localStorage.getItem('enhanced-music-player')).toBeNull()
    })
  })

  describe('version migration', () => {
    it('migrates data when version changes instead of wiping', () => {
      // Save data with an old version
      const data = {
        ...StorageManager.getDefaultData(),
        version: '0.0.1',
        playerSettings: {
          ...StorageManager.getDefaultData().playerSettings,
          volume: 42,
        },
      }
      localStorage.setItem('enhanced-music-player', JSON.stringify(data))

      const loaded = StorageManager.loadData()
      // Volume should be preserved through migration
      expect(loaded.playerSettings.volume).toBe(42)
    })
  })
})
