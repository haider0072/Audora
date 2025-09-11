import { Logger, LogLevel, createLogger } from '@/lib/logger'

// Mock console methods
const mockConsole = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}

// Mock performance.now
const mockPerformanceNow = jest.fn()
global.performance.now = mockPerformanceNow

describe('Logger', () => {
  let logger: Logger
  let originalConsole: typeof console
  let originalEnv: string | undefined

  beforeEach(() => {
    originalConsole = { ...console }
    originalEnv = process.env.NODE_ENV
    
    // Mock console methods
    Object.assign(console, mockConsole)
    
    // Reset mocks
    Object.values(mockConsole).forEach(mock => mock.mockClear())
    mockPerformanceNow.mockClear()
    
    logger = new Logger('TestContext')
  })

  afterEach(() => {
    Object.assign(console, originalConsole)
    process.env.NODE_ENV = originalEnv
  })

  describe('logging levels', () => {
    it('logs debug messages in development', () => {
      process.env.NODE_ENV = 'development'
      logger = new Logger('TestContext')
      
      logger.debug('Test debug message')
      
      expect(mockConsole.debug).toHaveBeenCalledWith(
        expect.stringContaining('[TestContext]: Test debug message')
      )
    })

    it('does not log debug messages in production', () => {
      process.env.NODE_ENV = 'production'
      logger = new Logger('TestContext')
      
      logger.debug('Test debug message')
      
      expect(mockConsole.debug).not.toHaveBeenCalled()
    })

    it('logs info messages', () => {
      logger.info('Test info message')
      
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('[TestContext]: Test info message')
      )
    })

    it('logs warning messages', () => {
      logger.warn('Test warning message')
      
      expect(mockConsole.warn).toHaveBeenCalledWith(
        expect.stringContaining('[TestContext]: Test warning message')
      )
    })

    it('logs error messages', () => {
      logger.error('Test error message')
      
      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.stringContaining('[TestContext]: Test error message')
      )
    })
  })

  describe('message formatting', () => {
    it('includes timestamp, level, context, and message', () => {
      logger.info('Test message')
      
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringMatching(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] INFO \[TestContext\]: Test message/)
      )
    })

    it('includes data when provided', () => {
      const testData = { userId: 123, action: 'play' }
      logger.info('User action', testData)
      
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining(`Test message | ${JSON.stringify(testData)}`)
      )
    })
  })

  describe('performance timing', () => {
    it('measures and logs execution time', () => {
      mockPerformanceNow
        .mockReturnValueOnce(100) // Start time
        .mockReturnValueOnce(150) // End time

      const timer = logger.startTimer('test-operation')
      timer()

      expect(mockConsole.debug).toHaveBeenCalledWith(
        expect.stringContaining('Timer [test-operation]: 50.00ms')
      )
    })
  })

  describe('createLogger helper', () => {
    it('creates logger with specified context', () => {
      const customLogger = createLogger('CustomContext')
      customLogger.info('Test message')
      
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('[CustomContext]: Test message')
      )
    })
  })

  describe('logFunction decorator', () => {
    class TestClass {
      @Logger.logFunction
      syncMethod(arg1: string, arg2: number) {
        return `${arg1}-${arg2}`
      }

      @Logger.logFunction
      async asyncMethod(arg: string) {
        return Promise.resolve(`async-${arg}`)
      }

      @Logger.logFunction
      errorMethod() {
        throw new Error('Test error')
      }
    }

    it('logs synchronous method execution', () => {
      mockPerformanceNow
        .mockReturnValueOnce(100)
        .mockReturnValueOnce(120)

      const instance = new TestClass()
      const result = instance.syncMethod('test', 42)

      expect(result).toBe('test-42')
      expect(mockConsole.debug).toHaveBeenCalledWith(
        expect.stringContaining('Calling syncMethod')
      )
      expect(mockConsole.debug).toHaveBeenCalledWith(
        expect.stringContaining('syncMethod completed successfully')
      )
    })

    it('logs asynchronous method execution', async () => {
      mockPerformanceNow
        .mockReturnValueOnce(100)
        .mockReturnValueOnce(150)

      const instance = new TestClass()
      const result = await instance.asyncMethod('test')

      expect(result).toBe('async-test')
      expect(mockConsole.debug).toHaveBeenCalledWith(
        expect.stringContaining('Calling asyncMethod')
      )
      expect(mockConsole.debug).toHaveBeenCalledWith(
        expect.stringContaining('asyncMethod completed successfully')
      )
    })

    it('logs method errors', () => {
      const instance = new TestClass()

      expect(() => instance.errorMethod()).toThrow('Test error')
      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.stringContaining('errorMethod failed')
      )
    })
  })
})