import type { Config } from "tailwindcss";
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0a0e0f",        // fondo casi negro
        panel: "#11181a",      // paneles
        line: "#1e2a2c",       // bordes
        chalk: "#e7f0ee",      // texto
        muted: "#6b8480",      // texto secundario
        acid: "#c8ff00",       // acento (verde data terminal)
        warn: "#ff5d3b",       // negativo / rojo
      },
      fontFamily: {
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
