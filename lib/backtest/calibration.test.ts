import { describe, it, expect } from "vitest";
import { calibration, type CalibrationPoint } from "./calibration.js";

describe("calibración", () => {
  it("modelo perfecto (prob 1 al resultado real) => Brier 0", () => {
    const pts: CalibrationPoint[] = [
      { probs: { home: 1, draw: 0, away: 0 }, realOutcome: "home" },
      { probs: { home: 0, draw: 1, away: 0 }, realOutcome: "draw" },
    ];
    expect(calibration(pts).brier).toBeCloseTo(0, 6);
  });

  it("detecta sobreestimación de empates", () => {
    // el modelo da 40% a empate pero nunca empatan: sesgo positivo grande.
    const pts: CalibrationPoint[] = Array.from({ length: 10 }, () => ({
      probs: { home: 0.4, draw: 0.4, away: 0.2 },
      realOutcome: "home" as const,
    }));
    const c = calibration(pts);
    expect(c.meanDrawProb).toBeCloseTo(0.4, 6);
    expect(c.drawRate).toBeCloseTo(0, 6);
    expect(c.drawBias).toBeGreaterThan(0.3);
  });

  it("Brier del azar uniforme 1X2 ≈ 0.2222", () => {
    const pts: CalibrationPoint[] = [
      { probs: { home: 1 / 3, draw: 1 / 3, away: 1 / 3 }, realOutcome: "home" },
      { probs: { home: 1 / 3, draw: 1 / 3, away: 1 / 3 }, realOutcome: "draw" },
      { probs: { home: 1 / 3, draw: 1 / 3, away: 1 / 3 }, realOutcome: "away" },
    ];
    expect(calibration(pts).brier).toBeCloseTo(0.2222, 3);
  });

  it("las predicciones caen en el bin correcto", () => {
    const pts: CalibrationPoint[] = [{ probs: { home: 0.85, draw: 0.1, away: 0.05 }, realOutcome: "home" }];
    const c = calibration(pts, 10);
    const bin = c.bins.find((b) => b.lo === 0.8)!;
    expect(bin.count).toBe(1); // el 0.85 cae en [0.8,0.9)
    expect(bin.observed).toBe(1); // y ocurrió
  });
});
