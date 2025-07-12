'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { 
  Share2, 
  Users, 
  Play, 
  Pause, 
  Copy, 
  Check,
  Music,
  User,
  Clock
} from 'lucide-react'
import { useSupabaseSession } from '@/hooks/useSupabaseSession'
import { useSupabasePlaylists } from '@/hooks/useSupabasePlaylists'
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth'
import { toast } from '@/hooks/use-toast'

interface SupabaseSharingPanelProps {
  currentSong?: any
  isPlaying?: boolean
  currentTime?: number
  onPlayPause?: () => void
  onSeek?: (time: number) => void
}

export function SupabaseSharingPanel({
  currentSong,
  isPlaying = false,
  currentTime = 0,
  onPlayPause,
  onSeek
}: SupabaseSharingPanelProps) {
  const { user } = useSupabaseAuth()
  const { playlists, currentPlaylist, createPlaylist, loadPlaylist } = useSupabasePlaylists()
  const { 
    currentSession, 
    isHost, 
    sessionLoading, 
    createSession, 
    joinSession, 
    leaveSession,
    updatePlaybackState 
  } = useSupabaseSession()

  const [sessionCode, setSessionCode] = useState('')
  const [copied, setCopied] = useState(false)
  const [showJoinForm, setShowJoinForm] = useState(false)

  // Handle creating a new session
  const handleCreateSession = async () => {
    if (!currentPlaylist) {
      toast({
        title: "No Playlist Selected",
        description: "Please select a playlist first",
        variant: "destructive",
      })
      return
    }

    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to create a session",
        variant: "destructive",
      })
      return
    }

    const session = await createSession(currentPlaylist.id)
    if (session) {
      setSessionCode(session.session_code)
    }
  }

  // Handle joining a session
  const handleJoinSession = async () => {
    if (!sessionCode.trim()) {
      toast({
        title: "Session Code Required",
        description: "Please enter a session code",
        variant: "destructive",
      })
      return
    }

    const session = await joinSession(sessionCode.trim())
    if (session) {
      setShowJoinForm(false)
      setSessionCode('')
    }
  }

  // Handle leaving session
  const handleLeaveSession = async () => {
    await leaveSession()
    setSessionCode('')
  }

  // Copy session code to clipboard
  const copySessionCode = async () => {
    if (!currentSession?.session_code) return

    try {
      await navigator.clipboard.writeText(currentSession.session_code)
      setCopied(true)
      toast({
        title: "Copied!",
        description: "Session code copied to clipboard",
      })
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea')
      textArea.value = currentSession.session_code
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      
      setCopied(true)
      toast({
        title: "Copied!",
        description: "Session code copied to clipboard",
      })
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // Update playback state when it changes
  const handlePlayPause = () => {
    if (onPlayPause) {
      onPlayPause()
    }
    
    // Update session state
    if (currentSession && isHost) {
      updatePlaybackState(!isPlaying, currentTime, currentSong?.id)
    }
  }

  // Format time
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  if (!user) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            Music Sharing
          </CardTitle>
          <CardDescription>
            Sign in to share your music with friends
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full" variant="outline">
            Sign In to Share
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Current Session Status */}
      {currentSession && (
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Active Session
              <Badge variant={isHost ? "default" : "secondary"}>
                {isHost ? "Host" : "Guest"}
              </Badge>
            </CardTitle>
            <CardDescription>
              Session Code: {currentSession.session_code}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Current Song Info */}
            {currentSong && (
              <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                <Music className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{currentSong.title || 'Unknown Title'}</p>
                  <p className="text-sm text-muted-foreground truncate">
                    {currentSong.artist || 'Unknown Artist'}
                  </p>
                </div>
                <div className="text-sm text-muted-foreground">
                  {formatTime(currentTime)}
                </div>
              </div>
            )}

            {/* Playback Controls */}
            <div className="flex items-center justify-between">
              <Button
                size="sm"
                onClick={handlePlayPause}
                disabled={!isHost}
                className="flex items-center gap-2"
              >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {isPlaying ? 'Pause' : 'Play'}
              </Button>
              
              <Button
                size="sm"
                variant="outline"
                onClick={copySessionCode}
                className="flex items-center gap-2"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                Copy Code
              </Button>
            </div>

            <Separator />

            <Button
              variant="destructive"
              onClick={handleLeaveSession}
              className="w-full"
            >
              Leave Session
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Create/Join Session */}
      {!currentSession && (
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Share2 className="h-5 w-5" />
              Share Music
            </CardTitle>
            <CardDescription>
              Create or join a music sharing session
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Playlist Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Select Playlist</label>
              <select
                className="w-full p-2 border rounded-md"
                value={currentPlaylist?.id || ''}
                onChange={(e) => {
                  if (e.target.value) {
                    loadPlaylist(e.target.value)
                  }
                }}
              >
                <option value="">Choose a playlist...</option>
                {playlists.map((playlist) => (
                  <option key={playlist.id} value={playlist.id}>
                    {playlist.name}
                  </option>
                ))}
              </select>
            </div>

            <Separator />

            {/* Create Session */}
            <div className="space-y-2">
              <Button
                onClick={handleCreateSession}
                disabled={!currentPlaylist || sessionLoading}
                className="w-full"
              >
                {sessionLoading ? 'Creating...' : 'Create Session'}
              </Button>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  Or
                </span>
              </div>
            </div>

            {/* Join Session */}
            <div className="space-y-2">
              {!showJoinForm ? (
                <Button
                  variant="outline"
                  onClick={() => setShowJoinForm(true)}
                  className="w-full"
                >
                  Join Session
                </Button>
              ) : (
                <div className="space-y-2">
                  <Input
                    placeholder="Enter session code"
                    value={sessionCode}
                    onChange={(e) => setSessionCode(e.target.value.toUpperCase())}
                    maxLength={6}
                  />
                  <div className="flex gap-2">
                    <Button
                      onClick={handleJoinSession}
                      disabled={!sessionCode.trim() || sessionLoading}
                      className="flex-1"
                    >
                      {sessionLoading ? 'Joining...' : 'Join'}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowJoinForm(false)
                        setSessionCode('')
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
} 