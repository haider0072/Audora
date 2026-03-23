"use client"

import { useCallback, useState } from "react"
import { Search, WifiOff, Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { SearchTypeTabs } from "./search-type-tabs"
import { SearchResults } from "./search-results"
import { AlbumDetailView } from "./album-detail-view"
import { ArtistDetailView } from "./artist-detail-view"
import { DabLoginDialog } from "./dab-login-dialog"
import { DownloadQueueBar } from "./download-queue-bar"
import type { UseDabSearchReturn } from "@/hooks/use-dab-search"

interface OnlineSearchSidebarProps {
  dab: UseDabSearchReturn
}

export function OnlineSearchSidebar({ dab }: OnlineSearchSidebarProps) {
  const [showLoginDialog, setShowLoginDialog] = useState(false)

  const handleSearchSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      dab.search()
    },
    [dab]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault()
        dab.search()
      }
    },
    [dab]
  )

  // Offline state
  if (!dab.isOnline) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-12 text-muted-foreground">
        <WifiOff className="h-10 w-10 mb-3 opacity-40" />
        <p className="text-sm font-medium">You&apos;re offline</p>
        <p className="text-xs mt-1">Connect to the internet to search online</p>
      </div>
    )
  }

  // Auth gate
  if (dab.isAuthenticated === false) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-12 text-muted-foreground">
        <Search className="h-10 w-10 mb-3 opacity-40" />
        <p className="text-sm font-medium">Sign in to search</p>
        <p className="text-xs mt-1 text-center px-4">
          Connect your DAB Music account to search and download songs
        </p>
        <DabLoginDialog
          open={showLoginDialog}
          onOpenChange={setShowLoginDialog}
          onLogin={dab.login}
          isLoading={dab.isAuthenticating}
        />
        <Button
          size="sm"
          className="mt-4"
          onClick={() => setShowLoginDialog(true)}
        >
          Sign In
        </Button>
      </div>
    )
  }

  // Loading auth check
  if (dab.isAuthenticated === null) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search area (only in search view) */}
      {dab.currentView === "search" && (
        <div className="flex-shrink-0 space-y-2 pb-3">
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <Input
              value={dab.searchQuery}
              onChange={(e) => dab.setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search songs, artists, albums..."
              className="h-9"
            />
            <Button
              type="submit"
              size="icon"
              className="h-9 w-9 flex-shrink-0"
              disabled={dab.isSearching || !dab.searchQuery.trim()}
            >
              {dab.isSearching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </Button>
          </form>
          <SearchTypeTabs value={dab.searchType} onChange={dab.setSearchType} />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-h-0">
        {/* Error */}
        {dab.error && dab.currentView === "search" && (
          <div className="px-3 py-2 mb-2 text-xs text-red-400 bg-red-500/10 rounded-md">
            {dab.error}
          </div>
        )}

        {/* Search loading */}
        {dab.isSearching && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="text-xs text-muted-foreground mt-2">Searching...</p>
          </div>
        )}

        {/* Search results */}
        {dab.currentView === "search" && !dab.isSearching && dab.searchResults && (
          <SearchResults
            results={dab.searchResults}
            downloads={dab.downloads}
            isInLibrary={dab.isInLibrary}
            onTrackDownload={dab.downloadTrack}
            onCancelDownload={dab.cancelDownload}
            onAlbumClick={dab.viewAlbum}
            onArtistClick={dab.viewArtist}
          />
        )}

        {/* Empty search state */}
        {dab.currentView === "search" && !dab.isSearching && !dab.searchResults && !dab.error && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Search className="h-10 w-10 mb-3 opacity-40" />
            <p className="text-sm">Search for music</p>
            <p className="text-xs mt-1">Find tracks, albums, and artists</p>
          </div>
        )}

        {/* Album detail */}
        {dab.currentView === "album" && dab.selectedAlbum && (
          <AlbumDetailView
            album={dab.selectedAlbum}
            downloads={dab.downloads}
            isInLibrary={dab.isInLibrary}
            onTrackDownload={dab.downloadTrack}
            onCancelDownload={dab.cancelDownload}
            onDownloadAll={dab.downloadAlbum}
            onBack={dab.goBack}
            onArtistClick={dab.viewArtist}
          />
        )}

        {/* Artist detail */}
        {dab.currentView === "artist" && dab.selectedArtist && (
          <ArtistDetailView
            data={dab.selectedArtist}
            onAlbumClick={dab.viewAlbum}
            onBack={dab.goBack}
          />
        )}

        {/* Loading detail */}
        {dab.isLoadingDetail && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Download queue bar */}
      <DownloadQueueBar downloads={dab.downloads} />
    </div>
  )
}
