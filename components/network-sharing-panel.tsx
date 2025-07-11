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
} from "lucide-react"
import { NetworkSharingManager, type NetworkPeer } from "../utils/network-sharing"

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
}

export function NetworkSharingPanel({
  songs,
  currentSong,
  isPlaying,
  currentTime,
  onPlaylistUpdate,
  onPlaybackStateUpdate,
}: NetworkSharingPanelProps) {
  const [networkManager] = useState(() => new NetworkSharingManager())
  const [isSharing, setIsSharing] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [connectedPeers, setConnectedPeers] = useState<NetworkPeer[]>([])
  const [availableHosts, setAvailableHosts] = useState<Array<{ id: string; name: string }>>([])
  const [isConnecting, setIsConnecting] = useState(false)
  const [isDiscovering, setIsDiscovering] = useState(false)
  const [showShareDialog, setShowShareDialog] = useState(false)
  const [sharePlaybackState, setSharePlaybackState] = useState(true)
  const [allowRemoteControl, setAllowRemoteControl] = useState(false)
  const [customRoomName, setCustomRoomName] = useState("")

  useEffect(() => {
    // Set up network manager callbacks
    networkManager.setOnPlaylistUpdate((songs) => {
      if (onPlaylistUpdate) {
        onPlaylistUpdate(songs)
      }
    })

    networkManager.setOnPlaybackStateUpdate((isPlaying, currentTime, currentSong) => {
      if (onPlaybackStateUpdate) {
        onPlaybackStateUpdate(isPlaying, currentTime, currentSong)
      }
    })

    networkManager.setOnPeerListUpdate((peers) => {
      setConnectedPeers(peers)
    })

    return () => {
      networkManager.stopHosting()
      networkManager.leaveSession()
    }
  }, [networkManager, onPlaylistUpdate, onPlaybackStateUpdate])

  // Share playlist and playback state when they change
  useEffect(() => {
    if (isSharing && songs.length > 0) {
      networkManager.sharePlaylist({
        songs,
        currentSong: currentSong?.id,
        isPlaying,
        currentTime,
      })
    }
  }, [songs, currentSong, isPlaying, currentTime, isSharing, networkManager])

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
      await networkManager.startHosting()
      setIsSharing(true)
      setIsConnected(true)
      setShowShareDialog(false)

      toast({
        title: "Playlist Shared Successfully",
        description: `Your playlist is now available on the local network as "${networkManager.getDeviceName()}".`,
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

  const handleStopSharing = async () => {
    try {
      await networkManager.stopHosting()
      setIsSharing(false)
      setIsConnected(false)
      setConnectedPeers([])

      toast({
        title: "Sharing Stopped",
        description: "Your playlist is no longer being shared.",
      })
    } catch (error) {
      console.error("Error stopping sharing:", error)
      toast({
        title: "Error",
        description: "There was an error stopping the sharing session.",
        variant: "destructive",
      })
    }
  }

  const handleDiscoverHosts = async () => {
    try {
      setIsDiscovering(true)
      const hosts = await networkManager.discoverHosts()
      setAvailableHosts(hosts)

      if (hosts.length === 0) {
        toast({
          title: "No Hosts Found",
          description:
            "No shared playlists found on your network. Make sure other devices are hosting and connected to the same network.",
        })
      }
    } catch (error) {
      console.error("Failed to discover hosts:", error)
      toast({
        title: "Discovery Failed",
        description: "Unable to search for shared playlists.",
        variant: "destructive",
      })
    } finally {
      setIsDiscovering(false)
    }
  }

  const handleJoinHost = async (hostId: string, hostName: string) => {
    try {
      setIsConnecting(true)
      await networkManager.joinSession(hostId)
      setIsConnected(true)

      toast({
        title: "Connected",
        description: `Successfully connected to "${hostName}". You'll now receive playlist updates.`,
      })
    } catch (error) {
      console.error("Failed to join host:", error)
      toast({
        title: "Connection Failed",
        description: `Unable to connect to "${hostName}". Please try again.`,
        variant: "destructive",
      })
    } finally {
      setIsConnecting(false)
    }
  }

  const handleLeaveSession = async () => {
    try {
      await networkManager.leaveSession()
      setIsConnected(false)
      setConnectedPeers([])

      toast({
        title: "Disconnected",
        description: "You've left the shared playlist session.",
      })
    } catch (error) {
      console.error("Failed to leave session:", error)
      toast({
        title: "Error",
        description: "There was an error leaving the session.",
        variant: "destructive",
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
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Connection Status */}
        <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-3">
            <div className={isConnected ? "text-green-500" : "text-muted-foreground"}>
              {isConnected ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
            </div>
            <div>
              <p className="font-medium">
                {isConnected ? (isSharing ? "Hosting Playlist" : "Connected to Host") : "Not Connected"}
              </p>
              <p className="text-sm text-muted-foreground">
                {isConnected
                  ? `Device: ${networkManager.getDeviceName()}`
                  : "Share your playlist or join another device"}
              </p>
            </div>
          </div>
          {isConnected && (
            <Badge variant="secondary" className="flex items-center gap-1">
              <Users className="w-3 h-3" />
              {connectedPeers.length + 1}
            </Badge>
          )}
        </div>

        {/* Sharing Controls */}
        {!isConnected ? (
          <div className="space-y-4">
            <div className="text-center">
              <h3 className="text-lg font-semibold mb-2">Share Your Playlist</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Share your current playlist with others on the same network. They'll be able to see your songs and
                follow along with your playback in real-time.
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
                    Configure your playlist sharing settings. Other users on your network will be able to discover and
                    listen to your playlist.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="room-name">Room Name (Optional)</Label>
                    <Input
                      id="room-name"
                      value={customRoomName}
                      onChange={(e) => setCustomRoomName(e.target.value)}
                      placeholder="My Awesome Playlist"
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
                      <p>Host: {networkManager.getDeviceName()}</p>
                    </div>
                  </div>

                  <div className="bg-amber-50 dark:bg-amber-950 p-4 rounded-lg border border-amber-200 dark:border-amber-800">
                    <div className="flex items-start gap-2">
                      <Shield className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                      <div className="text-sm">
                        <p className="font-medium text-amber-800 dark:text-amber-200 mb-1">Privacy Notice</p>
                        <p className="text-amber-700 dark:text-amber-300">
                          Your playlist will be discoverable by other devices on your local network. Song metadata
                          (titles, artists, albums) will be shared, but the actual audio files remain on your device.
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

            <Separator />

            {/* Join Session */}
            <div className="space-y-4">
              <div className="text-center">
                <h3 className="text-lg font-semibold mb-2">Join a Session</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Connect to another device that's sharing their playlist to listen along.
                </p>
              </div>

              <Button
                onClick={handleDiscoverHosts}
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

              {availableHosts.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Available Sessions</Label>
                  <ScrollArea className="h-32">
                    <div className="space-y-2">
                      {availableHosts.map((host) => (
                        <div key={host.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4" />
                            <span className="text-sm font-medium">{host.name}</span>
                          </div>
                          <Button onClick={() => handleJoinHost(host.id, host.name)} disabled={isConnecting} size="sm">
                            {isConnecting ? <RefreshCw className="w-3 h-3 animate-spin" /> : "Join"}
                          </Button>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {isSharing ? (
              <>
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
                  <p className="text-sm text-green-700 dark:text-green-300">
                    Your playlist is being shared on the local network.
                  </p>
                </div>

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
              </>
            ) : (
              <>
                <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="w-4 h-4 text-blue-600" />
                    <span className="font-medium text-blue-800 dark:text-blue-200">Connected to Session</span>
                  </div>
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    You're connected to a shared playlist. You'll receive updates when the host changes songs.
                  </p>
                </div>

                <Button onClick={handleLeaveSession} variant="outline" className="w-full bg-transparent">
                  <WifiOff className="w-4 h-4 mr-2" />
                  Leave Session
                </Button>
              </>
            )}
          </div>
        )}

        {/* Network Status */}
        <div className="text-xs text-muted-foreground text-center space-y-1">
          <p>Network sharing uses WebRTC for secure peer-to-peer connections</p>
          <p>Only devices on your local network can discover shared playlists</p>
        </div>
      </CardContent>
    </Card>
  )
}
