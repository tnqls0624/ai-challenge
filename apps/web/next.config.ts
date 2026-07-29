import path from 'node:path';
import type { NextConfig } from 'next';

export const SECURITY_HEADERS = [
  {
    key: 'Content-Security-Policy',
    value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
  },
  { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), microphone=()' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
] as const;

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        headers: [...SECURITY_HEADERS],
        source: '/:path*',
      },
    ];
  },
  output: 'standalone',
  outputFileTracingRoot: path.join(process.cwd(), '../..'),
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ['@dont-worry/contracts', '@dont-worry/risk-engine'],
};

export default nextConfig;
