import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The domain package ships TypeScript source rather than a build artifact, so
  // there is no compile step between changing a rule and both clients seeing
  // it. Expo's Metro bundler does the equivalent at M4.
  transpilePackages: ['@rental/domain'],

  typedRoutes: false,

  experimental: {
    // Server actions carry receipt images from the desktop bulk-entry screen.
    serverActions: { bodySizeLimit: '12mb' },
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
