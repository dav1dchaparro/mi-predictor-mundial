This is a substantial report request. Let me produce a focused, honest markdown report. The user wants it returned directly — but given the length and visual nature, this is a strong candidate for an Artifact. However, the instructions say my final response is returned verbatim to a calling script. Let me re-read the constraints.

The user (via orchestration) wants a markdown report in Spanish. My final text response is the return value. I should output the markdown directly as my final response. I won't write report files. Let me just compose it.

I have enough domain context in the dossier. No need for tools. Let me write the report directly.

# Qué copiar para clavar más marcadores exactos — Mundial 2026

## 1. Resumen ejecutivo (honesto)

**El techo del marcador exacto es estructural, no un fallo de tu modelo.** El fútbol es de alta varianza: la celda modal de un partido rara vez supera el 15% de probabilidad real, y tres marcadores (1-0, 2-1, 1-1 en contexto Mundial) acaparan ~40-50% de la masa. Bajo pérdida 0-1 (aciertas o no), tu regla actual —la **moda** de la matriz— es el predictor **Bayes-óptimo** (Foulley-Celeux / Duda-Hart). No hay regla de decisión mejor; lo único que mueve la aguja es mejorar la **distribución** sobre la que tomas el argmax.

**¿Alguien supera el ~10-15% de forma sostenida? No.** Los benchmarks verificados convergen exactamente en tu rango:
- ImpliedScore (pipeline casi idéntico al tuyo: 1X2+O/U → Poisson-DC) sobre 48 partidos: **14.6% top-1** observado vs 13.8% esperado.
- Squawka declara una banda **objetivo** de 8-12% (peor que tu 13.7% de backtest); su 60% "vivo" es de RESULTADO 1X2, no de exacto.
- Hicruben (Elo→DC→Monte Carlo): nunca puntúa exacto; su motor de goles es **inferior** al tuyo (sin ataque/defensa separados, sin CMP).

Cualquier claim de >18-20% sostenido en exacto es **suerte o medición sobre n pequeño**. Con n≈48 partidos de Mundial, el error estándar de la tasa es ~5pp: una mejora real de +2pp es **estadísticamente indistinguible del ruido** en un solo torneo. Por eso este reporte prioriza cambios validables en tu holdout grande (15.800 partidos), no en el Mundial vivo.

**Tu modelo ya está en la frontera.** DC (rho) + CMP (nu) + anclaje a mercado + MLE con decay es estado del arte para exacto. Las ganancias realistas son **+1 a +3pp**, frágiles al sobreajuste, y vienen de **calibración de la matriz y mejor inyección del mercado**, no de un modelo generativo más exótico.

---

## 2. Ranking de estrategias COPIABLES (mayor a menor impacto/esfuerzo)

### #1 — Pick CONDICIONAL por resultado (ganancia casi gratis, 1-2h)
**Qué es:** En vez de tomar la moda global de la matriz (que en partidos parejos se va a 1-1 por defecto), primero eliges el resultado más probable `argmax{P(h>a), P(h=a), P(h<a)}` y dentro de esa región tomas el marcador modal. Fuente: Reade-Singleton-Vaughan Williams (2020).

**Veredicto:** Evidencia media. Corrige el sobre-peso de 1-1 cuando hay favorito claro. Puede bajar levemente el hit en partidos sin favorito. **Va a A/B test, no a default a ciegas.**

**Pasos en tu stack:**
1. En `lib/model/scoreline.ts`: computa `pR = {sumar h>a, h==a, h<a}`, elige región `argmax(pR)`, restringe la matriz a esa región (triangular sup / diagonal / triangular inf) y toma argmax dentro.
2. Expón ambos: `mas-probable` (moda global, default) y `condicional`.
3. En tu backtest, **segmenta por desbalance del 1X2** (`max(hw,aw) > 0.55` = favorito claro vs parejo). Hipótesis verificable: condicional gana en parejos, empata en favoritos. Si se confirma, **enruta por segmento**: favoritos→moda global, parejos→condicional.

---

### #2 — Devig Shin de la matriz de Correct Score + blend por celda (el cambio de mayor ROI estructural)
**Qué es:** Hoy anclas al mercado solo por DOS escalares (lambda del O/U + reparto 1X2). Eso descarta toda la información de las ~20-40 celdas que la casa cotiza en el mercado de Correct Score, que es **el mejor estimador público de la distribución real de marcadores** (codifica alineaciones, lesiones, dinero informado). Devigas ese mercado con **Shin** (no multiplicativo) y mezclas celda a celda con tu matriz DC+CMP.

