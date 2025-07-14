# 🎬 YouTube Music Video Integration Setup

## 🎯 **Overview**

This guide will help you set up YouTube API integration to display synchronized music videos alongside your audio playback. The feature includes:

- ✅ **Automatic Video Search**: Find music videos by artist and title
- ✅ **Smart Matching**: Relevance scoring for best video selection
- ✅ **Synchronization**: Video syncs with audio playback timing
- ✅ **Multiple Options**: Alternative video suggestions
- ✅ **Mobile Support**: Optimized for mobile devices
- ✅ **Volume Control**: Independent video volume control

## 🚀 **Step 1: Get YouTube API Key**

### **1.1 Create Google Cloud Project**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable billing (required for API usage)

### **1.2 Enable YouTube Data API**
1. Go to **APIs & Services > Library**
2. Search for "YouTube Data API v3"
3. Click on it and press **Enable**

### **1.3 Create API Credentials**
1. Go to **APIs & Services > Credentials**
2. Click **Create Credentials > API Key**
3. Copy your API key (you'll need this)

### **1.4 Restrict API Key (Recommended)**
1. Click on your API key to edit it
2. Under **Application restrictions**, select "HTTP referrers"
3. Add your domains:
   - `localhost:3000/*` (for development)
   - `yourdomain.com/*` (for production)
4. Under **API restrictions**, select "Restrict key"
5. Select "YouTube Data API v3"
6. Click **Save**

## ⚙️ **Step 2: Configure Environment Variables**

### **2.1 Create Environment File**
Create `.env.local` in your project root:

```env
# YouTube API Configuration
NEXT_PUBLIC_YOUTUBE_API_KEY=your_youtube_api_key_here
```

### **2.2 Update YouTube Service**
The service is already configured to use the environment variable:

```typescript
// utils/youtube-service.ts
private static readonly API_KEY = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY || ''
```

## 🎵 **Step 3: Integration with Music Player**

### **3.1 Desktop Integration**
Add to your `enhanced-music-player.tsx`:

```typescript
import { YouTubeVideoPlayer } from '@/components/youtube-video-player'

// Add this near your other player controls
<YouTubeVideoPlayer
  currentSong={currentSong}
  isPlaying={isPlaying}
  currentTime={currentTime}
  onPlayPause={togglePlayPause}
  onSeek={handleSeek}
  className="mt-4"
/>
```

### **3.2 Mobile Integration**
Add to your `mobile-music-player.tsx`:

```typescript
import { MobileYouTubeVideoPlayer } from '@/components/mobile-youtube-video-player'

// Add this to your mobile controls
<MobileYouTubeVideoPlayer
  currentSong={currentSong}
  isPlaying={isPlaying}
  currentTime={currentTime}
  onPlayPause={togglePlayPause}
  onSeek={handleSeek}
/>
```

## 🔧 **Step 4: Advanced Configuration**

### **4.1 Video Search Optimization**
The service includes smart relevance scoring:

```typescript
// Priority scoring:
// - Exact artist match: +50 points
// - Exact title match: +40 points
// - "Official" video: +15 points
// - "Music video": +10 points
// - Cover/remix penalty: -20/-15 points
```

### **4.2 Synchronization Modes**
- **Automatic**: Video automatically syncs with audio timing
- **Manual**: User controls video independently

### **4.3 Video Quality Settings**
- Auto-adjusts based on connection quality
- Supports multiple video resolutions
- Fallback to lower quality if needed

## 📊 **Step 5: API Usage & Limits**

### **5.1 Free Tier Limits**
- **10,000 units per day** (free)
- **Search request**: 100 units
- **Video details request**: 1 unit
- **~100 video searches per day** (free tier)

### **5.2 Cost Optimization**
```typescript
// Implement caching to reduce API calls
const videoCache = new Map<string, YouTubeVideo[]>()

// Cache video results for 24 hours
const CACHE_DURATION = 24 * 60 * 60 * 1000
```

### **5.3 Upgrade Options**
- **$5/month**: 1,000,000 units/day
- **$50/month**: 10,000,000 units/day
- **Custom**: Contact Google for enterprise

## 🎨 **Step 6: Customization Options**

### **6.1 Video Player Styling**
```css
/* Custom video player styles */
.youtube-video-player {
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
}

.video-controls-overlay {
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.8));
}
```

### **6.2 Theme Integration**
```typescript
// Dark/Light mode support
const videoTheme = useTheme()
const isDark = videoTheme.theme === 'dark'

// Apply theme-specific styling
```

### **6.3 Responsive Design**
```typescript
// Auto-adjust video size based on screen
const isMobile = window.innerWidth < 768
const videoHeight = isMobile ? '200px' : '400px'
```

## 🚨 **Step 7: Troubleshooting**

### **7.1 Common Issues**

#### **"API key not configured"**
```bash
# Check your .env.local file
NEXT_PUBLIC_YOUTUBE_API_KEY=your_actual_key_here

# Restart your development server
npm run dev
```

#### **"No videos found"**
- Check if artist/title are properly extracted
- Verify API key has correct permissions
- Check API quota usage

#### **"Video sync issues"**
- Ensure sync mode is set to "automatic"
- Check internet connection stability
- Verify video duration matches audio

### **7.2 Debug Mode**
```typescript
// Enable debug logging
const DEBUG_MODE = process.env.NODE_ENV === 'development'

if (DEBUG_MODE) {
  console.log('Video search query:', query)
  console.log('API response:', result)
  console.log('Selected video:', currentVideo)
}
```

## 🎯 **Step 8: Performance Optimization**

### **8.1 Lazy Loading**
```typescript
// Only load videos when requested
const [showVideo, setShowVideo] = useState(false)

useEffect(() => {
  if (showVideo && currentSong) {
    searchForVideos()
  }
}, [showVideo, currentSong])
```

### **8.2 Preloading**
```typescript
// Preload next video in playlist
const preloadNextVideo = async (nextSong: Song) => {
  if (nextSong) {
    const result = await YouTubeService.searchMusicVideo(
      nextSong.artist,
      nextSong.title
    )
    // Cache the result
  }
}
```

### **8.3 Memory Management**
```typescript
// Clean up video players
useEffect(() => {
  return () => {
    if (playerRef.current) {
      playerRef.current.destroy()
    }
  }
}, [])
```

## 🎉 **Step 9: Testing**

### **9.1 Test Cases**
1. **Basic Functionality**:
   - Search for popular songs
   - Verify video loads and plays
   - Test sync with audio

2. **Edge Cases**:
   - Songs with no videos
   - Very long song titles
   - Special characters in artist names

3. **Performance**:
   - Large playlists
   - Slow internet connections
   - Mobile devices

### **9.2 Sample Test Songs**
```typescript
const testSongs = [
  { artist: "The Beatles", title: "Hey Jude" },
  { artist: "Queen", title: "Bohemian Rhapsody" },
  { artist: "Michael Jackson", title: "Billie Jean" },
  { artist: "Pink Floyd", title: "Another Brick in the Wall" }
]
```

## 🔮 **Step 10: Future Enhancements**

### **10.1 Planned Features**
- **Video Playlists**: Curated video collections
- **Picture-in-Picture**: Floating video window
- **Video Quality Control**: Manual quality selection
- **Offline Mode**: Cache videos for offline viewing
- **Social Sharing**: Share favorite music videos

### **10.2 Advanced Sync**
- **Beat Matching**: Sync to actual beat timing
- **Visual Effects**: Audio-reactive video effects
- **Multi-camera**: Multiple video angles
- **Karaoke Mode**: Lyrics overlay on videos

## 📚 **Additional Resources**

- [YouTube Data API Documentation](https://developers.google.com/youtube/v3)
- [YouTube IFrame API Reference](https://developers.google.com/youtube/iframe_api_reference)
- [Google Cloud Console](https://console.cloud.google.com/)
- [API Quota Calculator](https://developers.google.com/youtube/v3/getting-started#quota)

## 🎵 **Enjoy Your Enhanced Music Experience!**

Your music player now features synchronized music videos that automatically match your audio playback. The integration provides a rich, immersive experience that combines the best of audio quality with visual entertainment.

**Key Benefits:**
- 🎬 **Visual Enhancement**: See the music videos while listening
- 🔄 **Perfect Sync**: Video timing matches audio perfectly
- 📱 **Mobile Optimized**: Works great on all devices
- 🎯 **Smart Search**: Finds the best video matches automatically
- ⚡ **Performance**: Optimized for smooth playback

Happy listening and watching! 🚀 