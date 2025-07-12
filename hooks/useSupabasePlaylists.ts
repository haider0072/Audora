import { useState, useEffect } from 'react'
import { supabase, type Playlist, type Song } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'

export function useSupabasePlaylists() {
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [loading, setLoading] = useState(true)
  const [currentPlaylist, setCurrentPlaylist] = useState<Playlist | null>(null)
  const [playlistSongs, setPlaylistSongs] = useState<Song[]>([])

  // Fetch all playlists
  const fetchPlaylists = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('playlists')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching playlists:', error)
        toast({
          title: "Error",
          description: "Failed to load playlists",
          variant: "destructive",
        })
      } else {
        setPlaylists(data || [])
      }
    } catch (error) {
      console.error('Error fetching playlists:', error)
    } finally {
      setLoading(false)
    }
  }

  // Create a new playlist
  const createPlaylist = async (name: string, description?: string, isPublic = false) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        toast({
          title: "Authentication Required",
          description: "Please sign in to create playlists",
          variant: "destructive",
        })
        return null
      }

      const { data, error } = await supabase
        .from('playlists')
        .insert([{
          name,
          description,
          user_id: user.id,
          is_public: isPublic
        }])
        .select()

      if (error) {
        console.error('Error creating playlist:', error)
        toast({
          title: "Error",
          description: "Failed to create playlist",
          variant: "destructive",
        })
        return null
      }

      const newPlaylist = data[0]
      setPlaylists(prev => [newPlaylist, ...prev])
      
      toast({
        title: "Success",
        description: `Playlist "${name}" created successfully`,
      })

      return newPlaylist
    } catch (error) {
      console.error('Error creating playlist:', error)
      return null
    }
  }

  // Add songs to a playlist
  const addSongsToPlaylist = async (playlistId: string, songs: any[]) => {
    try {
      const songsToInsert = songs.map(song => ({
        playlist_id: playlistId,
        title: song.title,
        artist: song.artist,
        album: song.album,
        duration: song.duration,
        file_path: song.file_path,
        album_art_url: song.album_art_url,
        metadata: song.metadata || {}
      }))

      const { data, error } = await supabase
        .from('songs')
        .insert(songsToInsert)
        .select()

      if (error) {
        console.error('Error adding songs to playlist:', error)
        toast({
          title: "Error",
          description: "Failed to add songs to playlist",
          variant: "destructive",
        })
        return false
      }

      // Update local state
      if (currentPlaylist?.id === playlistId) {
        setPlaylistSongs(prev => [...prev, ...data])
      }

      toast({
        title: "Success",
        description: `Added ${songs.length} songs to playlist`,
      })

      return true
    } catch (error) {
      console.error('Error adding songs to playlist:', error)
      return false
    }
  }

  // Fetch songs for a specific playlist
  const fetchPlaylistSongs = async (playlistId: string) => {
    try {
      const { data, error } = await supabase
        .from('songs')
        .select('*')
        .eq('playlist_id', playlistId)
        .order('created_at', { ascending: true })

      if (error) {
        console.error('Error fetching playlist songs:', error)
        return []
      }

      return data || []
    } catch (error) {
      console.error('Error fetching playlist songs:', error)
      return []
    }
  }

  // Load a playlist and its songs
  const loadPlaylist = async (playlistId: string) => {
    try {
      // Get playlist details
      const { data: playlistData, error: playlistError } = await supabase
        .from('playlists')
        .select('*')
        .eq('id', playlistId)
        .single()

      if (playlistError) {
        console.error('Error fetching playlist:', playlistError)
        return false
      }

      setCurrentPlaylist(playlistData)

      // Get playlist songs
      const songs = await fetchPlaylistSongs(playlistId)
      setPlaylistSongs(songs)

      return true
    } catch (error) {
      console.error('Error loading playlist:', error)
      return false
    }
  }

  // Delete a playlist
  const deletePlaylist = async (playlistId: string) => {
    try {
      const { error } = await supabase
        .from('playlists')
        .delete()
        .eq('id', playlistId)

      if (error) {
        console.error('Error deleting playlist:', error)
        toast({
          title: "Error",
          description: "Failed to delete playlist",
          variant: "destructive",
        })
        return false
      }

      setPlaylists(prev => prev.filter(p => p.id !== playlistId))
      
      if (currentPlaylist?.id === playlistId) {
        setCurrentPlaylist(null)
        setPlaylistSongs([])
      }

      toast({
        title: "Success",
        description: "Playlist deleted successfully",
      })

      return true
    } catch (error) {
      console.error('Error deleting playlist:', error)
      return false
    }
  }

  // Set up real-time subscriptions
  useEffect(() => {
    fetchPlaylists()

    // Subscribe to playlist changes
    const playlistSubscription = supabase
      .channel('playlists')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'playlists' },
        (payload) => {
          console.log('Playlist change:', payload)
          fetchPlaylists()
        }
      )
      .subscribe()

    // Subscribe to song changes
    const songSubscription = supabase
      .channel('songs')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'songs' },
        (payload) => {
          console.log('Song change:', payload)
          if (currentPlaylist) {
            fetchPlaylistSongs(currentPlaylist.id).then(setPlaylistSongs)
          }
        }
      )
      .subscribe()

    return () => {
      playlistSubscription.unsubscribe()
      songSubscription.unsubscribe()
    }
  }, [currentPlaylist?.id])

  return {
    playlists,
    currentPlaylist,
    playlistSongs,
    loading,
    createPlaylist,
    addSongsToPlaylist,
    loadPlaylist,
    deletePlaylist,
    fetchPlaylists
  }
} 