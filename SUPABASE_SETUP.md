# 🚀 Supabase Setup Guide for Music Player

This guide will help you set up Supabase for your music player app with real-time sharing capabilities.

## 📋 Prerequisites

- A Supabase account (free at [supabase.com](https://supabase.com))
- Node.js and npm installed
- Your music player project

## 🛠️ Step 1: Create Supabase Project

1. **Go to [supabase.com](https://supabase.com)** and sign up/sign in
2. **Create a new project**:
   - Click "New Project"
   - Choose your organization
   - Enter project name (e.g., "music-player")
   - Enter database password (save this!)
   - Choose region closest to you
   - Click "Create new project"

3. **Wait for setup** (usually 1-2 minutes)

## 🗄️ Step 2: Set Up Database

1. **Go to SQL Editor** in your Supabase dashboard
2. **Copy and paste** the contents of `supabase-setup.sql` into the editor
3. **Run the script** - this creates all necessary tables and policies

## 🔐 Step 3: Configure Authentication

1. **Go to Authentication > Settings** in your dashboard
2. **Configure Site URL**:
   - Add your local development URL: `http://localhost:3000`
   - Add your production URL when ready
3. **Enable Google OAuth** (optional):
   - Go to Authentication > Providers
   - Enable Google
   - Add your Google OAuth credentials

## 📁 Step 4: Set Up Storage

1. **Go to Storage** in your dashboard
2. **Create two buckets**:
   - `album-art` (public)
   - `audio-files` (public)

3. **Set up storage policies** (run in SQL Editor):

```sql
-- Album art bucket policies
CREATE POLICY "Public access to album art" ON storage.objects
  FOR SELECT USING (bucket_id = 'album-art');

CREATE POLICY "Authenticated users can upload album art" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'album-art' AND auth.role() = 'authenticated');

CREATE POLICY "Users can update their album art" ON storage.objects
  FOR UPDATE USING (bucket_id = 'album-art' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their album art" ON storage.objects
  FOR DELETE USING (bucket_id = 'album-art' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Audio files bucket policies
CREATE POLICY "Public access to audio files" ON storage.objects
  FOR SELECT USING (bucket_id = 'audio-files');

CREATE POLICY "Authenticated users can upload audio files" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'audio-files' AND auth.role() = 'authenticated');

CREATE POLICY "Users can update their audio files" ON storage.objects
  FOR UPDATE USING (bucket_id = 'audio-files' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their audio files" ON storage.objects
  FOR DELETE USING (bucket_id = 'audio-files' AND auth.uid()::text = (storage.foldername(name))[1]);
```

## 🔑 Step 5: Get API Keys

1. **Go to Settings > API** in your dashboard
2. **Copy the following values**:
   - Project URL
   - Anon (public) key

## ⚙️ Step 6: Configure Environment Variables

1. **Create `.env.local`** in your project root:

```env
NEXT_PUBLIC_SUPABASE_URL=your_project_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
```

2. **Replace the placeholder values** in `lib/supabase.ts`:

```typescript
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'YOUR_SUPABASE_URL'
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY'
```

## 🎯 Step 7: Update Your Music Player

1. **Replace the old network sharing** with the new Supabase components
2. **Add authentication** to your app
3. **Test the integration**

## 🔄 Step 8: Enable Real-time Features

1. **Go to Database > Replication** in your dashboard
2. **Enable real-time** for the following tables:
   - `playlists`
   - `songs`
   - `sessions`

## 📱 Step 9: Test the Integration

1. **Start your development server**:
   ```bash
   npm run dev
   ```

2. **Test the features**:
   - Sign up/sign in
   - Create a playlist
   - Add songs to playlist
   - Create a sharing session
   - Join a session from another browser/device

## 🚀 Step 10: Deploy (Optional)

1. **Deploy to Vercel/Netlify** with your environment variables
2. **Update Site URL** in Supabase Authentication settings
3. **Test production deployment**

## 📊 Free Tier Limits

Supabase free tier includes:
- **50,000 monthly active users**
- **500MB database**
- **1GB file storage**
- **2GB bandwidth**
- **Real-time subscriptions**
- **Unlimited API requests**

## 🔧 Troubleshooting

### Common Issues:

1. **"Invalid API key" error**:
   - Check your environment variables
   - Ensure you're using the anon key, not the service role key

2. **"Row Level Security" errors**:
   - Make sure you're signed in
   - Check that RLS policies are set up correctly

3. **Real-time not working**:
   - Enable real-time in Database > Replication
   - Check your subscription setup

4. **Storage upload fails**:
   - Verify bucket exists
   - Check storage policies
   - Ensure file size is within limits

### Getting Help:

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase Discord](https://discord.supabase.com)
- [GitHub Issues](https://github.com/supabase/supabase/issues)

## 🎉 You're Ready!

Your music player now has:
- ✅ User authentication
- ✅ Playlist management
- ✅ Real-time music sharing
- ✅ Album art storage
- ✅ Cross-device sync
- ✅ Unlimited playlist sizes
- ✅ Reliable infrastructure

Enjoy sharing your 10GB+ music library with friends! 🎵 