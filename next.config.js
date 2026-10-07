/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['playwright-core'],
  outputFileTracingRoot: __dirname,
}

module.exports = nextConfig
