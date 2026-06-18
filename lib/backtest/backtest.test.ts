import { describe, it, expect } from "vitest";
import { runBacktest } from "./run.js";
import { QATAR_GROUP_MATCHES } from "./qatar2022.js";
import { EURO_GROUP_MATCHES, EURO_RATINGS, HOST_EURO } from "./euro2024.js";
import { WC2018_GROUP_MATCHES, WC2018_RATINGS, HOST_2018 } from "./wc2018.js";

describe("backtest Qatar 2022", () => {
  const r = runBacktest();

  it("cubre los 48 partidos de grupo", () => {
    expect(QATAR_GROUP_MATCHES).toHaveLength(48);
    expect(r.matches).toBe(48);
  });

  it("supera el umbral de calibración en 1X2 (~50%)", () => {
    expect(r.rate1X2).toBeGreaterThanOrEqual(0.5);
  });

  // Tras recalibrar para marcador exacto (rho≈-0.05, nu=1.10, regla=moda),
  // validado sobre 2039 partidos reales y 3 torneos (16.7% agregado). En una
  // muestra de 48 partidos el exacto es ruidoso (±1 acierto ≈ 2pts): el guard
  // fuerte es el AGREGADO de los 3 torneos, abajo.
  it("supera el umbral de calibración en marcador exacto", () => {
    expect(r.rateExact).toBeGreaterThanOrEqual(0.08);
  });

  it("toda métrica está en rango válido", () => {
    expect(r.rate1X2).toBeLessThanOrEqual(1);
    expect(r.rateExact).toBeLessThanOrEqual(1);
    expect(r.pollaPoints).toBeGreaterThan(0);
    expect(r.pollaPoints).toBeLessThanOrEqual(r.pollaMax);
  });
});

describe("backtest Euro 2024", () => {
  const r = runBacktest(EURO_GROUP_MATCHES, EURO_RATINGS, HOST_EURO);

  it("cubre los 36 partidos de grupo", () => {
    expect(EURO_GROUP_MATCHES).toHaveLength(36);
    expect(r.matches).toBe(36);
  });

  // Euro 2024 fue récord en empates/sorpresas: el 1X2 baja, pero el exacto sube.
  it("1X2 razonable pese al caos del torneo (>=45%)", () => {
    expect(r.rate1X2).toBeGreaterThanOrEqual(0.45);
  });

  it("supera con holgura el umbral de marcador exacto", () => {
    expect(r.rateExact).toBeGreaterThanOrEqual(0.09);
  });
});

describe("backtest Rusia 2018", () => {
  const r = runBacktest(WC2018_GROUP_MATCHES, WC2018_RATINGS, HOST_2018);

  it("cubre los 48 partidos de grupo", () => {
    expect(WC2018_GROUP_MATCHES).toHaveLength(48);
    expect(r.matches).toBe(48);
  });

  it("supera ambos umbrales", () => {
    expect(r.rate1X2).toBeGreaterThanOrEqual(0.5);
    expect(r.rateExact).toBeGreaterThanOrEqual(0.09);
  });
});

describe("backtest agregado (3 torneos, 132 partidos)", () => {
  const all = [
    runBacktest(),
    runBacktest(EURO_GROUP_MATCHES, EURO_RATINGS, HOST_EURO),
    runBacktest(WC2018_GROUP_MATCHES, WC2018_RATINGS, HOST_2018),
  ];
  const n = all.reduce((s, r) => s + r.matches, 0);
  const hit1X2 = all.reduce((s, r) => s + r.hit1X2, 0);
  const hitExact = all.reduce((s, r) => s + r.hitExact, 0);

  it("agrega 132 partidos", () => {
    expect(n).toBe(132);
  });

  // Meta del proyecto: 1X2 >= 53-54%. Medido sobre 3 torneos.
  it("el 1X2 agregado alcanza la meta de 53-54%", () => {
    expect(hit1X2 / n).toBeGreaterThanOrEqual(0.53);
  });

  it("el marcador exacto supera con holgura su umbral", () => {
    expect(hitExact / n).toBeGreaterThanOrEqual(0.1);
  });

  // Puntos de polla con el pick EV. Al recalibrar el modelo para MARCADOR EXACTO
  // (objetivo del proyecto) se cede ~2% de puntos de polla (240→234): trade-off
  // aceptado a cambio de subir el acierto exacto agregado de 15.2% a 16.7%.
  it("mantiene un nivel razonable de puntos de polla", () => {
    const polla = all.reduce((s, r) => s + r.pollaPoints, 0);
    expect(polla).toBeGreaterThanOrEqual(230);
  });
});
