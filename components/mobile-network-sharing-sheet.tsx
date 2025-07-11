"use client"

import { useState, useEffect, useRef } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/hooks/use-toast"
import {
  Wifi,
  WifiOff,
  Users,
  Share2,
  Smartphone,
  Monitor,
  Speaker,
  Loader2,
  CheckCircle,
  XCircle,
  Radio,
  Eye,
  EyeOff,
} from "lucide-react"
import { NetworkSharingManager, type NetworkPeer } from "../utils/network-sharing"

interface MobileNetworkSharingSheetProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
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
    album?: string
  } | null
  isPlaying: boolean
  currentTime: number
  onPlaylistUpdate: (songs: any[]) => void
  onPlaybackStateUpdate: (isPlaying: boolean, currentTime: number, currentSong?: string) => void
}

export function MobileNetworkSharingSheet({
  isOpen,
  onOpenChange,
  songs,
  currentSong,
  isPlaying,
  currentTime,
  onPlaylistUpdate,
  onPlaybackStateUpdate,
}: MobileNetworkSharingSheetProps) {
  const [isHosting, setIsHosting] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [connectedPeers, setConnectedPeers] = useState<NetworkPeer[]>([])
  const [availableHosts, setAvailableHosts] = useState<Array<{ id: string; name: string }>>([])
  const [isDiscovering, setIsDiscovering] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle")
  const [sharePlaybackState, setSharePlaybackState] = useState(true)
  const [allowRemoteControl, setAllowRemoteControl] = useState(false)
  const [customRoomName, setCustomRoomName] = useState("")
  const [showAdvanced, setShowAdvanced] = useState(false)

  const networkManagerRef = useRef<NetworkSharingManager | null>(null)

  // Initialize network manager
  useEffect(() => {
    if (!networkManagerRef.current) {
      networkManagerRef.current = new NetworkSharingManager()

      // Set up callbacks
      networkManagerRef.current.setOnPlaylistUpdate(onPlaylistUpdate)
      networkManagerRef.current.setOnPlaybackStateUpdate(onPlaybackStateUpdate)
      networkManagerRef.current.setOnPeerListUpdate(setConnectedPeers)
    }

    return () => {
      if (networkManagerRef.current) {
        networkManagerRef.current.stopHosting()
        networkManagerRef.current.leaveSession()
      }
    }
  }, [onPlaylistUpdate, onPlaybackStateUpdate])

  // Share playback state when it changes
  useEffect(() => {
    if (networkManagerRef.current && isHosting && sharePlaybackState) {
      networkManagerRef.current.sharePlaybackState(isPlaying, currentTime, currentSong?.id)
    }
  }, [isPlaying, currentTime, currentSong, isHosting, sharePlaybackState])

  // Share playlist when it changes
  useEffect(() => {
    if (networkManagerRef.current && isHosting && songs.length > 0) {
      networkManagerRef.current.sharePlaylist({
        songs,
        currentSong: currentSong?.id,
        isPlaying,
        currentTime,
      })
    }
  }, [songs, currentSong, isPlaying, currentTime, isHosting])

  const startHosting = async () => {
    if (!networkManagerRef.current) return

    try {
      setIsConnecting(true)
      setConnectionStatus("connecting")

      await networkManagerRef.current.startHosting()

      setIsHosting(true)
      setIsConnected(true)
      setConnectionStatus("connected")

      toast({
        title: "Hosting Started",
        description: `Your playlist is now shared as "${networkManagerRef.current.getDeviceName()}". Other devices can now connect to listen along.`,
        duration: 4000,
      })
    } catch (error) {
      console.error("Failed to start hosting:", error)
      setConnectionStatus("error")
      toast({
        title: "Failed to Start Hosting",
        description: "Unable to start sharing your playlist. Please check your network connection.",
        variant: "destructive",
      })
    } finally {
      setIsConnecting(false)
    }
  }

  const stopHosting = async () => {
    if (!networkManagerRef.current) return

    try {
      await networkManagerRef.current.stopHosting()

      setIsHosting(false)
      setIsConnected(false)
      setConnectedPeers([])
      setConnectionStatus("idle")

      toast({
        title: "Hosting Stopped",
        description: "Your playlist is no longer being shared.",
      })
    } catch (error) {
      console.error("Failed to stop hosting:", error)
      toast({
        title: "Error",
        description: "There was an error stopping the sharing session.",
        variant: "destructive",
      })
    }
  }

  const discoverHosts = async () => {
    if (!networkManagerRef.current) return

    try {
      setIsDiscovering(true)
      const hosts = await networkManagerRef.current.discoverHosts()
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

  const joinHost = async (hostId: string, hostName: string) => {
    if (!networkManagerRef.current) return

    try {
      setIsConnecting(true)
      setConnectionStatus("connecting")

      await networkManagerRef.current.joinSession(hostId)

      setIsConnected(true)
      setConnectionStatus("connected")

      toast({
        title: "Connected",
        description: `Successfully connected to "${hostName}". You'll now receive playlist updates.`,
        duration: 4000,
      })
    } catch (error) {
      console.error("Failed to join host:", error)
      setConnectionStatus("error")
      toast({
        title: "Connection Failed",
        description: `Unable to connect to "${hostName}". Please try again.`,
        variant: "destructive",
      })
    } finally {
      setIsConnecting(false)
    }
  }

  const leaveSession = async () => {
    if (!networkManagerRef.current) return

    try {
      await networkManagerRef.current.leaveSession()

      setIsConnected(false)
      setConnectedPeers([])
      setConnectionStatus("idle")

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

  const getDeviceIcon = (deviceName: string) => {
    if (deviceName.toLowerCase().includes("iphone") || deviceName.toLowerCase().includes("android")) {
      return <Smartphone className="h-4 w-4" />
    } else if (deviceName.toLowerCase().includes("speaker")) {
      return <Speaker className="h-4 w-4" />
    } else {
      return <Monitor className="h-4 w-4" />
    }
  }

  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case "connected":
        return "text-green-500"
      case "connecting":
        return "text-yellow-500"
      case "error":
        return "text-red-500"
      default:
        return "text-gray-500"
    }
  }

  const getConnectionStatusIcon = () => {
    switch (connectionStatus) {
      case "connected":
        return <CheckCircle className="h-4 w-4" />
      case "connecting":
        return <Loader2 className="h-4 w-4 animate-spin" />
      case "error":
        return <XCircle className="h-4 w-4" />
      default:
        return <WifiOff className="h-4 w-4" />
    }
  }

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] flex flex-col">
        <SheetHeader className="flex-shrink-0">
          <SheetTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            Network Sharing
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-6 pb-6">
            {/* Connection Status */}
            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className={getConnectionStatusColor()}>{getConnectionStatusIcon()}</div>
                <div>
                  <p className="font-medium">
                    {connectionStatus === "connected"
                      ? isHosting
                        ? "Hosting Playlist"
                        : "Connected to Host"
                      : connectionStatus === "connecting"
                        ? "Connecting..."
                        : "Not Connected"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {connectionStatus === "connected" && networkManagerRef.current
                      ? `Device: ${networkManagerRef.current.getDeviceName()}`
                      : "Share your playlist or join another device"}
                  </p>
                </div>
              </div>
              {isConnected && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {connectedPeers.length + 1}
                </Badge>
              )}
            </div>

            {/* Host Controls */}
            {!isConnected && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Share Your Playlist</h3>
                  <Radio className="h-5 w-5 text-muted-foreground" />
                </div>

                <p className="text-sm text-muted-foreground">
                  Start hosting to share your current playlist with other devices on your network. They'll be able to
                  see what you're playing and listen along in real-time.
                </p>

                <Button
                  onClick={startHosting}
                  disabled={isConnecting || songs.length === 0}
                  className="w-full"
                  size="lg"
                >
                  {isConnecting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Starting...
                    </>
                  ) : (
                    <>
                      <Wifi className="mr-2 h-4 w-4" />
                      Start Sharing
                    </>
                  )}
                </Button>

                {songs.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center">Add some songs to your playlist first</p>
                )}
              </div>
            )}

            {/* Host Status */}
            {isHosting && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Hosting Session</h3>
                  <Badge variant="default" className="bg-green-500">
                    <Radio className="mr-1 h-3 w-3" />
                    Live
                  </Badge>
                </div>

                <div className="p-4 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800">
                  <p className="text-sm font-medium text-green-800 dark:text-green-200">
                    Your playlist is being shared
                  </p>
                  <p className="text-xs text-green-600 dark:text-green-300 mt-1">
                    {connectedPeers.length} device{connectedPeers.length !== 1 ? "s" : ""} connected
                  </p>
                </div>

                {/* Connected Peers */}
                {connectedPeers.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-medium">Connected Devices</h4>
                    {connectedPeers.map((peer) => (
                      <div key={peer.id} className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                        {getDeviceIcon(peer.name)}
                        <span className="text-sm">{peer.name}</span>
                        <Badge variant="outline" size="sm" className="ml-auto">
                          Listening
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}

                {/* Host Settings */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="share-playback">Share Playback State</Label>
                      <p className="text-xs text-muted-foreground">Sync play/pause and current position</p>
                    </div>
                    <Switch id="share-playback" checked={sharePlaybackState} onCheckedChange={setSharePlaybackState} />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="remote-control">Allow Remote Control</Label>
                      <p className="text-xs text-muted-foreground">Let connected devices control playback</p>
                    </div>
                    <Switch id="remote-control" checked={allowRemoteControl} onCheckedChange={setAllowRemoteControl} />
                  </div>
                </div>

                <Button onClick={stopHosting} variant="destructive" className="w-full" size="lg">
                  <WifiOff className="mr-2 h-4 w-4" />
                  Stop Sharing
                </Button>
              </div>
            )}

            {/* Join Session */}
            {!isConnected && (
              <>
                <Separator />

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Join a Session</h3>
                    <Users className="h-5 w-5 text-muted-foreground" />
                  </div>

                  <p className="text-sm text-muted-foreground">
                    Connect to another device that's sharing their playlist to listen along.
                  </p>

                  <Button
                    onClick={discoverHosts}
                    disabled={isDiscovering}
                    variant="outline"
                    className="w-full bg-transparent"
                    size="lg"
                  >
                    {isDiscovering ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Searching...
                      </>
                    ) : (
                      <>
                        <Wifi className="mr-2 h-4 w-4" />
                        Find Shared Playlists
                      </>
                    )}
                  </Button>

                  {/* Available Hosts */}
                  {availableHosts.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="font-medium">Available Sessions</h4>
                      {availableHosts.map((host) => (
                        <div key={host.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                          <div className="flex items-center gap-3">
                            {getDeviceIcon(host.name)}
                            <span className="text-sm font-medium">{host.name}</span>
                          </div>
                          <Button onClick={() => joinHost(host.id, host.name)} disabled={isConnecting} size="sm">
                            {isConnecting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Join"}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Connected as Client */}
            {isConnected && !isHosting && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Connected Session</h3>
                  <Badge variant="default" className="bg-blue-500">
                    <Users className="mr-1 h-3 w-3" />
                    Listening
                  </Badge>
                </div>

                <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <p className="text-sm font-medium text-blue-800 dark:text-blue-200">Connected to shared playlist</p>
                  <p className="text-xs text-blue-600 dark:text-blue-300 mt-1">
                    You'll receive updates when the host changes songs
                  </p>
                </div>

                <Button onClick={leaveSession} variant="outline" className="w-full bg-transparent" size="lg">
                  <WifiOff className="mr-2 h-4 w-4" />
                  Leave Session
                </Button>
              </div>
            )}

            {/* Advanced Settings */}
            <Separator />

            <div className="space-y-4">
              <Button onClick={() => setShowAdvanced(!showAdvanced)} variant="ghost" className="w-full justify-between">
                Advanced Settings
                {showAdvanced ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>

              {showAdvanced && (
                <div className="space-y-4 p-4 bg-muted/30 rounded-lg">
                  <div className="space-y-2">
                    <Label htmlFor="room-name">Custom Room Name</Label>
                    <Input
                      id="room-name"
                      placeholder="My Awesome Playlist"
                      value={customRoomName}
                      onChange={(e) => setCustomRoomName(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">Custom name for your shared session (optional)</p>
                  </div>

                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>
                      <strong>Device ID:</strong> {networkManagerRef.current?.getPeerId().slice(-8)}
                    </p>
                    <p>
                      <strong>Network:</strong> Local WiFi
                    </p>
                    <p>
                      <strong>Protocol:</strong> WebRTC P2P
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Info */}
            <div className="p-4 bg-muted/30 rounded-lg">
              <h4 className="font-medium mb-2">How it works</h4>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Devices must be on the same WiFi network</li>
                <li>• Audio files are not transferred, only playlist info</li>
                <li>• Real-time synchronization using WebRTC</li>
                <li>• All connections are peer-to-peer and secure</li>
              </ul>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
