"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Loader2, Music } from "lucide-react"

interface DabLoginDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onLogin: (email: string, password: string) => Promise<boolean>
  isLoading: boolean
}

export function DabLoginDialog({
  open,
  onOpenChange,
  onLogin,
  isLoading,
}: DabLoginDialogProps) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!email.trim() || !password.trim()) {
      setError("Email and password are required")
      return
    }

    const success = await onLogin(email, password)
    if (success) {
      onOpenChange(false)
      setEmail("")
      setPassword("")
    } else {
      setError("Invalid email or password")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Music className="h-5 w-5" />
            DAB Music Login
          </DialogTitle>
          <DialogDescription>
            Sign in with your DAB Music account to search and download songs.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="dab-email">Email</Label>
            <Input
              id="dab-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              disabled={isLoading}
              autoComplete="email"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dab-password">Password</Label>
            <Input
              id="dab-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              disabled={isLoading}
              autoComplete="current-password"
            />
          </div>

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Signing in...
              </>
            ) : (
              "Sign In"
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
