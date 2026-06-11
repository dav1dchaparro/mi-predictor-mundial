import { describe, it, expect } from "vitest";
import { fairProbs1X2, totalGoalsFromOverUnder, marketLambdas, blendLambdas } from "./market.js";
import { buildScoreMatrix, result1X2 } from "./index.js";

describe("market anchoring", () => {
  it("las probabilidades justas suman 1 y quitan el margen", () => {
    const f = fairProbs1X2({ home: 2.0, draw: 3.4, away: 3.8 });
    expect(f.home + f.draw + f.away).toBeCloseTo(1, 6);
    // la suma de las inversas crudas (con margen) es > 1
    const raw = 1 / 2.0 + 1 / 3.4 + 1 / 3.8;
    expect(raw).toBeGreaterThan(1);
  });

  it("cuota over baja => total de goles esperado alto", () => {
    const muchosGoles = totalGoalsFromOverUnder({ line: 2.5, over: 1.5, under: 2.6 });
    const pocosGoles = totalGoalsFromOverUnder({ line: 2.5, over: 2.6, under: 1.5 });
    expect(muchosGoles).toBeGreaterThan(pocosGoles);
    expect(muchosGoles).toBeGreaterThan(2.5);
    expect(pocosGoles).toBeLessThan(2.5);
  });

  it("reconstruye lambdas del mercado coherentes con las cuotas", () => {
    // favorito local claro, partido de pocos goles
    const ml = marketLambdas(
      { home: 1.6, draw: 3.8, away: 5.5 },
      { line: 2.5, over: 2.1, under: 1.75 },
    );
    expect(ml.lambdaHome).toBeGreaterThan(ml.lambdaAway);
    expect(ml.lambdaTotal).toBeCloseTo(ml.lambdaHome + ml.lambdaAway, 6);

    // el 1X2 derivado debe favorecer al local, como la cuota
    const r = result1X2(buildScoreMatrix(ml.lambdaHome, ml.lambdaAway, { rho: -0.06 }));
    expect(r.home).toBeGreaterThan(r.away);
  });

  it("el ensamble queda entre el modelo y el mercado", () => {
    const model = { lambdaHome: 1.0, lambdaAway: 1.0 };
    const market = { lambdaHome: 2.0, lambdaAway: 0.5 };
    const blend = blendLambdas(model, market, 0.5);
    expect(blend.lambdaHome).toBeCloseTo(1.5, 6);
    expect(blend.lambdaAway).toBeCloseTo(0.75, 6);
  });

  it("weight=0 ignora el mercado, weight=1 lo adopta del todo", () => {
    const model = { lambdaHome: 1.0, lambdaAway: 1.2 };
    const market = { lambdaHome: 2.0, lambdaAway: 0.5 };
    expect(blendLambdas(model, market, 0).lambdaHome).toBe(1.0);
    expect(blendLambdas(model, market, 1).lambdaHome).toBe(2.0);
  });
});
