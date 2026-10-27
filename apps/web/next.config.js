/**
 * Mount the app under a sub-path (e.g. /freeframe) instead of the domain root.
 * Build-time: set NEXT_PUBLIC_BASE_PATH and rebuild the web image. Empty by
 * default, so root deployments are unchanged.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''

/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath,
  output: 'standalone',
  allowedDevOrigins: ['192.168.1.234', 'null'],
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '9000',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/api/assets/:path*',
        headers: [{ key: 'Access-Control-Allow-Origin', value: '*' }],
      },
      {
        source: '/api/share/:path*/thumbnail',
        headers: [{ key: 'Access-Control-Allow-Origin', value: '*' }],
      },
    ];
  },
}

module.exports = nextConfig
