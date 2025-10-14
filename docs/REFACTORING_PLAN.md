# Component Refactoring Plan - Enhanced Music Player

## Current State
- **File**: `enhanced-music-player.tsx`
- **Lines**: 1160 lines
- **State Variables**: 25
- **useEffect Hooks**: 6
- **useCallback Hooks**: 11
- **Complexity**: High

## Problem
The component has grown too large and handles too many concerns:
1. Audio playback engine (Web Audio API)
2. Playlist management (shuffle, queue, sorting)
3. File handling (upload, metadata extraction)
4. UI state (views, dialogs, loading states)
5. Keyboard controls and media session
6. Network sharing
7. Equalizer management
8. Storage persistence

## Refactoring Strategy

### Phase 1: Extract Custom Hooks

#### 1.1 `useAudioEngine` Hook
**Purpose**: Manage Web Audio API, playback, and audio node connections
**Extracts**:
- `audioRef`, `audioContextRef`, `sourceNodeRef`, `gainNodeRef`, `analyserRef`
- `playPromiseRef`, `filterNodes`
- `initializeAudioContext()`
- Audio event handlers (timeupdate, loadedmetadata, ended)

**Returns**:
```typescript
{
  audioRef,
  isPlaying,
  currentTime,
  duration,
  volume,
  isMuted,
  play: () => Promise<void>,
  pause: () => void,
  seek: (time: number) => void,
  setVolume: (vol: number) => void,
  toggleMute: () => void,
  filterNodes,
  initAudioContext: () => void
}
```

#### 1.2 `usePlaylistManager` Hook
**Purpose**: Handle playlist logic, shuffle, queue management
**Extracts**:
- `songs`, `currentSong`, `shuffleMode`, `viewMode`
- `shuffledQueue`, `currentShuffleIndex`, `playedSongs`
- `sortedSongs` (useMemo)
- `getCurrentPlaylist()`, `generateShuffledQueue()`
- `getNextSong()`, `getPreviousSong()`
- `toggleShuffle()`

**Returns**:
```typescript
{
  songs,
  currentSong,
  shuffleMode,
  viewMode,
  sortedSongs,
  setViewMode,
  addSongs,
  removeSong,
  resetPlaylist,
  selectSong,
  nextSong,
  previousSong,
  toggleShuffle
}
```

#### 1.3 `useFileImporter` Hook
**Purpose**: Handle file uploads and metadata extraction
**Extracts**:
- `isLoadingSongs`, `loadingProgress`
- `processingRef`, `fileInputRef`, `folderInputRef`
- `addSongsToPlaylist()`
- `handleFileUpload()`, `handleFolderUpload()`

**Returns**:
```typescript
{
  isLoadingSongs,
  loadingProgress,
  fileInputRef,
  folderInputRef,
  handleFileUpload,
  handleFolderUpload,
  addSongsToPlaylist
}
```

#### 1.4 `usePlaylistPersistence` Hook
**Purpose**: Handle saving/loading playlist from IndexedDB
**Extracts**:
- `isInitialized`, `isRestoringPlaylist`
- Load/save useEffect hooks
- Playlist restoration logic

**Returns**:
```typescript
{
  isInitialized,
  isRestoringPlaylist,
  restorePlaylist: () => Promise<void>,
  savePlaylist: () => Promise<void>
}
```

#### 1.5 `useMediaControls` Hook
**Purpose**: Keyboard shortcuts and Media Session API
**Extracts**:
- Media key event handlers
- Media Session API integration
- Keyboard shortcut logic

**Returns**:
```typescript
{
  // Side effects only, no return needed
}
```

#### 1.6 `useEqualizerManager` Hook
**Purpose**: Equalizer state and filter management
**Extracts**:
- `equalizerBands`, `showEqualizer`
- `updateEqualizerBand()`, `resetEqualizer()`
- Filter node management

**Returns**:
```typescript
{
  equalizerBands,
  showEqualizer,
  setShowEqualizer,
  updateBand,
  resetEqualizer
}
```

### Phase 2: Extract UI Components

#### 2.1 `PlayerControls` Component
**Purpose**: Play/pause, skip, volume controls
**Props**:
```typescript
{
  isPlaying: boolean
  currentSong: Song | null
  volume: number[]
  isMuted: boolean
  onPlayPause: () => void
  onNext: () => void
  onPrevious: () => void
  onVolumeChange: (vol: number[]) => void
  onMute: () => void
  onOpenEqualizer: () => void
  onOpenLyrics: () => void
  onOpenYoutube: () => void
  disabled: boolean
}
```

#### 2.2 `SongInfoDisplay` Component
**Purpose**: Display current song info, album art, metadata badges
**Props**:
```typescript
{
  currentSong: Song | null
  currentBitrate?: number
  isTransitioning: boolean
}
```

#### 2.3 `ProgressBar` Component
**Purpose**: Time slider and time display
**Props**:
```typescript
{
  currentTime: number
  duration: number
  onSeek: (time: number) => void
}
```

#### 2.4 `ViewSwitcher` Component
**Purpose**: Handle switching between player/lyrics/youtube views
**Props**:
```typescript
{
  activeView: "player" | "lyrics" | "youtube"
  currentSong: Song | null
  // ... other view-specific props
}
```

### Phase 3: Simplified Main Component

After refactoring, `enhanced-music-player.tsx` should be ~200-300 lines:
- Import and use custom hooks
- Coordinate between hooks
- Render layout and child components
- Handle view switching

## File Structure After Refactoring

```
hooks/
  ├── use-audio-engine.ts          (~150 lines)
  ├── use-playlist-manager.ts      (~200 lines)
  ├── use-file-importer.ts         (~100 lines)
  ├── use-playlist-persistence.ts  (~150 lines)
  ├── use-media-controls.ts        (~200 lines)
  └── use-equalizer-manager.ts     (~80 lines)

components/
  ├── player-controls.tsx          (~120 lines)
  ├── song-info-display.tsx        (~80 lines)
  ├── progress-bar.tsx             (~40 lines)
  └── view-switcher.tsx            (~100 lines)

enhanced-music-player.tsx          (~250 lines)
```

## Benefits

1. **Maintainability**: Each file has a single responsibility
2. **Testability**: Hooks and components can be tested in isolation
3. **Reusability**: Hooks can be used in mobile-music-player.tsx too
4. **Readability**: Easier to understand and navigate
5. **Performance**: Better code splitting opportunities
6. **Collaboration**: Multiple developers can work on different parts

## Implementation Order

1. ✅ Create this refactoring plan
2. Create `hooks/use-audio-engine.ts`
3. Create `hooks/use-playlist-manager.ts`
4. Create `hooks/use-equalizer-manager.ts`
5. Create `hooks/use-file-importer.ts`
6. Create `hooks/use-playlist-persistence.ts`
7. Create `hooks/use-media-controls.ts`
8. Create `components/player-controls.tsx`
9. Create `components/song-info-display.tsx`
10. Create `components/progress-bar.tsx`
11. Refactor main component to use new hooks/components
12. Test thoroughly
13. Update mobile-music-player.tsx to use shared hooks (future)

## Testing Strategy

For each extracted hook/component:
- Unit tests for logic
- Integration tests for hook interactions
- Visual tests for components
- E2E tests for critical user flows

---

**Status**: Planning Complete
**Next Step**: Implement use-audio-engine.ts
