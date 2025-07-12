import { useState, useEffect } from 'react'
import { supabase, type User } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'

export function useSupabaseAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // Get current user
  useEffect(() => {
    const getUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        setUser(user)
      } catch (error) {
        console.error('Error getting user:', error)
      } finally {
        setLoading(false)
      }
    }

    getUser()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user ?? null)
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  // Sign up
  const signUp = async (email: string, password: string, username?: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username: username || email.split('@')[0]
          }
        }
      })

      if (error) {
        toast({
          title: "Sign Up Error",
          description: error.message,
          variant: "destructive",
        })
        return { success: false, error }
      }

      toast({
        title: "Account Created",
        description: "Please check your email to verify your account",
      })

      return { success: true, data }
    } catch (error) {
      console.error('Error signing up:', error)
      return { success: false, error }
    }
  }

  // Sign in
  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        toast({
          title: "Sign In Error",
          description: error.message,
          variant: "destructive",
        })
        return { success: false, error }
      }

      toast({
        title: "Welcome Back!",
        description: "Successfully signed in",
      })

      return { success: true, data }
    } catch (error) {
      console.error('Error signing in:', error)
      return { success: false, error }
    }
  }

  // Sign in with Google
  const signInWithGoogle = async () => {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`
        }
      })

      if (error) {
        toast({
          title: "Google Sign In Error",
          description: error.message,
          variant: "destructive",
        })
        return { success: false, error }
      }

      return { success: true, data }
    } catch (error) {
      console.error('Error signing in with Google:', error)
      return { success: false, error }
    }
  }

  // Sign out
  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut()

      if (error) {
        toast({
          title: "Sign Out Error",
          description: error.message,
          variant: "destructive",
        })
        return { success: false, error }
      }

      toast({
        title: "Signed Out",
        description: "Successfully signed out",
      })

      return { success: true }
    } catch (error) {
      console.error('Error signing out:', error)
      return { success: false, error }
    }
  }

  // Reset password
  const resetPassword = async (email: string) => {
    try {
      const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`
      })

      if (error) {
        toast({
          title: "Password Reset Error",
          description: error.message,
          variant: "destructive",
        })
        return { success: false, error }
      }

      toast({
        title: "Password Reset Sent",
        description: "Check your email for password reset instructions",
      })

      return { success: true, data }
    } catch (error) {
      console.error('Error resetting password:', error)
      return { success: false, error }
    }
  }

  // Update profile
  const updateProfile = async (updates: { username?: string; avatar_url?: string }) => {
    try {
      const { data, error } = await supabase.auth.updateUser({
        data: updates
      })

      if (error) {
        toast({
          title: "Profile Update Error",
          description: error.message,
          variant: "destructive",
        })
        return { success: false, error }
      }

      toast({
        title: "Profile Updated",
        description: "Your profile has been updated successfully",
      })

      return { success: true, data }
    } catch (error) {
      console.error('Error updating profile:', error)
      return { success: false, error }
    }
  }

  return {
    user,
    loading,
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
    resetPassword,
    updateProfile
  }
} 