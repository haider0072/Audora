interface NetworkPeer {
  id: string
  name: string
  connection: RTCPeerConnection
  dataChannel?: RTCDataChannel
  isHost: boolean
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
  type: "playlist-update" | "playback-state" | "sync-request" | "peer-info" | "heartbeat"
  data: any
  timestamp: number
}

export class NetworkSharingManager {
  private peers: Map<string, NetworkPeer> = new Map()
  private isHost = false
  private localPeerId = ""
  private deviceName = ""
  private onPlaylistUpdate?: (songs: any[]) => void
  private onPlaybackStateUpdate?: (isPlaying: boolean, currentTime: number, currentSong?: string) => void
  private onPeerListUpdate?: (peers: NetworkPeer[]) => void
  private discoveryInterval?: NodeJS.Timeout
  private heartbeatInterval?: NodeJS.Timeout

  constructor() {
    this.localPeerId = this.generatePeerId()
    this.deviceName = this.getDeviceName()
  }

  private generatePeerId(): string {
    return `peer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private getDeviceName(): string {
    const userAgent = navigator.userAgent
    if (/iPhone|iPad|iPod/.test(userAgent)) {
      return `iPhone (${this.localPeerId.slice(-4)})`
    } else if (/Android/.test(userAgent)) {
      return `Android (${this.localPeerId.slice(-4)})`
    } else if (/Mac/.test(userAgent)) {
      return `Mac (${this.localPeerId.slice(-4)})`
    } else if (/Windows/.test(userAgent)) {
      return `Windows (${this.localPeerId.slice(-4)})`
    }
    return `Device (${this.localPeerId.slice(-4)})`
  }

  async startHosting(): Promise<void> {
    this.isHost = true
    this.startDiscoveryBroadcast()
    this.startHeartbeat()
    console.log(`Started hosting as ${this.deviceName}`)
  }

  async stopHosting(): Promise<void> {
    this.isHost = false
    this.stopDiscoveryBroadcast()
    this.stopHeartbeat()
    this.disconnectAllPeers()
    console.log("Stopped hosting")
  }

  async joinSession(hostId: string): Promise<void> {
    try {
      const connection = await this.createPeerConnection(hostId, false)
      const dataChannel = connection.createDataChannel("playlist-sync")

      const peer: NetworkPeer = {
        id: hostId,
        name: "Host",
        connection,
        dataChannel,
        isHost: true,
      }

      this.setupDataChannel(dataChannel, peer)
      this.peers.set(hostId, peer)

      // Send join request
      this.sendMessage(peer, {
        type: "peer-info",
        data: { id: this.localPeerId, name: this.deviceName },
        timestamp: Date.now(),
      })

      console.log(`Joined session hosted by ${hostId}`)
    } catch (error) {
      console.error("Failed to join session:", error)
      throw error
    }
  }

  async leaveSession(): Promise<void> {
    this.disconnectAllPeers()
    console.log("Left session")
  }

  private async createPeerConnection(peerId: string, isHost: boolean): Promise<RTCPeerConnection> {
    const configuration: RTCConfiguration = {
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }],
    }

    const connection = new RTCPeerConnection(configuration)

    connection.oniceconnectionstatechange = () => {
      console.log(`ICE connection state: ${connection.iceConnectionState}`)
      if (connection.iceConnectionState === "disconnected" || connection.iceConnectionState === "failed") {
        this.handlePeerDisconnection(peerId)
      }
    }

    connection.ondatachannel = (event) => {
      const channel = event.channel
      const peer = this.peers.get(peerId)
      if (peer) {
        peer.dataChannel = channel
        this.setupDataChannel(channel, peer)
      }
    }

    return connection
  }

  private setupDataChannel(channel: RTCDataChannel, peer: NetworkPeer): void {
    channel.onopen = () => {
      console.log(`Data channel opened with ${peer.name}`)
      this.updatePeerList()
    }

    channel.onclose = () => {
      console.log(`Data channel closed with ${peer.name}`)
      this.handlePeerDisconnection(peer.id)
    }

    channel.onmessage = (event) => {
      try {
        const message: NetworkMessage = JSON.parse(event.data)
        this.handleMessage(message, peer)
      } catch (error) {
        console.error("Failed to parse message:", error)
      }
    }

    channel.onerror = (error) => {
      console.error(`Data channel error with ${peer.name}:`, error)
    }
  }

  private handleMessage(message: NetworkMessage, sender: NetworkPeer): void {
    switch (message.type) {
      case "playlist-update":
        if (this.onPlaylistUpdate) {
          this.onPlaylistUpdate(message.data.songs)
        }
        break

      case "playback-state":
        if (this.onPlaybackStateUpdate) {
          this.onPlaybackStateUpdate(message.data.isPlaying, message.data.currentTime, message.data.currentSong)
        }
        break

      case "sync-request":
        if (this.isHost) {
          // Send current state to requesting peer
          this.sendCurrentState(sender)
        }
        break

      case "peer-info":
        sender.name = message.data.name
        this.updatePeerList()
        break

      case "heartbeat":
        // Update last seen timestamp
        break
    }
  }

  private sendMessage(peer: NetworkPeer, message: NetworkMessage): void {
    if (peer.dataChannel && peer.dataChannel.readyState === "open") {
      try {
        peer.dataChannel.send(JSON.stringify(message))
      } catch (error) {
        console.error(`Failed to send message to ${peer.name}:`, error)
      }
    }
  }

  private broadcastMessage(message: NetworkMessage): void {
    this.peers.forEach((peer) => {
      this.sendMessage(peer, message)
    })
  }

  sharePlaylist(playlistData: PlaylistData): void {
    if (!this.isHost) return

    const message: NetworkMessage = {
      type: "playlist-update",
      data: playlistData,
      timestamp: Date.now(),
    }

    this.broadcastMessage(message)
  }

  sharePlaybackState(isPlaying: boolean, currentTime: number, currentSong?: string): void {
    if (!this.isHost) return

    const message: NetworkMessage = {
      type: "playback-state",
      data: { isPlaying, currentTime, currentSong },
      timestamp: Date.now(),
    }

    this.broadcastMessage(message)
  }

  private sendCurrentState(peer: NetworkPeer): void {
    // This would be called with current playlist and playback state
    // Implementation depends on how the current state is accessed
  }

  private handlePeerDisconnection(peerId: string): void {
    const peer = this.peers.get(peerId)
    if (peer) {
      peer.connection.close()
      this.peers.delete(peerId)
      this.updatePeerList()
      console.log(`Peer ${peer.name} disconnected`)
    }
  }

  private disconnectAllPeers(): void {
    this.peers.forEach((peer) => {
      peer.connection.close()
    })
    this.peers.clear()
    this.updatePeerList()
  }

  private startDiscoveryBroadcast(): void {
    // In a real implementation, this would use mDNS or a discovery service
    // For now, we'll simulate local network discovery
    this.discoveryInterval = setInterval(() => {
      console.log(`Broadcasting availability: ${this.deviceName}`)
    }, 5000)
  }

  private stopDiscoveryBroadcast(): void {
    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval)
      this.discoveryInterval = undefined
    }
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const heartbeat: NetworkMessage = {
        type: "heartbeat",
        data: { id: this.localPeerId, name: this.deviceName },
        timestamp: Date.now(),
      }
      this.broadcastMessage(heartbeat)
    }, 10000)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = undefined
    }
  }

  private updatePeerList(): void {
    if (this.onPeerListUpdate) {
      this.onPeerListUpdate(Array.from(this.peers.values()))
    }
  }

  // Public methods for setting callbacks
  setOnPlaylistUpdate(callback: (songs: any[]) => void): void {
    this.onPlaylistUpdate = callback
  }

  setOnPlaybackStateUpdate(callback: (isPlaying: boolean, currentTime: number, currentSong?: string) => void): void {
    this.onPlaybackStateUpdate = callback
  }

  setOnPeerListUpdate(callback: (peers: NetworkPeer[]) => void): void {
    this.onPeerListUpdate = callback
  }

  // Getters
  getIsHost(): boolean {
    return this.isHost
  }

  getPeers(): NetworkPeer[] {
    return Array.from(this.peers.values())
  }

  getDeviceName(): string {
    return this.deviceName
  }

  getPeerId(): string {
    return this.localPeerId
  }

  // Mock discovery for demo purposes
  async discoverHosts(): Promise<Array<{ id: string; name: string }>> {
    // In a real implementation, this would discover actual hosts on the network
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve([
          { id: "demo_host_1", name: "Living Room Speaker" },
          { id: "demo_host_2", name: "Kitchen Display" },
        ])
      }, 1000)
    })
  }
}

export type { NetworkPeer, PlaylistData, NetworkMessage }
