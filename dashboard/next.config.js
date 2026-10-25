/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // Emergency escape hatch for server deploys only; default stays strict.
    ignoreBuildErrors: process.env.SKIP_TYPECHECK === '1',
    tsconfigPath: 'tsconfig.build.json',
  },
  reactStrictMode: true,
};

module.exports = nextConfig;