**Por qué Shin y no multiplicativo:** El mercado de CS tiene el favorito-longshot bias **más fuerte** que existe (un 4-3 está desproporcionadamente sobreprecio; 1-0/1-1 comprimidos). El devig proporcional deja ese sesgo intacto. Shin reparte el margen castigando más a favoritos y menos a longshots; Štrumbelj (2014/2016) muestra que reduce el sesgo ~2/3 vs normalización básica.

**Veredicto:** Evidencia media. La superioridad de Shin está documentada para 1X2/match-outcome, **no específicamente medida en CS** — es extrapolación teóricamente sólida pero NO probada en tu KPI. **Validar en tu backtest antes de hacer default.** Ganancia esperada: +1-3pp, no transformacional.

**Pasos en tu stack (reusás casi todo):**
1. **Ya tenés** `devigShin(prices: number[])` en `lib/model/market.ts` (líneas 44-64) — funciona para N outcomes vía bisección sobre z. **No reescribir.**
2. **Ingesta:** hoy `ctx.market.exact` existe (`lib/predict/predictMatch.ts:145`) pero solo usás `exact[0]` para display. Guardá el array completo `{score, odds}` (Pinnacle/Marathonbet/Betano) en SQLite: `correct_score_odds(match_id, book, home_goals, away_goals, bucket, price, fetched_at)`. Incluí las cestas `any other home/draw/away`.
3. **Construí la matriz de mercado:** `marketCsProbs(exact)` → parsea scores, arma el vector de precios COMPLETO (celdas + 3 cestas), llama `devigShin`, mapea de vuelta. Exponé el **z** para diagnóstico (z fuera de [0, 0.1-0.2] = cuotas stale/mal parseadas → fallback). Reparte cada cesta "Other" sobre las celdas no cotizadas de esa región usando la forma de tu Poisson-DC condicionada: `P(h,a) = P_other_region · p_DC(h,a)/Σ_region p_DC`.
4. **Blend geométrico por celda** (respeta mejor la forma del modelo que el lineal): `P_fused[h][a] ∝ P_DC[h][a]^(1-w) · P_market[h][a]^w`, renormalizá toda la matriz. Engancharlo en `predictMatch.ts` DESPUÉS de `buildScoreMatrix` (línea 122), solo si hay ≥8 celdas cotizadas; si no, fallback a DC pura.
5. **Calibrá w por backtest** en `scripts/tuneExact.ts`: barré w∈{0, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8}. Esperá óptimo interior ~0.4-0.6. Reportá hit-rate de exacto **Y** log-loss/Brier de la matriz (para no sobre-confiar en el mercado donde el modelo tenía razón). Baseline = 13.7%.
6. **Tests** en `market.test.ts`: (a) devigShin sobre set CS conocido suma 1 y z≥0; (b) cuotas justas (margen 0) no alteran la moda; (c) caso sintético donde el mercado mueve la moda de 1-1 a 2-1 con w alto.

