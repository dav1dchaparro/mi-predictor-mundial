# Análisis — Marcadores Mundial 2026 (modelo + tres fuentes de mercado)

> Pipeline actualizado (17-jun). Fuentes: **modelo propio** (Poisson + Dixon-Coles,
> ρ −0.14), **Betano** (1X2 + Over/Under + marcador exacto, vía Chrome headless),
> **Pinnacle** (1X2, API guest — la casa "sharp" de referencia mundial) y **EU**
> (consenso de William Hill / Marathonbet / 1xBet vía The Odds API). El **consenso**
> promedia las probabilidades *sin margen* —ahora con **devig de Shin**— ponderando
> **Pinnacle al doble**, y es lo que la app muestra como "marcador a jugar".
> Reproducible: `npm run odds` (Betano) + `npm run market` (Pinnacle + EU + consenso).

## 0. Qué cambió en esta iteración (y por qué)

Tras investigar la literatura de pronóstico con cuotas (Štrumbelj 2014; Clarke 2017;
Wheatcroft 2019) se aplicaron cuatro mejoras de mayor impacto/esfuerzo:

1. **Devig de Shin en vez de multiplicativo.** El método multiplicativo (normalización
   proporcional) es el *menos* preciso: infla los favoritos extremos. Shin reparte el
   margen modelando "apostadores informados" y queda mejor calibrado para casi todas las
   casas (mejor para Pinnacle/bet365). Es la mejora de calibración de fondo.
2. **Tercera fuente (consenso EU de The Odds API).** Una sola llamada trae varias casas;
   se promedian *excluyendo* Pinnacle (que ya entra por su API guest) para no contarla dos
   veces. Más libros independientes ⇒ consenso menos ruidoso.
3. **Ponderación de Pinnacle ×2.** Su línea de cierre es la señal pública más afilada
   (r²≈0.997 vs resultados). Con 3 fuentes aporta ~50% del consenso; con 2, ~67%.
4. **Criterio de Kelly + curvas de calibración** (ver §3 y §4): gestión de banca y
   validación estadística, siguiendo la tesis de Millassón.

## 1. Las casas concuerdan; el consenso es robusto

Betano y Pinnacle difieren <2pp de probabilidad de victoria local en ~90% de los partidos.
Cuando libros independientes coinciden tanto, el consenso es una referencia muy sólida.
El devig de Shin sube levemente a los favoritos claros (p. ej. España vs Arabia 85→88%,
Curazao vs Ecuador 86→89% visita): coherente con corregir el sesgo favorito-longshot.

## 2. El mercado modera y corrige al modelo

Anclar al consenso sigue cambiando algunos marcadores del modelo: modera goles donde el
modelo se entusiasma (México-Corea, USA-Australia: `2-1 → 1-0`) y ensancha la brecha contra
colistas (Curazao: `0-1 → 0-2`). El reglamento de prode `{exacto:5, resultado:2, dif:1}`
favorece asegurar el resultado con la diferencia más probable: domina `1-0/0-1`, los `2-0`
quedan para goleadas claras, y no aparece ningún `1-1`.

## 3. Diagnóstico de valor (Kelly) — leer con cautela

El criterio de Kelly compara la prob. del **modelo puro** (sin anclar) contra la mejor cuota
disponible. El resultado es revelador: de ~69 "señales de valor", **~42 son al empate** y
varias a tapados con cuota >15 (edges de +200/+300%). **No son 70 oportunidades reales**:
son la firma de que el **modelo puro sobreestima los empates y comprime los extremos** frente
al mercado, que es más afilado en las colas. La lectura correcta: el edge genuino (si existe)
está en señales moderadas, no en longshots. Ver la sección "Apuestas de valor" de REPORTE.md.
Kelly fraccional (¼) y edge ≥7%. Esto es gestión de banca para 1X2, no el marcador del prode.

## 4. Validación por calibración (`npm run backtest`)

Sobre 132 partidos de 3 mundiales/euros históricos:

| Métrica | Valor | Lectura |
|---|---|---|
| Acierto 1X2 | 56.8% ± 4.3% | muy por encima del azar (~40%) |
| Marcador exacto | 15.2% | sobre el ~9-10% esperable |
| **Brier score** | **0.1947** | mejor que el azar 1X2 (0.2222); sólido |
| **Sesgo de empate** | **+3.2 pp** | el modelo da 28.2% a empate; ocurren 25.0% → **sobreestima X** |

La curva de fiabilidad muestra el patrón clave: el modelo es **subconfiado en favoritos**
(bin 60-70%: predice 64%, ocurre 86%) y algo sobreconfiado en la franja media (20-30%).
Esto confirma cuantitativamente la "compresión de extremos" y el exceso de empates que el
diagnóstico de Kelly ya insinuaba — y marca el camino de mejora (§6).

## 5. Quién gana el Mundial (Monte Carlo del modelo, 10.000 simulaciones)

| Equipo | Campeón |
|---|---|
| Argentina | 15.5% |
| España | 14.8% |
| Brasil | 11.8% |
| Francia | 11.6% |
| Portugal | 6.7% |
| Inglaterra | 6.5% |

(El Monte Carlo del torneo usa las fuerzas del modelo, no las cuotas; no cambia con el devig.)

## 6. Próximo paso: fuerzas por MLE con ponderación temporal

Hoy ataque/defensa se derivan de un **rating Elo estático** (`lib/data/seed.ts`). La tesis de
Millassón propone estimarlos por **máxima verosimilitud** sobre resultados históricos, con
**peso exponencial por antigüedad** (los partidos recientes pesan más). Ya está implementado
el estimador autónomo y testeado en `lib/model/fit.ts` (`fitDixonColes` + `timeDecayWeight`):
ajusta ataque/defensa/ventaja-local maximizando la log-verosimilitud Poisson con corrección
Dixon-Coles y decay `exp(−ξ·días)`. Y el **pipeline completo ya está armado**:

- `lib/data/history.ts` ingesta resultados internacionales de selecciones a `matches_history`.
- `npm run fit [xi] [minMatches]` ingiere (si hace falta), ajusta el MLE sobre TODOS los
  partidos internacionales, **re-centra las 48 selecciones a media geométrica 1.0** (la
  convención del modelo) y escribe `attack`/`defense`; las selecciones con pocos datos
  mantienen su rating Elo. Luego recalcula predicciones.

**Solo falta la `RAPIDAPI_KEY`** (api-football, plan free 100 req/día) para ingerir el
histórico real. Es la vía directa para corregir el sesgo de empate y la subconfianza en
favoritos del §4. Tras correr `npm run fit`, re-correr `npm run market` re-ancla al mercado.

## Caveats honestos

- Cuotas del momento del scrape; cambian con alineaciones/lesiones. Re-correr actualiza.
- Los 12 partidos de la 1ª fecha ya no tienen mercado abierto: para esos manda el modelo solo.
- La key "guest" de Pinnacle es pública y puede rotar (`PINNACLE_API_KEY`). The Odds API
  necesita `THE_ODDS_API_KEY` (free tier ~500 req/mes); sin ella el consenso usa 2 fuentes.
- Esto es análisis de entretenimiento, no recomendación de apuesta.
