// Calendario REAL de la fase de grupos del Mundial 2026 (11–27 jun): los 72
// partidos con su fecha, hora y SEDE oficiales. Cada jornada se reparte en varios
// días (Fecha 1: 11–17 jun · Fecha 2: 18–23 jun · Fecha 3: 24–27 jun), ~4-6
// partidos por día, como el cronograma de FIFA.
//
// Las horas están en HORA DEL ESTE (ET, UTC−4 en junio), que es la referencia del
// fixture oficial; se guardan convertidas a UTC y la UI las re-muestra en ET.
// Local/visitante se conserva como en el seed original para no alterar las
// predicciones (la ventaja de local ya está calibrada sobre esa asignación).
// Idempotente por (home, away, stage): si el partido ya existe, ACTUALIZA fecha y
// sede; si no, lo inserta.

import type Database from "better-sqlite3";

// Código de 3 letras -> nombre usado en la tabla teams (debe coincidir con seed.ts).
const CODE: Record<string, string> = {
  MEX: "México", RSA: "Sudáfrica", KOR: "Corea del Sur", CZE: "Chequia",
  CAN: "Canadá", BIH: "Bosnia y Herzegovina", QAT: "Catar", SUI: "Suiza",
  BRA: "Brasil", MAR: "Marruecos", HAI: "Haití", SCO: "Escocia",
  USA: "USA", PAR: "Paraguay", AUS: "Australia", TUR: "Turquía",
  GER: "Alemania", CUW: "Curazao", CIV: "Costa de Marfil", ECU: "Ecuador",
  NED: "Países Bajos", JPN: "Japón", SWE: "Suecia", TUN: "Túnez",
  BEL: "Bélgica", EGY: "Egipto", IRN: "Irán", NZL: "Nueva Zelanda",
  ESP: "España", CPV: "Cabo Verde", KSA: "Arabia Saudita", URU: "Uruguay",
  FRA: "Francia", SEN: "Senegal", IRQ: "Irak", NOR: "Noruega",
  ARG: "Argentina", ALG: "Argelia", AUT: "Austria", JOR: "Jordania",
  POR: "Portugal", COD: "RD Congo", UZB: "Uzbekistán", COL: "Colombia",
  ENG: "Inglaterra", CRO: "Croacia", GHA: "Ghana", PAN: "Panamá",
};

// [grupo, fecha (YYYY-MM-DD), hora ET (HH:MM), local, visitante, sede]
type Fx = [string, string, string, string, string, string];

