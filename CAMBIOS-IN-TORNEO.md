# Cambios in-torneo — Mundial 2026 (handoff de contexto)

> **Para qué es este archivo:** dejar todo el contexto de la sesión del **24-jun-2026** para que
> cualquier chat futuro retome sin repreguntar. Objetivo del usuario: va **5º en una polla
> familiar**, quiere **MAXIMIZAR marcadores EXACTOS** en los partidos que faltan. Autorizó gasto
> alto de tokens (workflows). Hoy del proyecto = 2026-06-24.

---

## 1. Qué estaba mal (diagnóstico inicial)

- El sistema tenía **0 resultados reales cargados**: las 72 predicciones eran **estáticas, pre-torneo**
  (18-jun) y nunca se actualizaban con lo jugado.
- Medido contra la realidad (`scripts/diagnose.ts`): el pick guardado clavó **4/47 = 8.5%** de exactos.
- Dos fallas estructurales: (a) el modelo **no veía goleadas** (comprimía a los favoritos:
  Alemania 7-1 → predijo 4-0, Canadá 6-0 → 2-0, Portugal 5-0 → 2-0); (b) **abusaba del 1-1**
  (la moda de Dixon-Coles infla el empate en favoritos moderados).

## 2. Qué se hizo (pipeline nuevo, en orden)

1. **Verificar resultados reales** — workflow de 12 agentes (1 por grupo), cada partido cruzado
   contra ≥2 fuentes (Wikipedia/ESPN/FIFA/Yahoo/CBS/Sky). → `data/wc2026_results.json` (47 partidos).
   Después se confirmó **Colombia 1-0 DR Congo** (24-jun) → **48 partidos jugados**.
2. **Cargar a la DB** — `scripts/ingestResults.ts`: marca `fixtures` como `finished` (goles orientados
   al fixture) e inserta en `matches_history` (neutral=1 salvo anfitriones mexico/canada/usa; borra
   antes los WC-2026 del CSV martj42 para no duplicar la fecha 1).
3. **Recalibrar el núcleo estadístico:**
   - **Refit de fuerzas** con lo jugado (`scripts/fit.ts`, ahora `matches_history` incluye el Mundial,
     peso de recencia máximo) → spread realista (Alemania ataque 1.30→1.88, Catar defensa →2.34).
   - **`SCORE_NU` 1.10 → 1.15** en `lib/predict/predictMatch.ts` (afina la moda). Validado con
     `scripts/tuneWC.ts` (backtest in-torneo: entrena pre-Mundial, testea sobre los 47; óptimo en
     muestra ~17% pero sobreajusta, por eso 1.15 conservador). `SCORE_RHO` sigue en -0.05.
4. **Motor de inteligencia + juez** — workflow `wc2026-match-intel` (50 agentes, ~740k tokens):
   por cada partido restante, etapa 1 = research web (cuotas actuales + escenario de clasificación
   fecha 3 + rotación/lesiones), etapa 2 = juez que ensambla modelo+mercado+contexto → marcador
   final + alternativo + confianza + razón. Corrige el sesgo de 1-1 y mete contexto que el modelo
   no puede saber (rotación de clasificados, dead rubbers, lesiones). → `data/judge_picks_md3.json`.
5. **Calendario real + hora Colombia** — workflow `wc2026-md3-schedule` (12 agentes) trajo el
   kickoff UTC oficial de cada partido restante → `data/md3_schedule.json` (orden oficial FIFA).
   `scripts/buildPicksPage.ts` reorienta cada pick al orden oficial local-visitante, convierte a
   **hora de Colombia (UTC-5)** y reconstruye la página.

## 3. Entregable

- **Página local:** `public/picks.html` servida en **http://localhost:3000/picks.html**
  (dev server: `npm run dev`). Standalone, mobile, ordenada por fecha/hora Colombia.
- También hubo un artifact en claude.ai (versión anterior, sin el fix de hora/orientación).
- Datos finales en `data/final_report.json`.

## 4. Archivos nuevos / modificados

**Scripts nuevos** (`scripts/`):
- `ingestResults.ts` — carga resultados reales a fixtures + matches_history.
- `diagnose.ts` — mide pick guardado vs realidad (exacto / 1X2 / dif) y por estrategia.
- `tuneWC.ts` — backtest in-torneo para elegir config (rho/nu/base/estrategia).
- `exportRemaining.ts` — exporta partidos `scheduled` con su distribución → `data/remaining_matches.json`.
- `buildPicksPage.ts` — combina picks + calendario, reorienta, hora Colombia, render → `public/picks.html`.
- `picks.template.html` — plantilla HTML de la página.

**Modificados:**
- `lib/predict/predictMatch.ts` — `SCORE_NU` 1.10→1.15.
- `data/mundial.db` — 48 resultados cargados + fuerzas refiteadas.

**Datos generados** (`data/`, en .gitignore salvo mundial.db):
- `wc2026_results.json` (resultados reales), `judge_picks_md3.json` (picks del juez),
  `md3_schedule.json` (calendario+UTC), `remaining_matches.json`, `final_report.json`.

## 5. Cómo regenerar todo (cuando se jueguen más partidos)

```bash
# 1. Agregá los nuevos resultados a data/wc2026_results.json (verificados), luego:
npx tsx scripts/ingestResults.ts      # carga a la DB
npx tsx scripts/fit.ts                 # refit de fuerzas + recompute de los scheduled
npx tsx scripts/exportRemaining.ts     # exporta los partidos por venir
# 2. Re-correr el motor de inteligencia (workflow wc2026-match-intel) con data/remaining_matches.json como args
# 3. Guardar el output del juez en data/judge_picks_md3.json y el calendario en data/md3_schedule.json
npx tsx scripts/buildPicksPage.ts      # reconstruye public/picks.html en hora Colombia
npx tsx scripts/diagnose.ts            # mide la tasa de exacto contra lo ya jugado
```

## 6. Decisiones / convenciones clave

- **Hora del usuario = Colombia (America/Bogota, UTC-5, sin DST).** `buildPicksPage.ts` convierte UTC−5.
- **Orientación:** los picks se muestran en el **orden oficial FIFA** (local-visitante), que NO siempre
  coincide con el orden de los fixtures del seed → `buildPicksPage.ts` da vuelta el marcador cuando
  difiere. El pronóstico (quién gana y por cuánto) no cambia, solo el orden de display.
- **OJO:** los `kickoff` de la tabla `fixtures` siguen siendo los del seed pre-torneo (incorrectos);
  el calendario correcto vive en `data/md3_schedule.json`. Si se integra a la app, actualizar fixtures.
- **Expectativa honesta:** el marcador exacto tiene techo ~13-15%; ni las casas lo superan. El valor
  está en ver goleadas (refit) y ajustar por contexto de fecha 3 (motor de inteligencia).

## 7. Pendiente (F5)

- **Eliminatorias (R32+):** NO están como fixtures y el bracket recién se define al cerrar los grupos
  (fecha 3 termina ~27-28 jun). Cuando termine: cargar resultados de fecha 3 → refit → armar el
  bracket R32 desde las posiciones finales → correr el motor de inteligencia para los cruces.

## 8. Memorias relacionadas (`~/.claude/.../memory/`)

- `predictor-strategy.md`, `mle-fitter-pendiente-datos.md`, `in-tournament-update.md`.
