interface NetworkPeer {
  id: string
  name: string
  connection: RTCPeerConnection
  dataChannel?: RTCDataChannel
  isHost: boolean
  lastSeen: number
}

interface SharedPlaylist {
  id: string
  name: string
  hostId: string
  hostName: string
  songs: Array<{
    id: string
    title?: string
    artist?: string
    album?: string
    duration?: number
    format?: string
    isHiRes?: boolean
  }>
  currentSong?: string
  isPlaying: boolean
  currentTime: number
  timestamp: number
}

interface PlaylistData {
  songs: Array<{
    id: string
    title?: string
    artist?: string
    album?: string
    duration?: number
    format?: string
    isHiRes?: boolean
  }>
  currentSong?: string
  isPlaying: boolean
  currentTime: number
}

interface NetworkMessage {
  type: "playlist-update" | "playback-state" | "sync-request" | "peer-info" | "heartbeat" | "join-request" | "host-info"
  data: any
  timestamp: number
  senderId: string
}

// Simple event emitter for network events
class EventEmitter {
  private events: { [key: string]: Function[] } = {}

  on(event: string, callback: Function) {
    if (!this.events[event]) {
      this.events[event] = []
    }
    this.events[event].push(callback)
  }

  off(event: string, callback: Function) {
    if (this.events[event]) {
      this.events[event] = this.events[event].filter((cb) => cb !== callback)
    }
  }

  emit(event: string, data?: any) {
    if (this.events[event]) {
      this.events[event].forEach((callback) => callback(data))
    }
  }
}

export class NetworkSharingService extends EventEmitter {
  private static instance: NetworkSharingService
  private peers: Map<string, NetworkPeer> = new Map()
  private sharedPlaylists: Map<string, SharedPlaylist> = new Map()
  private isCurrentlySharing = false
  private localPeerId = ""
  private peerName = ""
  private currentPlaylistId = ""
  private discoveryInterval?: NodeJS.Timeout
  private heartbeatInterval?: NodeJS.Timeout
  private broadcastChannel?: BroadcastChannel
  private isInitialized = false

  private constructor() {
    super()
    this.localPeerId = this.generatePeerId()
    this.peerName = this.getDefaultPeerName()
    this.initializeBroadcastChannel()
  }

  static getInstance(): NetworkSharingService {
    if (!NetworkSharingService.instance) {
      NetworkSharingService.instance = new NetworkSharingService()
    }
    return NetworkSharingService.instance
  }