**Caveat de doble conteo:** ya anclás al 1X2+O/U del mismo ecosistema de cuotas. Fusionar además la matriz CS puede **sobre-pesar el mercado**. Por eso w debe calibrarse, no fijarse a ojo, y conviene reconciliar con IPF (ver #4).

---

### #3 — Combinación convexa de lambdas modelo+mercado vía Skellam (Egidi-Pauli-Torelli 2018)
**Qué es:** En vez de tu `blendLambdas` actual (peso 0.5 fijo entre MLE e implícitas), inviertes las prob 1X2 devigadas a tasas de goleo implícitas vía **Skellam** (diferencia de Poissons) y combinas: `gamma_i = p·lambda_MLE_i + (1-p)·lambda_market_i`, con p calibrado por grid-search. La matriz sigue saliendo de tu DC+CMP con esas gamma.

**Veredicto:** Evidencia media (peer-reviewed, Statistical Modelling). **CAVEAT crítico:** el paper optimiza ajuste/ROI de 1X2, **NUNCA** marcador exacto — y los autores son explícitamente hostiles a perseguir la moda exacta ("¿sería inteligente apostar a un evento con prob ~0.09? quizás no"). Usás su **mecanismo** para un fin que ellos no validan. Para selecciones (pocos datos propios) el anclaje al mercado puede pesar MÁS que en clubes.

**Pasos:**
1. `skellamProbs(theta1, theta2)`: en la práctica, truncá goles 0..15 y sumá la grilla Poisson×Poisson directamente (más simple que la serie de Bessel).
2. Resolvé `(theta1, theta2)` desde (pW+pD, pL) reparametrizando como `mu_tot = theta1+theta2` (anclado por O/U) y `d = theta1-theta2` (line-search 1D sobre la diferencia Skellam). Robusto y casi-desacoplado.
3. Tratá **p como hiperparámetro global** (no full-bayes): grid `p∈{0,0.1,...,1}` maximizando exacto en backtest. El paper muestra óptimo intermedio. Esto te da YA la receta de ponderación sin reescribir el fitter.
4. Compará: (i) modelo actual, (ii) solo-mercado (p=0), (iii) combinado. Si exacto no sube pero baja RPS, igual es mejor. Cuidado con look-ahead: elegí p en train, medí en test.

**Solapamiento con #2:** #2 inyecta la matriz CS completa; #3 mejora solo las dos lambdas desde 1X2. Si hacés #2 bien, #3 aporta poco extra. Priorizá #2.

---

### #4 — Reconciliación IPF/RAS de la matriz fusionada a marginales de mercado
**Qué es:** Después de fusionar (modelo + CS de mercado), reescalas filas/columnas/diagonal iterativamente para que P(local), P(empate), P(visita) y P(over 2.5) de la matriz coincidan **exactamente** con los valores 1X2 y O/U del mercado devigados. Mantiene la estructura interna coherente y evita inconsistencias entre fuentes.

**Veredicto:** Adaptación estándar (RAS, 1940), **no método publicado específico de este dominio**. Útil como pegamento; no es una fuente de ganancia por sí mismo.

**Pasos:**
1. `ipf(matrix, targets)`: itera reescalado de regiones (triangular sup = P(home), diagonal = P(draw), triangular inf = P(away), `Σ_{h+a>2}` = P(over2.5)). ~20-50 iteraciones.
2. Usá **el mismo Shin** para todos los marginales (1X2 y O/U) o no convergerá / dará celdas ~0. Poné piso epsilon a las celdas.
3. Aplicalo sobre la matriz fusionada de #2 antes de tomar la moda.

---

### #5 — Diagonal-inflation estilo 538 (DIBP, Karlis-Ntzoufras)
**Qué es:** Multiplicas las celdas de empate (h==a) por (1+phi) y renormalizas, capturando empates sub-contados que ni DC (solo toca 4 celdas bajas) ni CMP modelan del todo. phi~0.06-0.09.

**Veredicto:** Evidencia media. **Riesgo de sobre-parametrización:** DC(rho), CMP(nu) y phi **compiten por explicar lo mismo** (exceso de empates). Apilarlos sin re-ajuste conjunto degrada fuera de muestra.

**Pasos:**
1. Tras construir la matriz: `for k: P[k][k] *= (1+phi)`; renormalizá.
2. Ajustá phi por grid-search sobre los 15.800 partidos maximizando log-lik del scoreline observado, **re-ajustando rho y nu conjuntamente** (o fijá rho≈0 y dejá que phi cargue los empates). Permití phi distinto para Mundial (tasa de empate ≠ ligas).
3. Validá que phi aporta señal **marginal** sobre rho/nu por hit-rate de exacto, no solo AIC. Si no aporta, descartalo.

---

### #6 — Prior empírico de marcadores condicionado al perfil del partido (shrinkage)
**Qué es:** Mezclas tu matriz con una tabla de frecuencias históricas de marcadores **condicionada al contexto** (fase de grupos Mundial es mucho más low-scoring: 1-0=18.9%, 2-1=15.8%, 2-0=11.5%) y al perfil del choque (defensivo/ofensivo según lambda total). `P_final = (1-w)·P_mod + w·P_emp_bucket`.

**Veredicto:** Evidencia media (fuentes agregadas, no peer-reviewed). Sube hit-rate pero puede empeorar log-loss/EV. **Riesgo de leakage:** no metas los partidos del Mundial 2026 ya jugados a la vez en el prior Y en el refit.

**Pasos:**
1. Tabla SQLite `scoreline_prior(bucket, home_goals, away_goals, prob)` desde tus martj42: buckets `wc_group`, `wc_all`, `global`. Dirichlet smoothing hacia torneo→global cuando n sea chico.
2. **Orientá por favorito** (lambda mayor = favorito), porque en Mundial casi no hay localía real.
3. `classifyMatch(lambdaH, lambdaA)`: total<2.4→defensivo, >3.0→ofensivo. `w` adaptativo: mayor cuando la moda es plana (`P_top1 - P_top2` chico).
4. Grid-search `w_base∈{0.15,0.25,0.35}`, k, umbrales, holdout = Mundiales completos. Pesá más Mundiales recientes (data drift: el Mundial moderno mete más goles que el histórico 50s-80s).

---

### #7 — Fitting con xG + recalibración post-hoc (temperature/isotónica)
**Qué es:** (a) Fitear las fuerzas con xG en vez de goles brutos reduce la varianza del estimador ataque/defensa (la mayor fuente de error en muestras chicas como selecciones). (b) Recalibrar la matriz contra el histograma empírico por celda (binning → reliability → escalado).

**Veredicto:** Evidencia media-indirecta. El propio autor de "Stats and Snake Oil" **no testeó** xG-DC vs vanilla en exacto; el ROI de xG es para 1X2/over-under. **Datos de xG para selecciones e históricos largos son escasos e inconsistentes** — xG ruidoso puede EMPEORAR las fuerzas.

**Pasos:**
1. xG por partido donde exista (FBref/Understat: Mundiales/Euros/eliminatorias recientes; fallback a goles en amistosos viejos). El MLE de Poisson acepta medias no enteras → usá xg_home/xg_away como observación continua.
2. **No toques** `poisson.ts` (DC+CMP). Las fuerzas entran por `lambda.ts`.
3. `calibrateMatrix(sm, {alpha, T})`: temperature scaling (`p^(1/T)`) + shrinkage al prior, DESPUÉS de `buildScoreMatrix`, ANTES de `pickScoreline`. Tuneá alpha∈[0,0.4], T∈[1,1.5] **walk-forward** (nunca in-sample). Si óptimo alpha=0, no ayuda → descartá.

---

### #8 — Pesos por importancia de partido en el decay del MLE (de Hicruben)
**Qué es:** Pesar la verosimilitud por tipo de competición (amistoso ~0.33, qualy ~0.7, continental ~0.9, Mundial 1.0) además del decay temporal. Limpia el ruido de amistosos.

**Veredicto:** Concepto sólido y barato. Constantes de Hicruben NO son portables; calibrá las tuyas.

**Pasos:** añadí el peso por competición a la log-lik en `lib/model/fit.ts`. Validá half-life (Hicruben usa 18 meses: `0.5^((dias/30.44)/18)`) contra tu decay actual.

---

## 3. Quién acertó más y qué copiaría

Honestamente, **nadie demostró superar tu rango en exacto este Mundial.** Lo verificado:

| Fuente | Método | Exacto | Qué copiar |
|---|---|---|---|
| **ImpliedScore** | 1X2+O/U → Poisson-DC | 14.6% top-1 (n=48) | Nada nuevo — es tu mismo pipeline. Confirma tu techo. Copiá su **reporte top-1/top-3/top-5 observado vs esperado** como vara de calibración. |
| **Squawka** | Blend 4 señales (40% mercado CS + 35% delta forma xG + 15% fuerza + 10% H2H), moda | Objetivo 8-12% (peor que vos) | La señal de **forma reciente/xG** (tu `lambda.ts` no tiene `form`) y el **ancla de correct-score market**. NO su matemática (es Poisson+moda igual que vos). |
| **Hicruben** | Elo→DC→Monte Carlo | No publica exacto; 62% resultado | Solo como **benchmark de calibración** (RPS 0.175, ECE 2.3%). Su motor es inferior. Probá su rho más agresivo (-0.13 vs tu -0.05) en un sweep. |
| **Marathonbet/Pinnacle CS** | Mercado de cierre devigado | Mejor estimador público de la distribución | **Esto es lo único realmente copiable que no tenés** (estrategia #2). |

**Conclusión:** el activo diferencial copiable es **el mercado de Correct Score devigado con Shin** (#2), no ningún modelo. Los "predictores AI" públicos son Poisson+moda como vos, con peor backend.

---

## 4. Quick-wins (ya) y apuestas de mediano plazo

### 3 Quick-wins (implementables esta semana)
1. **Pick condicional + segmentación favorito/parejo** (#1). 1-2h de código, reusa todo. Mide dónde tu hit-rate es alto (favoritos) vs bajo (parejos) y rutea estrategia por segmento. Output honesto inmediato: tabla de confianza por partido.
2. **Devig Shin del mercado CS y blend por celda** (#2). Ya tenés `devigShin`. El trabajo real es la ingesta de las celdas CS y `tuneExact.ts`. Es tu mayor ROI estructural.
3. **Pesos por importancia en el decay del MLE** (#8) + sweep de rho∈{-0.05,-0.08,-0.10,-0.13}. Barato, dentro de `fit.ts`/`poisson.ts`, optimizando exacto en holdout.

### 2 Apuestas de mediano plazo
1. **Stack completo de reconciliación de mercado:** matriz CS Shin + IPF a marginales 1X2/O/U + combinación convexa de lambdas Skellam (#2+#3+#4), todo calibrado conjuntamente. Es la versión rigurosa Egidi-style; bien hecho captura casi todo el lift disponible del mercado.
2. **Señal de forma/xG en `lambda.ts`** (#7 + Squawka): tabla `team_form` con xG/tiros/big chances por ventana, `formMultiplier` como delta sobre lambda, decay intra-torneo. Backtesteable con datos abiertos (FBref). Captura el estado ACTUAL que las fuerzas MLE con decay todavía no reflejan — relevante para selecciones en racha/lesionadas.

---

## 5. Qué NO vale la pena (trampas)

1. **Weibull-count + cópula de Frank (Boshnakov-McHale 2017).** Base teórica real, pero: (a) el paper mide 1X2 y ROI de over/under, **nunca exacto**; (b) **ya probaste una cópula de Frank** (`scripts/expCopula.ts`) y empató (~13.3%) sin mejora, porque con lambdas ancladas al mercado el lift de cambiar la forma marginal es estructuralmente pequeño. Caro (serie de 50 términos con gamma functions, cancelación catastrófica) para nada. Si querés algo: separá tu nu en `nuHome/nuAdway` (dispersión asimétrica) y A/B-testeá eso primero — barato y captura el 80%.

2. **Bivariate Poisson puro (componente L3).** Cov(X,Y)=L3≥0: solo modela correlación **positiva**. La señal útil en fútbol (exceso de empates) es **negativa** y ya la captura tu rho=-0.05. Benchmarks externos (Eredivisie) ponen al BP empatado o **peor** que Poisson simple. Solo la capa de inflación diagonal (#5) tiene valor, no el bivariado.

3. **Buscar un modelo generativo que salte a 18-20%.** No existe en exacto de fútbol. XGBoost/ML gana en 1X2/RPS pero **no se demostró** que gane en exacto; el bivariate-CMP bayesiano (arXiv 2409.17129) mejora DIC pero sus autores ni evalúan exacto. La literatura 2024 sigue diciendo que DC "no ha sido superado significativamente".

4. **Predictores "AI" de tipsters (freebets/1960Tips/gamblingcalc).** Contenido comercial, no peer-reviewed. Sus % de marcadores son folclore (correcto pero no auditado) y mezclan ligas/torneos con goal-averages distintos. Su "edge" real es solo apostar a favoritos claros — que es lo que tu moda ya hace. Calibrá sobre TUS datos, no copies sus números.

5. **Sobre-interpretar resultados del Mundial vivo.** Con n≈48 y SE~5pp, un torneo "bueno" no distingue método de suerte. **No cambies el default por el resultado de 2026.** Validá todo en el holdout de 15.800 partidos walk-forward.

6. **Apilar rho + nu + phi + DIBP sin re-ajuste conjunto.** Todos atacan el eje empates/baja-anotación. Sumarlos a ojo sobre-corrige hacia low-scoring y mata marcadores correctos de 2-1/3-1. Cada parámetro nuevo va a backtest con su control (el modelo debe reducirse al actual cuando el parámetro = neutro).

---

**Cierre:** Estás en el techo. La única palanca con evidencia para subir +1-3pp es **inyectar mejor el mercado** (Correct Score devigado con Shin, calibrado por backtest) y **calibrar la matriz** (condicional + prior + recalibración), todo medido en tu holdout grande con doble métrica (hit-rate de exacto + log-loss). Cualquier promesa de salto grande es marketing o ruido. El deliverable más honesto para el usuario final no es "este marcador es seguro", sino **la confianza calibrada por partido** (P(moda) y bin), porque >50% de acierto en exacto no existe.