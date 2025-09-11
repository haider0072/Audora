import { z } from 'zod'

// Base schemas for common data types
export const IdSchema = z.string().uuid('Invalid ID format')

export const TimestampSchema = z.union([
  z.string().datetime('Invalid timestamp format'),
  z.date(),
  z.number().int().positive('Invalid timestamp')
])

export const UrlSchema = z.string().url('Invalid URL format')

export const FileSchema = z.object({
  name: z.string().min(1, 'File name is required').max(255, 'File name too long'),
  size: z.number().int().positive('Invalid file size').max(100 * 1024 * 1024, 'File too large (max 100MB)'),
  type: z.string().refine(
    (type) => type.startsWith('audio/') || type.startsWith('video/'),
    'Invalid file type - must be audio or video'
  ),
  lastModified: z.number().optional(),
})

// Audio-specific schemas
export const AudioMetadataSchema = z.object({
  title: z.string().max(200, 'Title too long').optional(),
  artist: z.string().max(100, 'Artist name too long').optional(),
  album: z.string().max(100, 'Album name too long').optional(),
  genre: z.string().max(50, 'Genre too long').optional(),
  year: z.number().int().min(1900).max(new Date().getFullYear()).optional(),
  track: z.number().int().positive().max(999).optional(),
  duration: z.number().positive('Duration must be positive').optional(),
  bitrate: z.number().int().positive('Bitrate must be positive').optional(),
  sampleRate: z.number().int().positive('Sample rate must be positive').optional(),
  channels: z.number().int().min(1).max(8, 'Invalid number of channels').optional(),
  format: z.enum(['mp3', 'flac', 'wav', 'aac', 'm4a', 'ogg'], {
    errorMap: () => ({ message: 'Unsupported audio format' })
  }).optional(),
  isHiRes: z.boolean().optional(),
})

export const SongSchema = z.object({
  id: IdSchema,
  title: z.string().min(1, 'Song title is required').max(200, 'Title too long'),
  artist: z.string().max(100, 'Artist name too long').optional(),
  album: z.string().max(100, 'Album name too long').optional(),
  duration: z.number().positive('Duration must be positive').optional(),
  format: z.string().max(10, 'Format string too long').optional(),
  bitrate: z.number().int().positive().optional(),
  sampleRate: z.number().int().positive().optional(),
  isHiRes: z.boolean().default(false),
  albumArt: z.string().url('Invalid album art URL').optional(),
  filePath: z.string().max(500, 'File path too long').optional(),
  fileSize: z.number().int().positive().optional(),
  metadata: AudioMetadataSchema.optional(),
  addedAt: TimestampSchema.default(() => new Date()),
  playCount: z.number().int().min(0).default(0),
  lastPlayed: TimestampSchema.optional(),
})

export type Song = z.infer<typeof SongSchema>

// Playlist schemas
export const PlaylistSchema = z.object({
  id: IdSchema,
  name: z.string()
    .min(1, 'Playlist name is required')
    .max(100, 'Playlist name too long')
    .refine((name) => name.trim().length > 0, 'Playlist name cannot be empty'),
  description: z.string().max(500, 'Description too long').optional(),
  songs: z.array(SongSchema).default([]),
  createdAt: TimestampSchema.default(() => new Date()),
  updatedAt: TimestampSchema.default(() => new Date()),
  isPublic: z.boolean().default(false),
  userId: IdSchema.optional(),
  coverImage: z.string().url('Invalid cover image URL').optional(),
  totalDuration: z.number().int().min(0).default(0),
  songCount: z.number().int().min(0).default(0),
})

export type Playlist = z.infer<typeof PlaylistSchema>

// YouTube integration schemas
export const YouTubeVideoSchema = z.object({
  id: z.string().min(1, 'Video ID is required'),
  title: z.string().min(1, 'Video title is required').max(200, 'Title too long'),
  thumbnail: z.string().url('Invalid thumbnail URL'),
  duration: z.number().positive('Duration must be positive'),
  channelTitle: z.string().max(100, 'Channel title too long'),
  publishedAt: z.string().datetime('Invalid publish date'),
  viewCount: z.number().int().min(0),
  relevanceScore: z.number().min(0).max(1, 'Relevance score must be between 0 and 1'),
  description: z.string().max(1000, 'Description too long').optional(),
})

export type YouTubeVideo = z.infer<typeof YouTubeVideoSchema>

export const VideoSearchResultSchema = z.object({
  videos: z.array(YouTubeVideoSchema),
  totalResults: z.number().int().min(0),
  query: z.string().min(1, 'Search query is required').max(100, 'Query too long'),
  nextPageToken: z.string().optional(),
})

