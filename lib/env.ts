import { z } from 'zod'

/**
 * Environment Variable Validation Service
 *
 * Validates and provides type-safe access to environment variables.
 * This ensures the application fails fast on startup if required
 * configuration is missing or invalid.
 */

// Define the schema for required environment variables
const envSchema = z.object({
  // YouTube API Configuration
  YOUTUBE_API_KEY: z.string().min(1, 'YouTube API key is required').optional(),

  // OpenRouter API Configuration (AI Song Insights)
  OPENROUTER_API_KEY: z.string().min(1, 'OpenRouter API key is required').optional(),
  OPENROUTER_MODEL: z.string().optional(),

  // Spotify API Configuration
  SPOTIFY_CLIENT_ID: z.string().min(1, 'Spotify Client ID is required').optional(),
  SPOTIFY_CLIENT_SECRET: z.string().min(1, 'Spotify Client Secret is required').optional(),

  // DAB Music API Configuration (Online Search & Download)
  DAB_EMAIL: z.string().email('DAB email must be valid').optional(),
  DAB_PASSWORD: z.string().min(1, 'DAB password is required').optional(),

  // Node Environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
})

// Type for validated environment variables
export type Env = z.infer<typeof envSchema>

// Validation result type
export interface EnvValidationResult {
  success: boolean
  data?: Env
  errors?: string[]
  warnings?: string[]
}

/**
 * Validates environment variables against the schema
 */
export function validateEnv(): EnvValidationResult {
  const env = {
    YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
    SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID,
    SPOTIFY_CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET,
    DAB_EMAIL: process.env.DAB_EMAIL,
    DAB_PASSWORD: process.env.DAB_PASSWORD,
    NODE_ENV: process.env.NODE_ENV as 'development' | 'production' | 'test' | undefined,
  }

  const result = envSchema.safeParse(env)
  const warnings: string[] = []

  // Check for optional but recommended variables
  if (!env.YOUTUBE_API_KEY) {
    warnings.push('YouTube API key not configured - video features will be disabled')
  }

  if (!env.OPENROUTER_API_KEY) {
    warnings.push('OpenRouter API key not configured - AI insights will be disabled')
  }

  if (!env.DAB_EMAIL || !env.DAB_PASSWORD) {
    warnings.push('DAB Music credentials not configured - online search & download will require manual login')
  }

  if (!result.success) {
    const errors = result.error.errors.map(
      (err) => `${err.path.join('.')}: ${err.message}`
    )
    return {
      success: false,
      errors,
      warnings,
    }
  }

  return {
    success: true,
    data: result.data,
    warnings: warnings.length > 0 ? warnings : undefined,
  }
}

/**
 * Gets validated environment variables
 * Throws an error if validation fails
 */
export function getEnv(): Env {
  const result = validateEnv()

  if (!result.success) {
    throw new Error(
      `Environment validation failed:\n${result.errors?.join('\n')}`
    )
  }

  return result.data!
}

/**
 * Checks if a specific feature is configured
 */
export function isFeatureEnabled(feature: 'youtube' | 'ai-insights' | 'dab-music'): boolean {
  const env = getEnv()

  switch (feature) {
    case 'youtube':
      return !!(
        env.YOUTUBE_API_KEY &&
        env.YOUTUBE_API_KEY.length > 0
      )
    case 'ai-insights':
      return !!(
        env.OPENROUTER_API_KEY &&
        env.OPENROUTER_API_KEY.length > 0
      )
    case 'dab-music':
      return !!(
        env.DAB_EMAIL &&
        env.DAB_EMAIL.length > 0 &&
        env.DAB_PASSWORD &&
        env.DAB_PASSWORD.length > 0
      )
    default:
      return false
  }
}

/**
 * Prints validation result to console
 */
export function printEnvValidation(): void {
  const result = validateEnv()

  if (result.success) {
    console.log('✓ Environment variables validated successfully')

    if (result.warnings && result.warnings.length > 0) {
      console.warn('\n⚠ Warnings:')
      result.warnings.forEach((warning) => {
        console.warn(`  - ${warning}`)
      })
    }
  } else {
    console.error('✗ Environment validation failed:')
    result.errors?.forEach((error) => {
      console.error(`  - ${error}`)
    })

    if (result.warnings && result.warnings.length > 0) {
      console.warn('\n⚠ Warnings:')
      result.warnings.forEach((warning) => {
        console.warn(`  - ${warning}`)
      })
    }
  }
}

// Auto-validate in development mode
if (typeof window === 'undefined' && process.env.NODE_ENV !== 'production') {
  printEnvValidation()
}