  private generatePeerId(): string {
    return `peer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private getDefaultPeerName(): string {
    const userAgent = navigator.userAgent
    const deviceId = this.localPeerId.slice(-4).toUpperCase()

    if (/iPhone|iPad|iPod/.test(userAgent)) {
      return `iPhone (${deviceId})`
    } else if (/Android/.test(userAgent)) {
      return `Android (${deviceId})`
    } else if (/Mac/.test(userAgent)) {
      return `Mac (${deviceId})`
    } else if (/Windows/.test(userAgent)) {
      return `Windows (${deviceId})`
    }
    return `Device (${deviceId})`
  }

  private initializeBroadcastChannel() {
    try {
      // Use BroadcastChannel for same-origin communication (simulating local network)
      this.broadcastChannel = new BroadcastChannel("music-player-network")

      this.broadcastChannel.onmessage = (event) => {
        const message: NetworkMessage = event.data
        if (message.senderId !== this.localPeerId) {
          this.handleBroadcastMessage(message)
        }
      }

      this.isInitialized = true
    } catch (error) {
      console.warn("BroadcastChannel not supported, using localStorage fallback")
      this.initializeLocalStorageFallback()
    }
  }

  private initializeLocalStorageFallback() {
    // Fallback using localStorage events for cross-tab communication
    window.addEventListener("storage", (event) => {
      if (event.key === "music-player-network" && event.newValue) {
        try {
          const message: NetworkMessage = JSON.parse(event.newValue)
          if (message.senderId !== this.localPeerId) {
            this.handleBroadcastMessage(message)
          }
        } catch (error) {
          console.error("Failed to parse network message:", error)
        }
      }
    })
    this.isInitialized = true
  }

  private broadcastMessage(message: Omit<NetworkMessage, "senderId" | "timestamp">) {
    const fullMessage: NetworkMessage = {
      ...message,
      senderId: this.localPeerId,
      timestamp: Date.now(),
    }

    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage(fullMessage)
    } else {
      // Fallback to localStorage
      localStorage.setItem("music-player-network", JSON.stringify(fullMessage))
      // Clear after a short delay to allow other tabs to read it
      setTimeout(() => {
        if (localStorage.getItem("music-player-network") === JSON.stringify(fullMessage)) {
          localStorage.removeItem("music-player-network")
        }
      }, 100)
    }
  }

  private handleBroadcastMessage(message: NetworkMessage) {
    switch (message.type) {
      case "host-info":
        this.handleHostDiscovered(message)
        break
      case "join-request":
        this.handleJoinRequest(message)
        break
      case "playlist-update":
        this.handlePlaylistUpdate(message)
        break
      case "playback-state":
        this.handlePlaybackStateUpdate(message)
        break
      case "peer-info":
        this.handlePeerInfo(message)
        break
      case "heartbeat":
        this.handleHeartbeat(message)
        break
    }
  }

  private handleHostDiscovered(message: NetworkMessage) {
    const hostInfo = message.data
    if (!this.sharedPlaylists.has(hostInfo.playlistId)) {
      const playlist: SharedPlaylist = {
        id: hostInfo.playlistId,
        name: hostInfo.playlistName || hostInfo.hostName,
        hostId: message.senderId,
        hostName: hostInfo.hostName,
        songs: hostInfo.songs || [],
        currentSong: hostInfo.currentSong,
        isPlaying: hostInfo.isPlaying || false,
        currentTime: hostInfo.currentTime || 0,
        timestamp: message.timestamp,
      }
      this.sharedPlaylists.set(playlist.id, playlist)
      this.emit("playlist_discovered", playlist)
    }
  }

  private handleJoinRequest(message: NetworkMessage) {
    if (this.isCurrentlySharing && message.data.playlistId === this.currentPlaylistId) {
      // Accept the join request
      const peer: NetworkPeer = {
        id: message.senderId,
        name: message.data.peerName,
        connection: null as any, // Simplified for demo
        isHost: false,
        lastSeen: Date.now(),
      }

      this.peers.set(peer.id, peer)
      this.emit("peer_connected", peer.id)

      // Send current playlist state to the new peer
      this.sendPlaylistToPeer(message.senderId)
    }
  }

  private handlePlaylistUpdate(message: NetworkMessage) {
    if (!this.isCurrentlySharing) {
      this.emit("playlist_updated", {
        id: message.data.playlistId,
        name: message.data.playlistName,
        hostName: message.data.hostName,
        songs: message.data.songs,
      })
    }
  }

  private handlePlaybackStateUpdate(message: NetworkMessage) {
    if (!this.isCurrentlySharing) {
      this.emit("playback_state_updated", message.data)
    }
  }

  private handlePeerInfo(message: NetworkMessage) {
    const existingPeer = this.peers.get(message.senderId)
    if (existingPeer) {
      existingPeer.name = message.data.name
      existingPeer.lastSeen = Date.now()
    }
  }

  private handleHeartbeat(message: NetworkMessage) {
    const peer = this.peers.get(message.senderId)
    if (peer) {
      peer.lastSeen = Date.now()
    }
  }

  private sendPlaylistToPeer(peerId: string) {
    // In a real implementation, this would send via WebRTC
    // For now, we'll broadcast the current state
    if (this.isCurrentlySharing) {
      this.broadcastMessage({
        type: "playlist-update",
        data: {
          playlistId: this.currentPlaylistId,
          playlistName: this.getPlaylistName(),
          hostName: this.peerName,
          songs: this.getCurrentPlaylist(),
        },
      })
    }
  }

  private getCurrentPlaylist() {
    // This would be set when sharing starts
    return []
  }

  private getPlaylistName() {
    return `${this.peerName}'s Playlist`
  }

