// Demo: predicción completa de un partido. Correr con: npx tsx scripts/demo.ts
import { computeLambdas, buildScoreMatrix, deriveAllMarkets, optimalPick } from "../lib/model/index.js";

// Ejemplo: Argentina (fuerte) vs México, en Ciudad de México (altitud 2240m).
const argentina = { name: "Argentina", attack: 1.45, defense: 0.78 };
const mexico = { name: "México", attack: 1.05, defense: 1.0 };

const { lambdaHome, lambdaAway } = computeLambdas({
  home: mexico,        // local: México (anfitrión)
  away: argentina,
  venue: { altitudeMeters: 2240, homeIsHost: true },
});

const sm = buildScoreMatrix(lambdaHome, lambdaAway, { rho: -0.06 });
const m = deriveAllMarkets(sm);
const pct = (x: number) => (x * 100).toFixed(1) + "%";

console.log(`\n  México vs Argentina  (Ciudad de México, 2240m)`);
console.log(`  Goles esperados: ${lambdaHome.toFixed(2)} - ${lambdaAway.toFixed(2)}\n`);
console.log(`  1X2:  Local ${pct(m.result.home)} | Empate ${pct(m.result.draw)} | Visita ${pct(m.result.away)}`);
console.log(`  BTTS (ambos marcan): ${pct(m.bttsYes)}`);
m.overUnder.forEach((ou) => console.log(`  Over ${ou.line}: ${pct(ou.over)}`));
console.log(`\n  Top 5 marcadores exactos:`);
m.topScores.forEach((s) => console.log(`    ${s.home}-${s.away}  ${pct(s.prob)}`));

// Optimizador de polla: 5 pts exacto, 2 pts solo resultado.
const { best } = optimalPick(sm, { exactScore: 5, correctResult: 2 });
const mostLikely = m.topScores[0]!;
console.log(`\n  Marcador MÁS PROBABLE: ${mostLikely.home}-${mostLikely.away}`);
console.log(`  Pick ÓPTIMO para la polla: ${best.home}-${best.away}  (${best.expectedPoints.toFixed(2)} pts esperados)`);
