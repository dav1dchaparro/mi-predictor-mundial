/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  webpack(config) {
    // Permite imports con extensión .js que apuntan a archivos .ts (estilo ESM),
    // que es como están escritos lib/ y los tests.
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
    };
    return config;
  },
};
export default nextConfig;
