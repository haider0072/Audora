import nextConfig from "eslint-config-next";

export default [
  ...nextConfig,
  {
    ignores: [
      "node_modules/",
      ".next/",
      "out/",
      "public/sw.js",
      "public/workbox-*.js",
      "public/worker-*.js",
      "public/swe-worker-*.js",
    ],
  },
];
