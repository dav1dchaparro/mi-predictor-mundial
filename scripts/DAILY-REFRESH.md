# Playbook del agente diario — refresco + re-predicción (Mundial 2026)

> Receta que sigue el agente programado (1×/día, motor ligero). Objetivo: cargar los
> resultados del día anterior, refitear el modelo y re-predecir los partidos que faltan,
> en hora Colombia. Repo: `/home/juan-chaparro/mi-predictor-mundial`. Contexto completo en
> `CAMBIOS-IN-TORNEO.md` y `ESTRATEGIAS-COPIAR.md`.

## Pasos

1. **Traer resultados nuevos.** Buscar en la web (≥2 fuentes: Wikipedia/ESPN/FIFA) los
   partidos del Mundial 2026 jugados desde la última corrida que NO estén ya en
   `data/wc2026_results.json`. Agregarlos a ese JSON en el mismo formato
   `{group,date,home,hg,away,ag}` (orden REAL del partido). No duplicar.

2. **Refrescar datos y modelo:**
   ```bash
   npm run refresh:data    # ingestResults + fit (refit con lo nuevo) + exportRemaining
   ```
   Esto deja `data/remaining_matches.json` con los partidos aún por jugar y su distribución.

3. **Actualizar calendario** si hace falta: si hay partidos nuevos (p.ej. eliminatorias R32),
   agregarlos a `data/md3_schedule.json` con su `kickoffUTC` oficial (orden FIFA, ≥2 fuentes).
   Para grupos, ya está cargado.

4. **Re-predecir (motor LIGERO).** Lanzar el workflow `wc2026-match-intel`
   (`scripts/` del workflow ya existe) pasando `data/remaining_matches.json` como args:
   por cada partido → 1 research web (cuotas actuales + escenario + lesiones) + 1 juez.
   Guardar el output en `data/judge_picks_md3.json` (campos: match, finalScore, altScore,
   confidence, rationale). Si el juez invierte orientación, tomar el marcador del consenso.

5. **Reconstruir la página:**
   ```bash
   npm run refresh:page    # buildPicksPage: reorienta a orden oficial + hora Colombia
   ```

6. **Reportar** en 5-8 líneas: qué resultados nuevos entraron, cómo cambió la tabla de la
   polla (si se sabe), qué picks cambiaron y por qué, y cuántos partidos quedan.

## Recordatorios honestos
- Techo real del marcador exacto ~10-13%. No prometer más.
- NO re-tunear hiperparámetros (nu/rho) con partidos del torneo en curso (sobreajuste).
- El mercado hace la mayor parte del trabajo; el panel LLM es ~1 fuente, no varias.