  async sharePlaylist(songs: any[], playlistName?: string): Promise<string> {
    if (!this.isInitialized) {
      throw new Error("Network service not initialized")
    }

    this.currentPlaylistId = `playlist_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
    this.isCurrentlySharing = true

    // Store current playlist
    const playlist: SharedPlaylist = {
      id: this.currentPlaylistId,
      name: playlistName || this.getPlaylistName(),
      hostId: this.localPeerId,
      hostName: this.peerName,
      songs,
      isPlaying: false,
      currentTime: 0,
      timestamp: Date.now(),
    }

    this.sharedPlaylists.set(this.currentPlaylistId, playlist)

    // Start broadcasting availability
    this.startHostBroadcast(playlist)
    this.startHeartbeat()

    // Generate shareable URL
    const shareUrl = `${window.location.origin}${window.location.pathname}?join=${this.currentPlaylistId}&host=${encodeURIComponent(this.peerName)}`

    return shareUrl
  }

  private startHostBroadcast(playlist: SharedPlaylist) {
    // Broadcast immediately
    this.broadcastHostInfo(playlist)

    // Then broadcast every 5 seconds
    this.discoveryInterval = setInterval(() => {
      this.broadcastHostInfo(playlist)
    }, 5000)
  }

  private broadcastHostInfo(playlist: SharedPlaylist) {
    this.broadcastMessage({
      type: "host-info",
      data: {
        playlistId: playlist.id,
        playlistName: playlist.name,
        hostName: this.peerName,
        songs: playlist.songs,
        currentSong: playlist.currentSong,
        isPlaying: playlist.isPlaying,
        currentTime: playlist.currentTime,
      },
    })
  }

  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.broadcastMessage({
        type: "heartbeat",
        data: {
          peerId: this.localPeerId,
          name: this.peerName,
          isHost: this.isCurrentlySharing,
        },
      })

      // Clean up old peers (haven't been seen in 30 seconds)
      const now = Date.now()
      for (const [peerId, peer] of this.peers.entries()) {
        if (now - peer.lastSeen > 30000) {
          this.peers.delete(peerId)
          this.emit("peer_disconnected", peerId)
        }
      }
    }, 10000)
  }

  stopSharing() {
    this.isCurrentlySharing = false
    this.currentPlaylistId = ""

    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval)
      this.discoveryInterval = undefined
    }

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = undefined
    }

    // Disconnect all peers
    this.peers.clear()
    this.sharedPlaylists.clear()
  }

  async joinPlaylist(playlistId: string): Promise<void> {
    const playlist = this.sharedPlaylists.get(playlistId)
    if (!playlist) {
      throw new Error("Playlist not found")
    }

    // Send join request
    this.broadcastMessage({
      type: "join-request",
      data: {
        playlistId,
        peerName: this.peerName,
      },
    })

    // Wait a moment for response
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  async discoverPlaylists(): Promise<SharedPlaylist[]> {
    // Clear old playlists
    this.sharedPlaylists.clear()

    // Request host info from all active hosts
    this.broadcastMessage({
      type: "sync-request",
      data: {},
    })

    // Wait for responses
    await new Promise((resolve) => setTimeout(resolve, 2000))

    return Array.from(this.sharedPlaylists.values())
  }

  updatePlaylist(songs: any[]) {
    if (this.isCurrentlySharing) {
      const playlist = this.sharedPlaylists.get(this.currentPlaylistId)
      if (playlist) {
        playlist.songs = songs
        playlist.timestamp = Date.now()

        this.broadcastMessage({
          type: "playlist-update",
          data: {
            playlistId: this.currentPlaylistId,
            playlistName: playlist.name,
            hostName: this.peerName,
            songs,
          },
        })
      }
    }
  }

  updatePlaybackState(isPlaying: boolean, currentTime: number, currentSong?: string) {
    if (this.isCurrentlySharing) {
      const playlist = this.sharedPlaylists.get(this.currentPlaylistId)
      if (playlist) {
        playlist.isPlaying = isPlaying
        playlist.currentTime = currentTime
        playlist.currentSong = currentSong
        playlist.timestamp = Date.now()

        this.broadcastMessage({
          type: "playback-state",
          data: {
            isPlaying,
            currentTime,
            currentSong,
          },
        })
      }
    }
  }

  // Handle URL-based joining
  async joinFromUrl(url: string): Promise<void> {
    const urlObj = new URL(url)
    const playlistId = urlObj.searchParams.get("join")
    const hostName = urlObj.searchParams.get("host")

    if (playlistId && hostName) {
      // First try to discover the playlist
      await this.discoverPlaylists()

      // Then try to join
      await this.joinPlaylist(playlistId)
    } else {
      throw new Error("Invalid share URL")
    }
  }

  // Getters
  isSharing(): boolean {
    return this.isCurrentlySharing
  }

  // Add this method after the isSharing method
  isCurrentlySharing(): boolean {
    return this.isCurrentlySharing
  }

  getConnectedPeers(): NetworkPeer[] {
    return Array.from(this.peers.values())
  }

  getSharedPlaylists(): SharedPlaylist[] {
    return Array.from(this.sharedPlaylists.values())
  }

  getPeerName(): string {
    return this.peerName
  }

  setPeerName(name: string) {
    this.peerName = name
  }

  getCurrentPlaylistId(): string {
    return this.currentPlaylistId
  }
}

// Export types and service
export type { NetworkPeer, SharedPlaylist, PlaylistData, NetworkMessage }
export { NetworkSharingService as NetworkSharingManager }
