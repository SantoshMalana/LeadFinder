import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: [
    'pdf-parse',
    'playwright',
    'playwright-extra',
    'puppeteer-extra-plugin-stealth',
    'imap-simple',
    'mailparser',
    'pdfkit',
  ],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : []),
        'canvas',
        'jsdom',
      ]
    }
    return config
  },
  turbopack: {},
}

export default nextConfig
