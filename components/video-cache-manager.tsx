'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { 
  Database, 
  Trash2, 
  Download, 
  Upload, 
  RefreshCw,
  Info,
  Clock,
  HardDrive
} from 'lucide-react'
import { YouTubeService } from '@/lib/youtube-service'
import { toast } from '@/hooks/use-toast'

interface CacheStats {
  totalEntries: number
  totalSize: number
  oldestEntry: number | null
  newestEntry: number | null
}

export function VideoCacheManager() {
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [exportData, setExportData] = useState('')

  useEffect(() => {
    loadCacheStats()
  }, [])

  const loadCacheStats = () => {
    const stats = YouTubeService.getCacheStats()
    setCacheStats(stats)
  }

  const clearCache = async () => {
    setIsLoading(true)
    try {
      YouTubeService.clearCache()
      toast({
        title: "Cache Cleared",
        description: "All cached video data has been removed",
      })
      loadCacheStats()
    } catch (error) {
      console.error('Error clearing cache:', error)
      toast({
        title: "Error",
        description: "Failed to clear cache",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const exportCache = () => {
    try {
      const data = YouTubeService.exportCache()
      setExportData(data)
      setShowExportDialog(true)
    } catch (error) {
      console.error('Error exporting cache:', error)
      toast({
        title: "Export Error",
        description: "Failed to export cache data",
        variant: "destructive",
      })
    }
  }

  const importCache = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = e.target?.result as string
        const success = YouTubeService.importCache(data)
        
        if (success) {
          toast({
            title: "Cache Imported",
            description: "Video cache data has been imported successfully",
          })
          loadCacheStats()
        } else {
          toast({
            title: "Import Error",
            description: "Failed to import cache data",
            variant: "destructive",
          })
        }
      } catch (error) {
        console.error('Error importing cache:', error)
        toast({
          title: "Import Error",
          description: "Invalid cache data format",
          variant: "destructive",
        })
      }
    }
    reader.readAsText(file)
  }

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleDateString() + ' ' + new Date(timestamp).toLocaleTimeString()
  }

  const getCacheAge = (timestamp: number): string => {
    const now = Date.now()
    const diff = now - timestamp
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    
    if (days > 0) {
      return `${days} day${days > 1 ? 's' : ''} ago`
    } else if (hours > 0) {
      return `${hours} hour${hours > 1 ? 's' : ''} ago`
    } else {
      return 'Less than an hour ago'
    }
  }

  if (!cacheStats) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Video Cache
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-4">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Video Cache Statistics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">
                {cacheStats.totalEntries}
              </div>
              <div className="text-sm text-muted-foreground">Cached Songs</div>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">
                {formatBytes(cacheStats.totalSize)}
              </div>
              <div className="text-sm text-muted-foreground">Cache Size</div>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">
                {cacheStats.oldestEntry ? getCacheAge(cacheStats.oldestEntry) : 'N/A'}
              </div>
              <div className="text-sm text-muted-foreground">Oldest Entry</div>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">
                {cacheStats.newestEntry ? getCacheAge(cacheStats.newestEntry) : 'N/A'}
              </div>
              <div className="text-sm text-muted-foreground">Newest Entry</div>
            </div>
          </div>

          <Separator className="my-4" />

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={loadCacheStats}
              variant="outline"
              size="sm"
              disabled={isLoading}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh Stats
            </Button>

            <Button
              onClick={clearCache}
              variant="destructive"
              size="sm"
              disabled={isLoading || cacheStats.totalEntries === 0}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Clear Cache
            </Button>

            <Button
              onClick={exportCache}
              variant="outline"
              size="sm"
              disabled={cacheStats.totalEntries === 0}
            >
              <Download className="h-4 w-4 mr-2" />
              Export Cache
            </Button>

            <div className="relative">
              <input
                type="file"
                accept=".json"
                onChange={importCache}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                disabled={isLoading}
              />
              <Button
                variant="outline"
                size="sm"
                disabled={isLoading}
                className="pointer-events-none"
              >
                <Upload className="h-4 w-4 mr-2" />
                Import Cache
              </Button>
            </div>
          </div>

          {cacheStats.totalEntries > 0 && (
            <div className="mt-4 p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Info className="h-4 w-4" />
                <span>
                  Cache expires after 7 days. Videos are automatically cached when searched.
                  This reduces API calls and improves performance.
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Export Dialog */}
      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Export Cache Data</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Copy this data to backup your video cache or share it with another device:
            </p>
            <textarea
              value={exportData}
              readOnly
              className="w-full h-64 p-3 text-sm font-mono bg-muted rounded border"
            />
            <div className="flex justify-end gap-2">
              <Button
                onClick={() => {
                  navigator.clipboard.writeText(exportData)
                  toast({
                    title: "Copied!",
                    description: "Cache data copied to clipboard",
                  })
                }}
                variant="outline"
              >
                Copy to Clipboard
              </Button>
              <Button
                onClick={() => {
                  const blob = new Blob([exportData], { type: 'application/json' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `video-cache-${new Date().toISOString().split('T')[0]}.json`
                  a.click()
                  URL.revokeObjectURL(url)
                }}
              >
                Download File
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
} 