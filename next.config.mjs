import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: false,
  // Custom routes are registered ahead of the defaults, so these win.
  extendDefaultRuntimeCaching: true,
  workboxOptions: {
    disableDevLogs: true,
    runtimeCaching: [
      // Cloud library audio and art. Signed URLs change daily and audio is
      // fetched in ranges, so caching would only store fragments under keys
      // that never repeat; the default cross-origin rule would also hold
      // full-file responses in Cache Storage.
      {
        urlPattern: /^https:\/\/[^/]+\.r2\.cloudflarestorage\.com\//,
        handler: "NetworkOnly",
        options: { cacheName: "cloud-library-r2" },
      },
      // Session and listing depend on the sign-in cookie; a cached copy
      // would show a library after sign-out.
      {
        urlPattern: /\/api\/cloud\//,
        handler: "NetworkOnly",
        options: { cacheName: "cloud-library-api" },
      },
    ],
  },
});

/**
 * Cloud library objects are served from R2's S3 endpoint (path-style), on
 * this account's host only — not every R2 account's. Without an account the
 * deployment has no cloud library and R2 is not allowed at all.
 */
const R2_ORIGIN = process.env.R2_ACCOUNT_ID
  ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
  : "";

/** React's development tooling evaluates code at runtime; production never does. */
const SCRIPT_EVAL = process.env.NODE_ENV === "production" ? "" : "'unsafe-eval'";

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
            `script-src 'self' 'unsafe-inline' ${SCRIPT_EVAL} https://www.youtube.com https://s.ytimg.com`,
            "style-src 'self' 'unsafe-inline'",
            `img-src 'self' blob: data: ${R2_ORIGIN} https://i.ytimg.com https://*.googleapis.com https://i.scdn.co https://*.yeet.su https://static.qobuz.com https://resources.tidal.com https://m.media-amazon.com https://images-na.ssl-images-amazon.com`,
            "font-src 'self'",
            `connect-src 'self' blob: ${R2_ORIGIN} https://lrclib.net https://www.googleapis.com https://*.yeet.su https://resources.tidal.com`,
            "frame-src https://www.youtube.com",
            `media-src 'self' blob: ${R2_ORIGIN}`,
            "worker-src 'self' blob:",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'self'",
          ].join('; '),
        },
      ],
    },
  ],
  // Powered by header hata do — security best practice
  poweredByHeader: false,
}

export default withPWA(nextConfig);