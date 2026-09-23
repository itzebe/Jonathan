/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000' },
  // This app has state-changing, wallet-connected UI — disallow off-origin framing.
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  // The app does not use these device features.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
]

const nextConfig = {
  images: {
    unoptimized: true,
  },
  // Allow the Base44 preview origin to load dev assets and HMR. The platform sets
  // BASE44_PUBLIC_HOST_SUFFIX at runtime; the public origin is https://3000-<suffix>.
  allowedDevOrigins: process.env.BASE44_PUBLIC_HOST_SUFFIX
    ? [`3000-${process.env.BASE44_PUBLIC_HOST_SUFFIX}`]
    : [],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default nextConfig
