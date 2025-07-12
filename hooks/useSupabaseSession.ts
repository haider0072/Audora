import { useState, useEffect } from 'react'
import { supabase, type Session } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'

export function useSupabaseSession() {
  const [currentSession, setCurrentSession] = useState<Session | null>(null)
  const [isHost, setIsHost] = useState(false)
  const [connectedUsers, setConnectedUsers] = useState<any[]>([])
  const [sessionLoading, setSessionLoading] = useState(false)

  // Create a new session
  const createSession = async (playlistId: string) => {
    try {
      setSessionLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        toast({
          title: "Authentication Required",
          description: "Please sign in to create a session",
          variant: "destructive",
        })
        return null
      }

      // Generate a unique session code
      const sessionCode = Math.random().toString(36).substring(2, 8).toUpperCase()

      const { data, error } = await supabase
        .from('sessions')
        .insert([{
          playlist_id: playlistId,
          host_id: user.id,
          session_code: sessionCode,
          is_active: true,
          current_time: 0,
          is_playing: false
        }])
        .select()

      if (error) {
        console.error('Error creating session:', error)
        toast({
          title: "Error",
          description: "Failed to create session",
          variant: "destructive",
        })
        return null
      }

      const newSession = data[0]
      setCurrentSession(newSession)
      setIsHost(true)

      toast({
        title: "Session Created",
        description: `Share code: ${sessionCode}`,
      })

      return newSession
    } catch (error) {
      console.error('Error creating session:', error)
      return null
    } finally {
      setSessionLoading(false)
    }
  }

  // Join an existing session
  const joinSession = async (sessionCode: string) => {
    try {
      setSessionLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        toast({
          title: "Authentication Required",
          description: "Please sign in to join a session",
          variant: "destructive",
        })
        return null
      }

      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('session_code', sessionCode.toUpperCase())
        .eq('is_active', true)
        .single()

      if (error || !data) {
        toast({
          title: "Session Not Found",
          description: "Invalid session code or session has ended",
          variant: "destructive",
        })
        return null
      }

      setCurrentSession(data)
      setIsHost(data.host_id === user.id)

      toast({
        title: "Joined Session",
        description: `Connected to ${data.session_code}`,
      })

      return data
    } catch (error) {
      console.error('Error joining session:', error)
      return null
    } finally {
      setSessionLoading(false)
    }
  }

  // Leave session
  const leaveSession = async () => {
    if (currentSession && isHost) {
      // If host, end the session
      const { error } = await supabase
        .from('sessions')
        .update({ is_active: false })
        .eq('id', currentSession.id)

      if (error) {
        console.error('Error ending session:', error)
      }
    }

    setCurrentSession(null)
    setIsHost(false)
    setConnectedUsers([])
  }

  // Update playback state
  const updatePlaybackState = async (isPlaying: boolean, currentTime: number, currentSongId?: string) => {
    if (!currentSession) return

    try {
      const { error } = await supabase
        .from('sessions')
        .update({
          is_playing: isPlaying,
          playback_time: currentTime,
          current_song_id: currentSongId
        })
        .eq('id', currentSession.id)

      if (error) {
        console.error('Error updating playback state:', error)
      }
    } catch (error) {
      console.error('Error updating playback state:', error)
    }
  }

  // Get session info
  const getSessionInfo = async (sessionId: string) => {
    try {
      const { data, error } = await supabase
        .from('sessions')
        .select(`
          id,
          playlist_id,
          host_id,
          session_code,
          is_active,
          current_song_id,
          playback_time,
          is_playing,
          created_at,
          playlists (
            id,
            name,
            description
          ),
          songs (
            id,
            title,
            artist,
            album,
            duration,
            album_art_url
          )
        `)
        .eq('id', sessionId)
        .single()

      if (error) {
        console.error('Error fetching session info:', error)
        return null
      }

      return data
    } catch (error) {
      console.error('Error fetching session info:', error)
      return null
    }
  }

  // Set up real-time subscriptions for session updates
  useEffect(() => {
    if (!currentSession) return

    const sessionSubscription = supabase
      .channel(`session:${currentSession.id}`)
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'sessions',
          filter: `id=eq.${currentSession.id}`
        },
        (payload) => {
          console.log('Session update:', payload)
          if (payload.eventType === 'UPDATE') {
            setCurrentSession(payload.new as Session)
          } else if (payload.eventType === 'DELETE') {
            // Session was ended
            setCurrentSession(null)
            setIsHost(false)
            toast({
              title: "Session Ended",
              description: "The host has ended the session",
            })
          }
        }
      )
      .subscribe()

    return () => {
      sessionSubscription.unsubscribe()
    }
  }, [currentSession?.id])

  return {
    currentSession,
    isHost,
    connectedUsers,
    sessionLoading,
    createSession,
    joinSession,
    leaveSession,
    updatePlaybackState,
    getSessionInfo
  }
} 