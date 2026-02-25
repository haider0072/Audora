import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: false,
  workboxOptions: {
    disableDevLogs: true,
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Turbopack config (Next.js 16 default bundler)
  turbopack: {},
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.googleapis.com',
      },
      {
        protocol: 'https',
        hostname: 'i.ytimg.com',
      },
    ],
  },
  // Production security headers
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        { key: 'X-XSS-Protection', value: '1; mode=block' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        {
          key: 'Content-Security-Policy',
          value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.youtube.com https://s.ytimg.com",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' blob: data: https://i.ytimg.com https://*.googleapis.com",
            "font-src 'self'",
            "connect-src 'self' blob: https://lrclib.net https://www.googleapis.com",
            "frame-src https://www.youtube.com",
            "media-src 'self' blob:",
            "worker-src 'self' blob:",
          ].join('; '),
        },
      ],
    },
  ],
  // Powered by header hata do — security best practice
  poweredByHeader: false,
}

export default withPWA(nextConfig);