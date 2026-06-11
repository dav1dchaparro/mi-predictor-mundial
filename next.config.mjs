/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";
const repo = "mi-predictor-mundial"; // nombre del repo en GitHub (project page)

const nextConfig = {
  // Sitio 100% estático: se "hornea" en build leyendo SQLite, no hay servidor.
  output: "export",
  // GitHub Pages sirve el repo bajo /<repo>/, no en la raíz del dominio.
  basePath: isProd ? `/${repo}` : "",
  assetPrefix: isProd ? `/${repo}/` : "",
  images: { unoptimized: true },
  trailingSlash: true,
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
