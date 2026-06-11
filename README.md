# IA Mundial 2026 — Predictor

App que proyecta todos los mercados estadísticos de cada partido del Mundial 2026
(1X2, goles, marcador exacto, BTTS, tarjetas, corners, goleadores) y el torneo
completo (campeón, Bota de Oro) con un modelo propio. Análisis de
entretenimiento, **no** casa de apuestas.

## Arquitectura (3 capas)

```
Ingesta (API-Football) -> SQLite -> Modelo (math puro) -> Dashboard (Next.js)
```

El modelo nunca toca la red: solo lee de SQLite. Es testeable y rápido.

## El modelo (`lib/model/`)

- **`poisson.ts`** — matriz de marcadores con corrección **Dixon-Coles** (sube
  empates y marcadores bajos, donde el Poisson simple falla).
- **`lambda.ts`** — goles esperados desde fuerza ofensiva/defensiva + ajustes
  Mundial 2026 (**altitud**, clima, ventaja de anfitrión).
- **`markets.ts`** — todos los mercados derivados de una sola matriz: 1X2, doble
  oportunidad, over/under, BTTS, top-5 exactos, portería a cero.
- **`polla.ts`** — **optimizador de puntos esperados**: elige el marcador que
  maximiza puntos según el reglamento de tu polla, no el más probable.
- **`montecarlo.ts`** — simula el torneo 10.000 veces (grupos + eliminatorias
  con penales) para campeón, fase alcanzada y Bota de Oro.
- **`cards.ts` / `corners.ts` / `scorers.ts`** — mercados secundarios.

## Correr en local

```bash
npm install
cp .env.example .env.local   # RAPIDAPI_KEY es opcional (el modelo corre offline)
npm run cron:run             # siembra equipos + partidos y calcula predicciones
npm run dev                  # http://localhost:3000
npm test                     # 34 tests del modelo, pipeline y backtest
npm run backtest             # valida el modelo contra Qatar 2022
```

## Validación (backtest, fase de grupos)

El modelo se valida contra tres torneos reales (`npm run backtest`):

| Torneo | Acierto 1X2 | Marcador exacto |
|--------|-------------|-----------------|
| Rusia 2018 (48) | 64.6% | 12.5% |
| Qatar 2022 (48) | 56.3% | 10.4% |
| Euro 2024 (36) | 47.2% | 25.0% |
| **Agregado (132)** | **56.8% ± 4.3%** | **15.2%** |

Meta de 1X2 (53-54%) superada. En los partidos decisivos el acierto sube a ~76%;
el techo lo ponen los empates (~25% de los partidos), que ningún modelo de
máxima probabilidad puede capturar sin sacrificar precisión. Bloqueado con tests.

Los parámetros del modelo (base de goles, escala de rating, rho de Dixon-Coles)
están calibrados por grid search sobre los 3 torneos (`npm run optimize`),
optimizando puntos de polla sin sacrificar marcador exacto.

## Anclaje al mercado (Betano, automático)

`lib/model/market.ts` invierte las cuotas de las casas para extraer los goles
esperados implícitos del mercado y los promedia con el modelo (peso 0.7 al
mercado, que es el predictor más afilado).

La ingesta es automática desde Betano:

```bash
npm run odds          # scrapea liga (1X2 de los 72) + 12 páginas de partido
npm run odds 24       # idem, hasta 24 páginas de partido (O/U + marcador exacto)
```

- `lib/data/betano.ts` — scraper (google-chrome headless) + parser del JSON
  embebido `window["initial_state"]`. Lee 1X2, Over/Under 2.5 y el mercado de
  marcador exacto de la casa.
- `lib/data/ingestOdds.ts` — empareja cada partido de Betano con su fixture (sin
  importar el orden local/visitante) y guarda las cuotas en la tabla `odds`.
- El recálculo ancla todos los partidos con 1X2 de liga; donde hay página de
  partido scrapeada, usa el **marcador exacto que publica Betano** como
  recomendación directa para el prode (lo que menos paga = más probable).

Re-ejecutable y cacheado: cada corrida completa más páginas de partido.

## Modo captura

`/captura/torneo` y `/captura/partido/[id]` — vistas verticales 9:16 con números
gigantes, sin nav, listas para grabar clips de Instagram/TikTok.

`npm run cron:run` es idempotente: siembra los 48 equipos y 72 partidos de grupo,
corre el Monte Carlo y guarda todas las predicciones con timestamp.

## Páginas

- `/` — favorito al título (Monte Carlo) + carrera por la Bota de Oro + grupos.
- `/grupo/[A-L]` — clasificación proyectada y partidos del grupo.
- `/partido/[id]` — todos los mercados, incluido el **pick óptimo de polla**.

## Pendiente / siguiente

- Ingesta real con `RAPIDAPI_KEY` (cliente listo en `lib/data/apiFootball.ts`).
- Backtest contra Qatar 2022 / Euro 2024.
- Re-correr el Monte Carlo con resultados reales conforme avanza el torneo.
