import { createClient } from '@supabase/supabase-js'

// Replace these with your actual Supabase credentials
// Get them from: https://supabase.com/dashboard/project/[YOUR_PROJECT]/settings/api
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'YOUR_SUPABASE_URL'
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY'

export const supabase = createClient(supabaseUrl, supabaseKey)

// Types for our database
export interface Playlist {
  id: string
  name: string
  description?: string
  user_id: string
  is_public: boolean
  created_at: string
  updated_at: string
}

export interface Song {
  id: string
  playlist_id: string
  title?: string
  artist?: string
  album?: string
  duration?: number
  file_path?: string
  album_art_url?: string
  metadata?: any
  created_at: string
}

export interface Session {
  id: string
  playlist_id: string
  host_id: string
  session_code: string
  is_active: boolean
  current_song_id?: string
  playback_time: number
  is_playing: boolean
  created_at: string
}

export interface User {
  id: string
  username?: string
  email?: string
  avatar_url?: string
  created_at: string
} 