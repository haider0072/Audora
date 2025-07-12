import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'

// Upload album art to Supabase storage
export async function uploadAlbumArt(file: File, songId: string): Promise<string | null> {
  try {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid File Type",
        description: "Please select an image file for album art",
        variant: "destructive",
      })
      return null
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Album art must be less than 5MB",
        variant: "destructive",
      })
      return null
    }

    // Generate unique filename
    const fileExt = file.name.split('.').pop()
    const fileName = `${songId}_${Date.now()}.${fileExt}`

    // Upload to Supabase storage
    const { data, error } = await supabase.storage
      .from('album-art')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false
      })

    if (error) {
      console.error('Error uploading album art:', error)
      toast({
        title: "Upload Failed",
        description: "Failed to upload album art",
        variant: "destructive",
      })
      return null
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('album-art')
      .getPublicUrl(fileName)

    toast({
      title: "Upload Successful",
      description: "Album art uploaded successfully",
    })

    return publicUrl
  } catch (error) {
    console.error('Error uploading album art:', error)
    toast({
      title: "Upload Error",
      description: "An error occurred while uploading",
      variant: "destructive",
    })
    return null
  }
}

// Delete album art from Supabase storage
export async function deleteAlbumArt(fileName: string): Promise<boolean> {
  try {
    const { error } = await supabase.storage
      .from('album-art')
      .remove([fileName])

    if (error) {
      console.error('Error deleting album art:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('Error deleting album art:', error)
    return false
  }
}

// Upload audio file (for future use)
export async function uploadAudioFile(file: File, songId: string): Promise<string | null> {
  try {
    // Validate file type
    const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/flac', 'audio/mp4', 'audio/aac']
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Invalid File Type",
        description: "Please select a valid audio file",
        variant: "destructive",
      })
      return null
    }

    // Validate file size (max 100MB for demo - adjust as needed)
    if (file.size > 100 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Audio file must be less than 100MB",
        variant: "destructive",
      })
      return null
    }

    // Generate unique filename
    const fileExt = file.name.split('.').pop()
    const fileName = `${songId}_${Date.now()}.${fileExt}`

    // Upload to Supabase storage
    const { data, error } = await supabase.storage
      .from('audio-files')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false
      })

    if (error) {
      console.error('Error uploading audio file:', error)
      toast({
        title: "Upload Failed",
        description: "Failed to upload audio file",
        variant: "destructive",
      })
      return null
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('audio-files')
      .getPublicUrl(fileName)

    toast({
      title: "Upload Successful",
      description: "Audio file uploaded successfully",
    })

    return publicUrl
  } catch (error) {
    console.error('Error uploading audio file:', error)
    toast({
      title: "Upload Error",
      description: "An error occurred while uploading",
      variant: "destructive",
    })
    return null
  }
}

// Get file size in human readable format
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// Validate file before upload
export function validateFile(file: File, maxSize: number, allowedTypes: string[]): { valid: boolean; error?: string } {
  // Check file type
  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: `File type not allowed. Allowed types: ${allowedTypes.join(', ')}`
    }
  }

  // Check file size
  if (file.size > maxSize) {
    return {
      valid: false,
      error: `File too large. Maximum size: ${formatFileSize(maxSize)}`
    }
  }

  return { valid: true }
} 