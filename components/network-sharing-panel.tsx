"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/hooks/use-toast"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Share2,
  Wifi,
  WifiOff,
  Music,
  User,
  StopCircle,
  RefreshCw,
  Shield,
  AlertTriangle,
  Users,
  Radio,
  Copy,
  X,
  Clock,
  ExternalLink,
} from "lucide-react"
import { NetworkSharingService, type NetworkPeer, type SharedPlaylist } from "../utils/network-sharing"

interface NetworkSharingPanelProps {
  songs: Array<{
    id: string
    title?: string
    artist?: string
    album?: string
    duration?: number
    format?: string
    isHiRes?: boolean
  }>
  currentSong?: {
    id: string
    title?: string
    artist?: string
  } | null
  isPlaying: boolean
  currentTime: number
  onPlaylistUpdate?: (songs: any[]) => void
  onPlaybackStateUpdate?: (isPlaying: boolean, currentTime: number, currentSong?: string) => void
  onClose?: () => void
}

export function NetworkSharingPanel({
  songs,
  currentSong,
  isPlaying,
  currentTime,
  onPlaylistUpdate,
  onPlaybackStateUpdate,
  onClose,
}: NetworkSharingPanelProps) {
  const [sharingService] = useState(() => NetworkSharingService.getInstance())
  const [isSharing, setIsSharing] = useState(false)
  const [connectedPeers, setConnectedPeers] = useState<NetworkPeer[]>([])
  const [sharedPlaylists, setSharedPlaylists] = useState<SharedPlaylist[]>([])
  const [playlistName, setPlaylistName] = useState("My Playlist")
  const [peerName, setPeerName] = useState("")
  const [showShareDialog, setShowShareDialog] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isDiscovering, setIsDiscovering] = useState(false)
  const [shareUrl, setShareUrl] = useState("")
  const [sharePlaybackState, setSharePlaybackState] = useState(true)
  const [allowRemoteControl, setAllowRemoteControl] = useState(false)
  const [joinUrl, setJoinUrl] = useState("")

  useEffect(() => {
    // Initialize peer name
    setPeerName(sharingService.getPeerName())

    // Set up event listeners
    const handlePlaylistDiscovered = (playlist: SharedPlaylist) => {
      console.log("Playlist discovered:", playlist)
      setSharedPlaylists((prev) => {
        const existing = prev.find((p) => p.id === playlist.id)
        if (existing) {
          return prev.map((p) => (p.id === playlist.id ? playlist : p))
        }
        return [...prev, playlist]
      })
    }

    const handlePeerConnected = (peerId: string) => {
      console.log("Peer connected:", peerId)
      setConnectedPeers(sharingService.getConnectedPeers())
      toast({
        title: "Peer Connected",
        description: `A new device has joined your playlist`,
      })
    }

    const handlePeerDisconnected = (peerId: string) => {
      console.log("Peer disconnected:", peerId)
      setConnectedPeers(sharingService.getConnectedPeers())
      toast({
        title: "Peer Disconnected",
        description: `A device has left your playlist`,
        variant: "destructive",
      })
    }

    const handlePlaylistUpdated = (playlist: any) => {
      console.log("Playlist updated:", playlist)
      if (onPlaylistUpdate) {
        onPlaylistUpdate(playlist.songs)
      }
      toast({
        title: "Playlist Updated",
        description: `${playlist.name} has been updated by ${playlist.hostName}`,
      })
    }

    const handlePlaybackStateUpdated = (data: any) => {
      console.log("Playback state updated:", data)
      if (onPlaybackStateUpdate) {
        onPlaybackStateUpdate(data.isPlaying, data.currentTime, data.currentSong)
      }
    }

    // Register event listeners
    sharingService.on("playlist_discovered", handlePlaylistDiscovered)
    sharingService.on("peer_connected", handlePeerConnected)
    sharingService.on("peer_disconnected", handlePeerDisconnected)
    sharingService.on("playlist_updated", handlePlaylistUpdated)
    sharingService.on("playback_state_updated", handlePlaybackStateUpdated)

    // Initial updates
    setConnectedPeers(sharingService.getConnectedPeers())
    setSharedPlaylists(sharingService.getSharedPlaylists())
    setIsSharing(sharingService.isSharing())

    // Check for URL-based join on load
    const urlParams = new URLSearchParams(window.location.search)
    const joinPlaylistId = urlParams.get("join")
    if (joinPlaylistId) {
      handleJoinFromUrl()
    }

    return () => {
      // Cleanup event listeners
      sharingService.off("playlist_discovered", handlePlaylistDiscovered)
      sharingService.off("peer_connected", handlePeerConnected)
      sharingService.off("peer_disconnected", handlePeerDisconnected)
      sharingService.off("playlist_updated", handlePlaylistUpdated)
      sharingService.off("playback_state_updated", handlePlaybackStateUpdated)
    }
  }, [sharingService, onPlaylistUpdate, onPlaybackStateUpdate])

  // Update playlist when songs change
  useEffect(() => {
    if (isSharing) {
      sharingService.updatePlaylist(songs)
    }
  }, [songs, isSharing, sharingService])

  // Update playback state
  useEffect(() => {
    if (isSharing && sharePlaybackState) {
      sharingService.updatePlaybackState(isPlaying, currentTime, currentSong?.id)
    }
  }, [isPlaying, currentTime, currentSong, isSharing, sharePlaybackState, sharingService])

  const handleStartSharing = async () => {
    if (songs.length === 0) {
      toast({
        title: "No Songs to Share",
        description: "Add some songs to your playlist before sharing.",
        variant: "destructive",
      })
      return
    }

    try {
      setIsConnecting(true)
      const url = await sharingService.sharePlaylist(songs, playlistName)
      setIsSharing(true)
      setShareUrl(url)
      setShowShareDialog(false)

      toast({
        title: "Playlist Shared Successfully",
        description: `Your playlist "${playlistName}" is now available. Share the URL with friends!`,
      })
    } catch (error) {
      console.error("Error sharing playlist:", error)
      toast({
        title: "Sharing Failed",
        description: "Failed to share playlist. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsConnecting(false)
    }
  }

  const handleStopSharing = () => {
    sharingService.stopSharing()
    setIsSharing(false)
    setShareUrl("")
    setConnectedPeers([])

    toast({
      title: "Sharing Stopped",
      description: "Your playlist is no longer being shared.",
    })
  }

  const handleUpdatePeerName = () => {
    if (peerName.trim()) {
      sharingService.setPeerName(peerName.trim())
      toast({
        title: "Name Updated",
        description: `Your display name has been updated to "${peerName.trim()}".`,
      })
    }
  }

  const handleDiscoverPlaylists = async () => {
    try {
      setIsDiscovering(true)
      const playlists = await sharingService.discoverPlaylists()
      setSharedPlaylists(playlists)

      if (playlists.length === 0) {
        toast({
          title: "No Playlists Found",
          description: "No shared playlists found. Make sure other devices are sharing on the same network.",
        })
      } else {
        toast({
          title: "Playlists Found",
          description: `Found ${playlists.length} shared playlist${playlists.length !== 1 ? "s" : ""}.`,
        })
      }
    } catch (error) {
      console.error("Failed to discover playlists:", error)
      toast({
        title: "Discovery Failed",
        description: "Unable to search for shared playlists.",
        variant: "destructive",
      })
    } finally {
      setIsDiscovering(false)
    }
  }

  const handleJoinPlaylist = async (playlistId: string, playlistName: string) => {
    try {
      setIsConnecting(true)
      await sharingService.joinPlaylist(playlistId)

      toast({
        title: "Joined Playlist",
        description: `Successfully joined "${playlistName}". You'll receive updates from the host.`,
      })
    } catch (error) {
      console.error("Failed to join playlist:", error)
      toast({
        title: "Join Failed",
        description: `Unable to join "${playlistName}". Please try again.`,
        variant: "destructive",
      })
    } finally {
      setIsConnecting(false)
    }
  }

  const handleJoinFromUrl = async () => {
    if (!joinUrl.trim()) {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid share URL.",
        variant: "destructive",
      })
      return
    }

    try {
      setIsConnecting(true)
      await sharingService.joinFromUrl(joinUrl)
      setJoinUrl("")

      toast({
        title: "Joined Successfully",
        description: "Connected to shared playlist from URL.",
      })
    } catch (error) {
      console.error("Failed to join from URL:", error)
      toast({
        title: "Join Failed",
        description: "Unable to join from the provided URL. Please check the URL and try again.",
        variant: "destructive",
      })
    } finally {
      setIsConnecting(false)
    }
  }

  const copyShareUrl = () => {
    if (shareUrl) {
      navigator.clipboard
        .writeText(shareUrl)
        .then(() => {
          toast({
            title: "Link Copied",
            description: "Share link has been copied to clipboard.",
          })
        })
        .catch(() => {
          toast({
            title: "Copy Failed",
            description: "Failed to copy link to clipboard.",
            variant: "destructive",
          })
        })
    }
  }

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    return `${minutes}:${seconds.toString().padStart(2, "0")}`
  }

  const formatDuration = (songs: any[]) => {
    const totalDuration = songs.reduce((total, song) => total + (song.duration || 0), 0)
    return formatTime(totalDuration)
  }

  return (
    <Card className="bg-transparent border-none shadow-none">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Share2 className="w-5 h-5" />
            Network Sharing
            {isSharing && (
              <Badge variant="default" className="bg-green-600">
                <Radio className="w-3 h-3 mr-1" />
                Live
              </Badge>
            )}
          </CardTitle>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Peer Identity */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Your Display Name</Label>
          <div className="flex gap-2">
            <Input
              value={peerName}
              onChange={(e) => setPeerName(e.target.value)}
              placeholder="Enter your display name"
              className="flex-1"
            />
            <Button onClick={handleUpdatePeerName} variant="outline" size="sm">
              Update
            </Button>
          </div>
        </div>

        <Separator />

        {/* Connection Status */}
        <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-3">
            <div className={isSharing ? "text-green-500" : "text-muted-foreground"}>
              {isSharing ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
            </div>
            <div>
              <p className="font-medium">{isSharing ? "Hosting Playlist" : "Not Sharing"}</p>
              <p className="text-sm text-muted-foreground">
                {isSharing
                  ? `${connectedPeers.length} device${connectedPeers.length !== 1 ? "s" : ""} connected`
                  : "Share your playlist or join another device"}
              </p>
            </div>
          </div>
          {isSharing && (
            <Badge variant="secondary" className="flex items-center gap-1">
              <Users className="w-3 h-3" />
              {connectedPeers.length + 1}
            </Badge>
          )}
        </div>

        {/* Sharing Controls */}
        {!isSharing ? (
          <div className="space-y-4">
            <div className="text-center">
              <h3 className="text-lg font-semibold mb-2">Share Your Playlist</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Share your current playlist with others. They'll be able to see your songs and follow along with your
                playback in real-time.
              </p>
            </div>

            <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
              <DialogTrigger asChild>
                <Button className="w-full" disabled={songs.length === 0}>
                  <Share2 className="w-4 h-4 mr-2" />
                  Start Sharing Playlist
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Share Your Playlist</DialogTitle>
                  <DialogDescription>
                    Configure your playlist sharing settings. Others will be able to discover and listen to your
                    playlist.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="playlist-name">Playlist Name</Label>
                    <Input
                      id="playlist-name"
                      value={playlistName}
                      onChange={(e) => setPlaylistName(e.target.value)}
                      placeholder="Enter playlist name"
                    />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="share-playback">Share Playback State</Label>
                        <p className="text-xs text-muted-foreground">Sync play/pause and current position</p>
                      </div>
                      <Switch
                        id="share-playback"
                        checked={sharePlaybackState}
                        onCheckedChange={setSharePlaybackState}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="remote-control">Allow Remote Control</Label>
                        <p className="text-xs text-muted-foreground">Let connected devices control playback</p>
                      </div>
                      <Switch
                        id="remote-control"
                        checked={allowRemoteControl}
                        onCheckedChange={setAllowRemoteControl}
                      />
                    </div>
                  </div>

                  <div className="bg-muted p-4 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Music className="w-4 h-4" />
                      <span className="font-medium">Playlist Preview</span>
                    </div>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p>
                        {songs.length} song{songs.length !== 1 ? "s" : ""}
                      </p>
                      <p>Total duration: {formatDuration(songs)}</p>
                      <p>Host: {peerName}</p>
                    </div>
                  </div>

                  <div className="bg-amber-50 dark:bg-amber-950 p-4 rounded-lg border border-amber-200 dark:border-amber-800">
                    <div className="flex items-start gap-2">
                      <Shield className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                      <div className="text-sm">
                        <p className="font-medium text-amber-800 dark:text-amber-200 mb-1">How Sharing Works</p>
                        <p className="text-amber-700 dark:text-amber-300">
                          Your playlist will be discoverable by others. Song metadata will be shared, but audio files
                          remain on your device. Share the generated URL with friends to let them join directly.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button onClick={handleStartSharing} disabled={isConnecting} className="flex-1">
                      {isConnecting ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          Starting...
                        </>
                      ) : (
                        <>
                          <Share2 className="w-4 h-4 mr-2" />
                          Start Sharing
                        </>
                      )}
                    </Button>
                    <Button variant="outline" onClick={() => setShowShareDialog(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-green-50 dark:bg-green-950 p-4 rounded-lg border border-green-200 dark:border-green-800">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Wifi className="w-4 h-4 text-green-600" />
                  <span className="font-medium text-green-800 dark:text-green-200">Sharing Active</span>
                </div>
                <Badge
                  variant="outline"
                  className="border-green-300 text-green-700 dark:border-green-700 dark:text-green-300"
                >
                  {connectedPeers.length} listener{connectedPeers.length !== 1 ? "s" : ""}
                </Badge>
              </div>
              <p className="text-sm text-green-700 dark:text-green-300 mb-3">
                Your playlist "{playlistName}" is being shared.
              </p>

              {shareUrl && (
                <div className="space-y-2">
                  <Label className="text-xs text-green-700 dark:text-green-300">Share this URL with friends:</Label>
                  <div className="flex gap-2">
                    <Input
                      value={shareUrl}
                      readOnly
                      className="text-xs bg-white dark:bg-gray-800 border-green-300 dark:border-green-700"
                    />
                    <Button
                      onClick={copyShareUrl}
                      variant="outline"
                      size="sm"
                      className="border-green-300 dark:border-green-700 bg-transparent"
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Connected Peers */}
            {connectedPeers.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Connected Devices</Label>
                <ScrollArea className="h-24">
                  <div className="space-y-2">
                    {connectedPeers.map((peer) => (
                      <div key={peer.id} className="flex items-center justify-between p-2 bg-muted rounded-lg">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4" />
                          <span className="text-sm font-medium">{peer.name}</span>
                        </div>
                        <div className="w-2 h-2 bg-green-500 rounded-full" title="Connected" />
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="w-full">
                  <StopCircle className="w-4 h-4 mr-2" />
                  Stop Sharing
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-destructive" />
                    Stop Sharing Playlist?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This will disconnect all listeners ({connectedPeers.length} connected) and stop sharing your
                    playlist. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleStopSharing}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Stop Sharing
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}

        <Separator />

        {/* Join Section */}
        <div className="space-y-4">
          <div className="text-center">
            <h3 className="text-lg font-semibold mb-2">Join a Playlist</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Connect to someone else's shared playlist to listen along.
            </p>
          </div>

          {/* Join by URL */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Join with Share URL</Label>
            <div className="flex gap-2">
              <Input
                value={joinUrl}
                onChange={(e) => setJoinUrl(e.target.value)}
                placeholder="Paste share URL here..."
                className="flex-1"
              />
              <Button onClick={handleJoinFromUrl} disabled={isConnecting || !joinUrl.trim()}>
                {isConnecting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          {/* Discover Playlists */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Or discover nearby playlists</Label>
            <Button
              onClick={handleDiscoverPlaylists}
              disabled={isDiscovering}
              variant="outline"
              className="w-full bg-transparent"
            >
              {isDiscovering ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Wifi className="w-4 h-4 mr-2" />
                  Find Shared Playlists
                </>
              )}
            </Button>
          </div>

          {/* Available Playlists */}
          {sharedPlaylists.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Available Playlists</Label>
              <ScrollArea className="h-40">
                <div className="space-y-2">
                  {sharedPlaylists.map((playlist) => (
                    <Card key={playlist.id} className="p-3">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h4 className="font-medium text-sm">{playlist.name}</h4>
                          <p className="text-xs text-muted-foreground">by {playlist.hostName}</p>
                        </div>
                        <Button
                          onClick={() => handleJoinPlaylist(playlist.id, playlist.name)}
                          disabled={isConnecting}
                          size="sm"
                        >
                          {isConnecting ? <RefreshCw className="w-3 h-3 animate-spin" /> : "Join"}
                        </Button>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Music className="w-3 h-3" />
                          {playlist.songs.length} songs
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDuration(playlist.songs)}
                        </span>
                      </div>
                      {playlist.currentSong && (
                        <div className="mt-2 text-xs">
                          <p className="text-muted-foreground">Now playing:</p>
                          <p className="font-medium truncate">
                            {playlist.songs.find((s) => s.id === playlist.currentSong)?.title || "Unknown"}
                          </p>
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>

        {/* Network Status */}
        <div className="text-xs text-muted-foreground text-center space-y-1">
          <p>Network sharing works across browser tabs and devices on the same network</p>
          <p>Share the generated URL with friends to let them join your playlist</p>
        </div>
      </CardContent>
    </Card>
  )
}
