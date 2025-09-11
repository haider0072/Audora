# Enhanced Music Player

A professional, production-ready music player built with Next.js, featuring high-quality audio playback, YouTube integration, and comprehensive playlist management.

[![Deployed on Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?style=for-the-badge&logo=vercel)](https://vercel.com/haider0072s-projects/v0-music-player-requirements)
[![Built with v0](https://img.shields.io/badge/Built%20with-v0.dev-black?style=for-the-badge)](https://v0.dev/chat/projects/sEuJVvR05cr)
[![Tests](https://github.com/your-username/v0-music-player-requirements/actions/workflows/ci.yml/badge.svg)](https://github.com/your-username/v0-music-player-requirements/actions)
[![Coverage](https://codecov.io/gh/your-username/v0-music-player-requirements/branch/main/graph/badge.svg)](https://codecov.io/gh/your-username/v0-music-player-requirements)

## ✨ Features

### 🎵 Core Audio Features
- **High-Quality Playback**: Support for FLAC, MP3, WAV, AAC, and more
- **Professional Equalizer**: Multi-band EQ with presets and custom settings
- **Gapless Playback**: Seamless transitions between tracks
- **Crossfade Support**: Smooth track transitions
- **Audio Visualization**: Real-time frequency analysis

### 🎬 YouTube Integration
- **Synchronized Video Playback**: Watch music videos in sync with audio
- **Automatic Video Discovery**: Smart matching of songs to music videos
- **Caching System**: Optimized video loading and caching
- **Multiple Video Options**: Alternative video suggestions

### 📚 Playlist Management
- **Smart Organization**: Group by artist, album, or custom categories  
- **Shuffle & Repeat**: Advanced playback modes
- **Cloud Sync**: Save and share playlists via Supabase
- **Import/Export**: Support for various playlist formats

### 🎨 User Experience
- **Responsive Design**: Optimized for desktop and mobile
- **Dark/Light Themes**: Automatic theme switching
- **Accessibility**: Full keyboard navigation and screen reader support
- **Performance Optimized**: Fast loading and smooth animations

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm
- Supabase account (for cloud features)
- YouTube Data API key (for video integration)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/v0-music-player-requirements.git
   cd v0-music-player-requirements
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   ```bash
   cp .env.local.example .env.local
   ```
   
   Configure your environment variables:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_key
   NEXT_PUBLIC_YOUTUBE_API_KEY=your_youtube_api_key
   ```

4. **Database Setup**
   ```bash
   # Run the Supabase setup script
   npm run db:setup
   ```

5. **Start Development Server**
   ```bash
   npm run dev
   ```

Visit [http://localhost:3000](http://localhost:3000) to see the application.

## 🧪 Testing

### Unit Tests
```bash
npm run test              # Run tests once
npm run test:watch        # Run tests in watch mode
npm run test:coverage     # Run tests with coverage
```

### E2E Tests
```bash
npm run test:e2e          # Run Playwright tests
npm run test:e2e:ui       # Run with UI mode
```

### Performance Testing
```bash
npm run lighthouse        # Run Lighthouse performance audit
```

## 📁 Project Structure

```
├── app/                  # Next.js app router
│   ├── layout.tsx       # Root layout with providers
│   └── page.tsx         # Main application page
├── components/          
│   ├── ui/              # shadcn/ui components
│   ├── player/          # Music player components
│   ├── error-boundary.tsx
│   └── ...
├── lib/                 
│   ├── logger.ts        # Logging system
│   ├── security.ts      # Security utilities
│   ├── schemas.ts       # Zod validation schemas
│   └── performance.ts   # Performance monitoring
├── utils/               # Utility functions
├── hooks/               # Custom React hooks
├── __tests__/           # Unit tests
├── e2e/                 # E2E tests
└── docs/                # Additional documentation
```

## 🔧 Configuration

### Audio Settings
Configure audio processing in `utils/audio-processor.ts`:
- Sample rates and bit depths
- Equalizer bands and presets
- Crossfade and gapless settings

### YouTube Integration
Set up YouTube features in `utils/youtube-service.ts`:
- API quotas and rate limiting
- Video quality preferences
- Caching strategies

### Database Schema
Database setup is in `supabase-setup.sql`:
- User management
- Playlist storage
- Session sharing

## 📊 Performance

The application is optimized for performance:
- **Bundle Size**: < 500KB gzipped
- **First Contentful Paint**: < 2s
- **Largest Contentful Paint**: < 3s
- **Cumulative Layout Shift**: < 0.1

Performance monitoring is built-in with detailed metrics.

## 🔒 Security

Security measures include:
- Content Security Policy (CSP)
- Input validation and sanitization
- API key rotation and validation
- Rate limiting for external APIs
- Secure file upload handling

## 🚀 Deployment

### Vercel (Recommended)
```bash
npm run build
vercel --prod
```

### Docker
```bash
docker build -t music-player .
docker run -p 3000:3000 music-player
```

### Environment Variables
Required for production:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` 
- `NEXT_PUBLIC_YOUTUBE_API_KEY`

## 📚 Documentation

- [Setup Guide](./docs/SETUP.md)
- [YouTube Integration](./YOUTUBE_SETUP.md)
- [Supabase Configuration](./SUPABASE_SETUP.md)
- [API Documentation](./docs/API.md)
- [Contributing Guidelines](./docs/CONTRIBUTING.md)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Please read our [Contributing Guidelines](./docs/CONTRIBUTING.md) for details.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [Next.js](https://nextjs.org/) and [React](https://reactjs.org/)
- UI components from [shadcn/ui](https://ui.shadcn.com/)
- Database powered by [Supabase](https://supabase.com/)
- YouTube integration via [YouTube Data API](https://developers.google.com/youtube/v3)

## 📞 Support

If you encounter any issues:
1. Check the [troubleshooting guide](./docs/TROUBLESHOOTING.md)
2. Search existing [GitHub issues](https://github.com/your-username/v0-music-player-requirements/issues)
3. Create a new issue with detailed information

---

Made with ❤️ for music lovers everywhere