const FIXTURES: Fx[] = [
  // ── Fecha 1 (11–17 jun) ─────────────────────────────────────────────
  ["A", "2026-06-11", "15:00", "MEX", "RSA", "Ciudad de México"],
  ["A", "2026-06-11", "21:00", "KOR", "CZE", "Guadalajara"],
  ["D", "2026-06-12", "21:00", "USA", "PAR", "Los Ángeles"],
  ["B", "2026-06-12", "15:00", "CAN", "BIH", "Toronto"],
  ["B", "2026-06-13", "15:00", "QAT", "SUI", "San Francisco"],
  ["C", "2026-06-13", "15:00", "BRA", "MAR", "Nueva York/NJ"],
  ["C", "2026-06-13", "21:00", "HAI", "SCO", "Boston"],
  ["D", "2026-06-13", "00:00", "AUS", "TUR", "Vancouver"],
  ["E", "2026-06-14", "13:00", "GER", "CUW", "Houston"],
  ["E", "2026-06-14", "19:00", "CIV", "ECU", "Filadelfia"],
  ["F", "2026-06-14", "16:00", "NED", "JPN", "Dallas"],
  ["F", "2026-06-14", "21:00", "SWE", "TUN", "Monterrey"],
  ["G", "2026-06-15", "15:00", "BEL", "EGY", "Seattle"],
  ["G", "2026-06-15", "21:00", "IRN", "NZL", "Los Ángeles"],
  ["H", "2026-06-15", "12:00", "ESP", "CPV", "Atlanta"],
  ["H", "2026-06-15", "18:00", "KSA", "URU", "Miami"],
  ["I", "2026-06-16", "15:00", "FRA", "SEN", "Nueva York/NJ"],
  ["I", "2026-06-16", "18:00", "IRQ", "NOR", "Boston"],
  ["J", "2026-06-16", "21:00", "ARG", "ALG", "Kansas City"],
  ["J", "2026-06-17", "00:00", "AUT", "JOR", "San Francisco"],
  ["K", "2026-06-17", "13:00", "POR", "COD", "Houston"],
  ["K", "2026-06-17", "22:00", "UZB", "COL", "Ciudad de México"],
  ["L", "2026-06-17", "16:00", "ENG", "CRO", "Dallas"],
  ["L", "2026-06-17", "19:00", "GHA", "PAN", "Toronto"],
  // ── Fecha 2 (18–23 jun) ─────────────────────────────────────────────
  ["A", "2026-06-18", "12:00", "RSA", "CZE", "Atlanta"],
  ["A", "2026-06-18", "21:00", "MEX", "KOR", "Guadalajara"],
  ["B", "2026-06-18", "15:00", "BIH", "SUI", "Los Ángeles"],
  ["B", "2026-06-18", "21:00", "CAN", "QAT", "Vancouver"],
  ["C", "2026-06-19", "18:00", "MAR", "SCO", "Boston"],
  ["C", "2026-06-19", "21:00", "BRA", "HAI", "Filadelfia"],
  ["D", "2026-06-19", "15:00", "USA", "AUS", "Seattle"],
  ["D", "2026-06-19", "21:00", "PAR", "TUR", "San Francisco"],
  ["E", "2026-06-20", "16:00", "GER", "CIV", "Toronto"],
  ["E", "2026-06-20", "20:00", "CUW", "ECU", "Kansas City"],
  ["F", "2026-06-20", "13:00", "NED", "SWE", "Houston"],
  ["F", "2026-06-21", "00:00", "JPN", "TUN", "Monterrey"],
  ["G", "2026-06-21", "15:00", "BEL", "IRN", "Los Ángeles"],
  ["G", "2026-06-21", "21:00", "EGY", "NZL", "Vancouver"],
  ["H", "2026-06-21", "12:00", "ESP", "KSA", "Atlanta"],
  ["H", "2026-06-21", "18:00", "CPV", "URU", "Miami"],
  ["I", "2026-06-22", "17:00", "FRA", "IRQ", "Filadelfia"],
  ["I", "2026-06-22", "20:00", "SEN", "NOR", "Nueva York/NJ"],
  ["J", "2026-06-22", "13:00", "ARG", "AUT", "Dallas"],
  ["J", "2026-06-22", "23:00", "ALG", "JOR", "San Francisco"],
  ["K", "2026-06-23", "13:00", "POR", "UZB", "Houston"],
  ["K", "2026-06-23", "22:00", "COD", "COL", "Guadalajara"],
  ["L", "2026-06-23", "16:00", "ENG", "GHA", "Boston"],
  ["L", "2026-06-23", "19:00", "CRO", "PAN", "Toronto"],
  // ── Fecha 3 (24–27 jun) — pares simultáneos por grupo ───────────────
  ["A", "2026-06-24", "21:00", "MEX", "CZE", "Ciudad de México"],
  ["A", "2026-06-24", "21:00", "RSA", "KOR", "Monterrey"],
  ["B", "2026-06-24", "21:00", "CAN", "SUI", "Vancouver"],
  ["B", "2026-06-24", "15:00", "BIH", "QAT", "Seattle"],
  ["C", "2026-06-24", "18:00", "BRA", "SCO", "Miami"],
  ["C", "2026-06-24", "18:00", "MAR", "HAI", "Atlanta"],
  ["D", "2026-06-25", "22:00", "USA", "TUR", "Los Ángeles"],
  ["D", "2026-06-25", "22:00", "PAR", "AUS", "San Francisco"],
  ["E", "2026-06-25", "16:00", "GER", "ECU", "Nueva York/NJ"],
  ["E", "2026-06-25", "16:00", "CUW", "CIV", "Filadelfia"],
  ["F", "2026-06-25", "19:00", "NED", "TUN", "Kansas City"],
  ["F", "2026-06-25", "19:00", "JPN", "SWE", "Dallas"],
  ["G", "2026-06-26", "23:00", "BEL", "NZL", "Vancouver"],
  ["G", "2026-06-26", "23:00", "EGY", "IRN", "Seattle"],
  ["H", "2026-06-26", "20:00", "ESP", "URU", "Guadalajara"],
  ["H", "2026-06-26", "20:00", "CPV", "KSA", "Houston"],
  ["I", "2026-06-26", "15:00", "FRA", "NOR", "Boston"],
  ["I", "2026-06-26", "15:00", "SEN", "IRQ", "Toronto"],
  ["J", "2026-06-27", "22:00", "ARG", "JOR", "Dallas"],
  ["J", "2026-06-27", "22:00", "ALG", "AUT", "Kansas City"],
  ["K", "2026-06-27", "19:00", "POR", "COL", "Miami"],
  ["K", "2026-06-27", "19:00", "COD", "UZB", "Atlanta"],
  ["L", "2026-06-27", "17:00", "ENG", "PAN", "Nueva York/NJ"],
  ["L", "2026-06-27", "17:00", "CRO", "GHA", "Filadelfia"],
];

// ET (UTC−4 en junio) -> instante UTC ISO.
function etToUtcIso(date: string, timeET: string): string {
  return new Date(`${date}T${timeET}:00-04:00`).toISOString();
}

export function seedFixtures(db: Database.Database): number {
  const idByName = new Map<string, number>(
    (db.prepare("SELECT id, name FROM teams").all() as { id: number; name: string }[])
      .map((t) => [t.name, t.id]),
  );

  const upd = db.prepare(
    `UPDATE fixtures SET kickoff=@kickoff, venue=@venue
       WHERE home_team_id=@home AND away_team_id=@away AND stage='group'`,
  );
  const ins = db.prepare(
    `INSERT INTO fixtures (home_team_id, away_team_id, kickoff, stage, venue, altitude_m, temp_c, status)
     VALUES (@home, @away, @kickoff, 'group', @venue, NULL, NULL, 'scheduled')`,
  );

  let count = 0;
  const tx = db.transaction(() => {
    for (const [, date, timeET, hc, ac, venue] of FIXTURES) {
      const home = idByName.get(CODE[hc]!);
      const away = idByName.get(CODE[ac]!);
      if (!home || !away) continue; // equipo no sembrado: se salta sin romper
      const kickoff = etToUtcIso(date, timeET);
      const r = upd.run({ home, away, kickoff, venue });
      if (r.changes === 0) { ins.run({ home, away, kickoff, venue }); count++; }
    }
  });
  tx();
  return count;
}
