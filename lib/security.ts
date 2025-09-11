import { createLogger } from '@/lib/logger'

const logger = createLogger('Security')

export class APIKeyManager {
  private static readonly KEY_ROTATION_INTERVAL = 24 * 60 * 60 * 1000 // 24 hours
  private static keyCache: Map<string, { key: string, timestamp: number }> = new Map()

  static async validateYouTubeApiKey(key: string): Promise<boolean> {
    if (!key || key.length < 20) {
      logger.warn('Invalid YouTube API key format')
      return false
    }

    // Check if key starts with expected prefix
    if (!key.startsWith('AIza')) {
      logger.warn('YouTube API key does not match expected format')
      return false
    }

    try {
      // Test the key with a simple API call
      const testUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=test&type=video&maxResults=1&key=${key}`
      const response = await fetch(testUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        }
      })

      if (response.status === 403) {
        logger.error('YouTube API key is invalid or expired')
        return false
      }

      if (response.status === 429) {
        logger.warn('YouTube API rate limit exceeded')
        return false
      }

      return response.ok
    } catch (error) {
      logger.error('Failed to validate YouTube API key', error)
      return false
    }
  }

  static async getValidApiKey(service: 'youtube'): Promise<string | null> {
    const cacheKey = `${service}_api_key`
    const cached = this.keyCache.get(cacheKey)

    // Return cached key if it's recent (less than rotation interval)
    if (cached && Date.now() - cached.timestamp < this.KEY_ROTATION_INTERVAL) {
      return cached.key
    }

    let apiKey: string | null = null

    switch (service) {
      case 'youtube':
        apiKey = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY || null
        if (apiKey && await this.validateYouTubeApiKey(apiKey)) {
          this.keyCache.set(cacheKey, { key: apiKey, timestamp: Date.now() })
          return apiKey
        }
        break
    }

    if (!apiKey) {
      logger.error(`No valid API key found for service: ${service}`)
    }

    return null
  }

  static clearCache(): void {
    this.keyCache.clear()
    logger.info('API key cache cleared')
  }
}

export class RateLimiter {
  private requests: Map<string, number[]> = new Map()
  private maxRequests: number
  private windowMs: number

  constructor(config: { requests: number; window: 'minute' | 'hour' | 'day' }) {
    this.maxRequests = config.requests
    
    switch (config.window) {
      case 'minute':
        this.windowMs = 60 * 1000
        break
      case 'hour':
        this.windowMs = 60 * 60 * 1000
        break
      case 'day':
        this.windowMs = 24 * 60 * 60 * 1000
        break
    }
  }

  async checkLimit(identifier: string): Promise<{ allowed: boolean; resetTime?: number }> {
    const now = Date.now()
    const requests = this.requests.get(identifier) || []

    // Remove expired requests
    const validRequests = requests.filter(time => now - time < this.windowMs)

    if (validRequests.length >= this.maxRequests) {
      const resetTime = validRequests[0] + this.windowMs
      logger.warn(`Rate limit exceeded for ${identifier}`, {
        requests: validRequests.length,
        maxRequests: this.maxRequests,
        resetTime: new Date(resetTime).toISOString()
      })
      
      return { 
        allowed: false, 
        resetTime 
      }
    }

    // Add current request
    validRequests.push(now)
    this.requests.set(identifier, validRequests)

    return { allowed: true }
  }

  reset(identifier?: string): void {
    if (identifier) {
      this.requests.delete(identifier)
    } else {
      this.requests.clear()
    }
  }
}

export class InputSanitizer {
  private static readonly HTML_ESCAPE_MAP: { [key: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '/': '&#x2F;',
  }

  static escapeHtml(text: string): string {
    return text.replace(/[&<>"'\/]/g, (s) => this.HTML_ESCAPE_MAP[s])
  }

  static sanitizeFileName(filename: string): string {
    // Remove or replace dangerous characters
    return filename
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, '_')
      .substring(0, 255) // Limit length
  }

  static validateUrl(url: string, allowedDomains?: string[]): boolean {
    try {
      const parsedUrl = new URL(url)
      
      // Check protocol
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return false
      }

      // Check allowed domains if specified
      if (allowedDomains && !allowedDomains.includes(parsedUrl.hostname)) {
        return false
      }

      return true
    } catch {
      return false
    }
  }

  static sanitizeSearchQuery(query: string): string {
    return query
      .trim()
      .replace(/[<>]/g, '') // Remove HTML brackets
      .replace(/['"]/g, '') // Remove quotes
      .substring(0, 100) // Limit length
  }
}

export class SecurityHeaders {
  static getCSPHeader(): string {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://www.youtube.com https://www.googletagmanager.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https: blob:",
      "media-src 'self' data: blob:",
      "connect-src 'self' https://www.googleapis.com https://*.supabase.co wss://*.supabase.co",
      "frame-src https://www.youtube.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'"
    ].join('; ')

    return csp
  }

  static getSecurityHeaders(): { [key: string]: string } {
    return {
      'Content-Security-Policy': this.getCSPHeader(),
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    }
  }
}

export class DataEncryption {
  private static readonly ALGORITHM = 'AES-GCM'
  private static readonly KEY_LENGTH = 256

  static async generateKey(): Promise<CryptoKey> {
    return await crypto.subtle.generateKey(
      { name: this.ALGORITHM, length: this.KEY_LENGTH },
      true,
      ['encrypt', 'decrypt']
    )
  }

  static async encrypt(data: string, key: CryptoKey): Promise<{ encrypted: string; iv: string }> {
    const encoder = new TextEncoder()
    const iv = crypto.getRandomValues(new Uint8Array(12))
    
    const encrypted = await crypto.subtle.encrypt(
      { name: this.ALGORITHM, iv },
      key,
      encoder.encode(data)
    )

    return {
      encrypted: Array.from(new Uint8Array(encrypted))
        .map(b => b.toString(16).padStart(2, '0'))
        .join(''),
      iv: Array.from(iv)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
    }
  }

  static async decrypt(encryptedData: string, iv: string, key: CryptoKey): Promise<string> {
    const decoder = new TextDecoder()
    
    const encrypted = new Uint8Array(
      encryptedData.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
    )
    
    const ivArray = new Uint8Array(
      iv.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
    )

    const decrypted = await crypto.subtle.decrypt(
      { name: this.ALGORITHM, iv: ivArray },
      key,
      encrypted
    )

    return decoder.decode(decrypted)
  }
}