export type VideoSearchResult = z.infer<typeof VideoSearchResultSchema>

// User and authentication schemas
export const UserSchema = z.object({
  id: IdSchema,
  email: z.string().email('Invalid email address').max(255, 'Email too long'),
  username: z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(50, 'Username too long')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, hyphens, and underscores')
    .optional(),
  displayName: z.string().max(100, 'Display name too long').optional(),
  avatarUrl: z.string().url('Invalid avatar URL').optional(),
  createdAt: TimestampSchema.default(() => new Date()),
  lastLoginAt: TimestampSchema.optional(),
  preferences: z.object({
    theme: z.enum(['light', 'dark', 'system']).default('system'),
    volume: z.number().min(0).max(100).default(80),
    autoplay: z.boolean().default(false),
    shuffle: z.boolean().default(false),
    repeat: z.enum(['none', 'one', 'all']).default('none'),
  }).optional(),
})

export type User = z.infer<typeof UserSchema>

// Equalizer schemas
export const EqualizerBandSchema = z.object({
  frequency: z.number().positive('Frequency must be positive'),
  gain: z.number().min(-20).max(20, 'Gain must be between -20 and 20 dB'),
  Q: z.number().positive('Q factor must be positive').default(1),
})

export const EqualizerPresetSchema = z.object({
  id: z.string().min(1, 'Preset ID is required'),
  name: z.string().min(1, 'Preset name is required').max(50, 'Preset name too long'),
  bands: z.array(EqualizerBandSchema).min(1, 'At least one band is required'),
  isCustom: z.boolean().default(false),
})

export type EqualizerBand = z.infer<typeof EqualizerBandSchema>
export type EqualizerPreset = z.infer<typeof EqualizerPresetSchema>

// API request/response schemas
export const SearchRequestSchema = z.object({
  query: z.string()
    .min(1, 'Search query is required')
    .max(100, 'Query too long')
    .transform((val) => val.trim()),
  type: z.enum(['song', 'artist', 'album', 'playlist']).default('song'),
  limit: z.number().int().min(1).max(50).default(10),
  offset: z.number().int().min(0).default(0),
})

export const UploadRequestSchema = z.object({
  files: z.array(FileSchema).min(1, 'At least one file is required').max(10, 'Too many files'),
  playlistId: IdSchema.optional(),
  metadata: AudioMetadataSchema.optional(),
})

export const PlaybackStateSchema = z.object({
  songId: IdSchema.optional(),
  currentTime: z.number().min(0, 'Current time cannot be negative'),
  isPlaying: z.boolean(),
  volume: z.number().min(0).max(100),
  isMuted: z.boolean(),
  isShuffled: z.boolean(),
  repeatMode: z.enum(['none', 'one', 'all']),
  playlistId: IdSchema.optional(),
})

export type PlaybackState = z.infer<typeof PlaybackStateSchema>

// Error schemas
export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.any()).optional(),
    timestamp: TimestampSchema.default(() => new Date()),
    requestId: z.string().optional(),
  })
})

export type ApiError = z.infer<typeof ApiErrorSchema>

// Validation helper functions
export class ValidationHelper {
  static validateSong(data: unknown): Song {
    try {
      return SongSchema.parse(data)
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(`Invalid song data: ${error.errors.map(e => e.message).join(', ')}`)
      }
      throw error
    }
  }

  static validatePlaylist(data: unknown): Playlist {
    try {
      return PlaylistSchema.parse(data)
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(`Invalid playlist data: ${error.errors.map(e => e.message).join(', ')}`)
      }
      throw error
    }
  }

  static validateYouTubeVideo(data: unknown): YouTubeVideo {
    try {
      return YouTubeVideoSchema.parse(data)
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(`Invalid YouTube video data: ${error.errors.map(e => e.message).join(', ')}`)
      }
      throw error
    }
  }

  static validateSearchRequest(data: unknown): z.infer<typeof SearchRequestSchema> {
    try {
      return SearchRequestSchema.parse(data)
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(`Invalid search request: ${error.errors.map(e => e.message).join(', ')}`)
      }
      throw error
    }
  }

  static safeValidate<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; error: string } {
    try {
      const validData = schema.parse(data)
      return { success: true, data: validData }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return { 
          success: false, 
          error: error.errors.map(e => e.message).join(', ')
        }
      }
      return { 
        success: false, 
        error: 'Validation failed'
      }
    }
  }
}

// Schemas are already exported above, no need to re-export