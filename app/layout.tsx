import type React from "react"
import type { Metadata, Viewport } from "next"
import { Bricolage_Grotesque, Instrument_Sans, Martian_Mono } from "next/font/google"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/toaster"
import { ErrorBoundary } from "@/components/error-boundary"

// Self-hosted by next/font, so the CSP's font-src 'self' covers them.
const uiFont = Instrument_Sans({ subsets: ["latin"], variable: "--font-ui" })
const displayFont = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display" })
// Data text (sizes, codes, values) is never on screen at first paint, so it isn't preloaded.
const dataFont = Martian_Mono({ subsets: ["latin"], variable: "--font-data", preload: false })

export const metadata: Metadata = {
  title: "Audora Music Player",
  description: "Professional FLAC and MP3 music player with equalizer",
  generator: 'v0.dev',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Audora',
  },
  icons: {
    icon: [
      { url: '/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-384x384.png', sizes: '384x384', type: 'image/png' },
      { url: '/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // The browser chrome matches --background in each theme.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f2ee' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0b0a' },
  ],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${uiFont.variable} ${displayFont.variable} ${dataFont.variable}`}
    >
      <head>
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
      <body className="font-sans">
        <ErrorBoundary>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
            {children}
            <Toaster />
          </ThemeProvider>
        </ErrorBoundary>
      </body>
    </html>
  )
}
