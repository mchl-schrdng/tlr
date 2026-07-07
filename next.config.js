/** @type {import('next').NextConfig} */
const nextConfig = {
  // node:sqlite is a built-in Node module; keep it external to the server bundle.
  serverExternalPackages: ["node:sqlite"],
  devIndicators: false,
};

module.exports = nextConfig;
