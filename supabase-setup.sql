-- Enable Row Level Security
ALTER DATABASE postgres SET "app.jwt_secret" TO 'your-jwt-secret';

-- Create tables for the music player app

-- Users table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE,
  email TEXT UNIQUE,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Playlists table
CREATE TABLE IF NOT EXISTS public.playlists (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Songs table
CREATE TABLE IF NOT EXISTS public.songs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  playlist_id UUID REFERENCES public.playlists(id) ON DELETE CASCADE NOT NULL,
  title TEXT,
  artist TEXT,
  album TEXT,
  duration INTEGER, -- in seconds
  file_path TEXT,
  album_art_url TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Sessions table for real-time sharing
CREATE TABLE IF NOT EXISTS public.sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  playlist_id UUID REFERENCES public.playlists(id) ON DELETE CASCADE NOT NULL,
  host_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  session_code TEXT UNIQUE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  current_song_id UUID REFERENCES public.songs(id) ON DELETE SET NULL,
  playback_time INTEGER DEFAULT 0, -- in seconds
  is_playing BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_playlists_user_id ON public.playlists(user_id);
CREATE INDEX IF NOT EXISTS idx_playlists_public ON public.playlists(is_public);
CREATE INDEX IF NOT EXISTS idx_songs_playlist_id ON public.songs(playlist_id);
CREATE INDEX IF NOT EXISTS idx_sessions_playlist_id ON public.sessions(playlist_id);
CREATE INDEX IF NOT EXISTS idx_sessions_host_id ON public.sessions(host_id);
CREATE INDEX IF NOT EXISTS idx_sessions_code ON public.sessions(session_code);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON public.sessions(is_active);

-- Enable Row Level Security (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users table
CREATE POLICY "Users can view their own profile" ON public.users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON public.users
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" ON public.users
  FOR INSERT WITH CHECK (auth.uid() = id);

-- RLS Policies for playlists table
CREATE POLICY "Users can view their own playlists" ON public.playlists
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view public playlists" ON public.playlists
  FOR SELECT USING (is_public = true);

CREATE POLICY "Users can create their own playlists" ON public.playlists
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own playlists" ON public.playlists
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own playlists" ON public.playlists
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for songs table
CREATE POLICY "Users can view songs in their playlists" ON public.songs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.playlists 
      WHERE playlists.id = songs.playlist_id 
      AND (playlists.user_id = auth.uid() OR playlists.is_public = true)
    )
  );

CREATE POLICY "Users can add songs to their playlists" ON public.songs
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.playlists 
      WHERE playlists.id = songs.playlist_id 
      AND playlists.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update songs in their playlists" ON public.songs
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.playlists 
      WHERE playlists.id = songs.playlist_id 
      AND playlists.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete songs in their playlists" ON public.songs
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.playlists 
      WHERE playlists.id = songs.playlist_id 
      AND playlists.user_id = auth.uid()
    )
  );

-- RLS Policies for sessions table
CREATE POLICY "Users can view sessions they're part of" ON public.sessions
  FOR SELECT USING (
    host_id = auth.uid() OR 
    EXISTS (
      SELECT 1 FROM public.playlists 
      WHERE playlists.id = sessions.playlist_id 
      AND (playlists.user_id = auth.uid() OR playlists.is_public = true)
    )
  );

CREATE POLICY "Users can create sessions for their playlists" ON public.sessions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.playlists 
      WHERE playlists.id = sessions.playlist_id 
      AND playlists.user_id = auth.uid()
    )
  );

CREATE POLICY "Hosts can update their sessions" ON public.sessions
  FOR UPDATE USING (host_id = auth.uid());

CREATE POLICY "Hosts can delete their sessions" ON public.sessions
  FOR DELETE USING (host_id = auth.uid());

-- Create functions for automatic timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at columns
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_playlists_updated_at BEFORE UPDATE ON public.playlists
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to handle new user registration
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, username, email, avatar_url)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'username',
    NEW.email,
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to automatically create user profile
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create storage buckets for album art and audio files
-- Note: These need to be created in the Supabase dashboard or via API
-- INSERT INTO storage.buckets (id, name, public) VALUES ('album-art', 'album-art', true);
-- INSERT INTO storage.buckets (id, name, public) VALUES ('audio-files', 'audio-files', true);

-- Storage policies for album-art bucket
-- CREATE POLICY "Public access to album art" ON storage.objects
--   FOR SELECT USING (bucket_id = 'album-art');

-- CREATE POLICY "Authenticated users can upload album art" ON storage.objects
--   FOR INSERT WITH CHECK (bucket_id = 'album-art' AND auth.role() = 'authenticated');

-- CREATE POLICY "Users can update their album art" ON storage.objects
--   FOR UPDATE USING (bucket_id = 'album-art' AND auth.uid()::text = (storage.foldername(name))[1]);

-- CREATE POLICY "Users can delete their album art" ON storage.objects
--   FOR DELETE USING (bucket_id = 'album-art' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Storage policies for audio-files bucket
-- CREATE POLICY "Public access to audio files" ON storage.objects
--   FOR SELECT USING (bucket_id = 'audio-files');

-- CREATE POLICY "Authenticated users can upload audio files" ON storage.objects
--   FOR INSERT WITH CHECK (bucket_id = 'audio-files' AND auth.role() = 'authenticated');

-- CREATE POLICY "Users can update their audio files" ON storage.objects
--   FOR UPDATE USING (bucket_id = 'audio-files' AND auth.uid()::text = (storage.foldername(name))[1]);

-- CREATE POLICY "Users can delete their audio files" ON storage.objects
--   FOR DELETE USING (bucket_id = 'audio-files' AND auth.uid()::text = (storage.foldername(name))[1]); 