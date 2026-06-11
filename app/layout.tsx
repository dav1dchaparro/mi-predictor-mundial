import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "IA MUNDIAL 2026 — Predictor",
  description: "Así proyecta la IA cada mercado de cada partido del Mundial 2026.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen">
        <header className="border-b border-line">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
            <Link href="/" className="flex items-baseline gap-2">
              <span className="text-acid uptick text-sm font-bold">IA·MUNDIAL</span>
              <span className="text-muted uptick text-[10px]">2026 / DATA TERMINAL</span>
            </Link>
            <nav className="flex gap-5 text-xs uptick text-muted">
              <Link href="/" className="hover:text-chalk">Torneo</Link>
              <Link href="/partidos" className="hover:text-chalk">Partidos</Link>
              <Link href="/precision" className="hover:text-acid">Precisión</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>
        <footer className="border-t border-line">
          <div className="mx-auto max-w-6xl px-5 py-4 text-[10px] uptick text-muted">
            Análisis estadístico de entretenimiento. No es asesoría de apuestas.
          </div>
        </footer>
      </body>
    </html>
  );
}
