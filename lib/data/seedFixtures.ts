// Calendario REAL de la fase de grupos del Mundial 2026: los 72 partidos con su
// fecha, hora y jornada exactas. No se inventan sedes (no son públicas aún), así
// que la predicción usa rating + ventaja de anfitrión, sin ajuste de altitud.
// Idempotente por (home, away, stage).

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

// [grupo, fecha (YYYY-MM-DD), hora (HH:MM), local, visitante]
type Fx = [string, string, string, string, string];

const FIXTURES: Fx[] = [
  // Jornada 1
  ["A", "2026-06-11", "00:00", "MEX", "RSA"], ["A", "2026-06-11", "03:00", "KOR", "CZE"],
  ["I", "2026-06-11", "00:00", "FRA", "SEN"], ["I", "2026-06-11", "03:00", "IRQ", "NOR"],
  ["B", "2026-06-11", "03:00", "CAN", "BIH"], ["B", "2026-06-11", "06:00", "QAT", "SUI"],
  ["J", "2026-06-11", "03:00", "ARG", "ALG"], ["J", "2026-06-11", "06:00", "AUT", "JOR"],
  ["C", "2026-06-11", "06:00", "BRA", "MAR"], ["C", "2026-06-11", "09:00", "HAI", "SCO"],
  ["K", "2026-06-11", "06:00", "POR", "COD"], ["K", "2026-06-11", "09:00", "UZB", "COL"],
  ["D", "2026-06-11", "09:00", "USA", "PAR"], ["D", "2026-06-11", "12:00", "AUS", "TUR"],
  ["L", "2026-06-11", "09:00", "ENG", "CRO"], ["L", "2026-06-11", "12:00", "GHA", "PAN"],
  ["E", "2026-06-11", "12:00", "GER", "CUW"], ["E", "2026-06-11", "15:00", "CIV", "ECU"],
  ["F", "2026-06-11", "15:00", "NED", "JPN"], ["F", "2026-06-11", "18:00", "SWE", "TUN"],
  ["G", "2026-06-11", "18:00", "BEL", "EGY"], ["G", "2026-06-11", "21:00", "IRN", "NZL"],
  ["H", "2026-06-11", "21:00", "ESP", "CPV"], ["H", "2026-06-12", "00:00", "KSA", "URU"],
  // Jornada 2
  ["A", "2026-06-18", "00:00", "MEX", "KOR"], ["A", "2026-06-18", "03:00", "RSA", "CZE"],
  ["B", "2026-06-18", "03:00", "CAN", "QAT"], ["B", "2026-06-18", "06:00", "BIH", "SUI"],
  ["I", "2026-06-18", "03:00", "FRA", "IRQ"], ["I", "2026-06-18", "06:00", "SEN", "NOR"],
  ["C", "2026-06-18", "06:00", "BRA", "HAI"], ["C", "2026-06-18", "09:00", "MAR", "SCO"],
  ["J", "2026-06-18", "06:00", "ARG", "AUT"], ["J", "2026-06-18", "09:00", "ALG", "JOR"],
  ["D", "2026-06-18", "09:00", "USA", "AUS"], ["D", "2026-06-18", "12:00", "PAR", "TUR"],
  ["K", "2026-06-18", "09:00", "POR", "UZB"], ["K", "2026-06-18", "12:00", "COD", "COL"],
  ["E", "2026-06-18", "12:00", "GER", "CIV"], ["E", "2026-06-18", "15:00", "CUW", "ECU"],
  ["L", "2026-06-18", "12:00", "ENG", "GHA"], ["L", "2026-06-18", "15:00", "CRO", "PAN"],
  ["F", "2026-06-18", "15:00", "NED", "SWE"], ["F", "2026-06-18", "18:00", "JPN", "TUN"],
  ["G", "2026-06-18", "18:00", "BEL", "IRN"], ["G", "2026-06-18", "21:00", "EGY", "NZL"],
  ["H", "2026-06-18", "21:00", "ESP", "KSA"], ["H", "2026-06-19", "00:00", "CPV", "URU"],
  // Jornada 3
  ["A", "2026-06-25", "00:00", "MEX", "CZE"], ["A", "2026-06-25", "00:00", "RSA", "KOR"],
  ["I", "2026-06-25", "00:00", "FRA", "NOR"], ["I", "2026-06-25", "00:00", "SEN", "IRQ"],
  ["B", "2026-06-25", "03:00", "CAN", "SUI"], ["B", "2026-06-25", "03:00", "BIH", "QAT"],
  ["J", "2026-06-25", "03:00", "ARG", "JOR"], ["J", "2026-06-25", "03:00", "ALG", "AUT"],
  ["C", "2026-06-25", "06:00", "BRA", "SCO"], ["C", "2026-06-25", "06:00", "MAR", "HAI"],
  ["K", "2026-06-25", "06:00", "POR", "COL"], ["K", "2026-06-25", "06:00", "COD", "UZB"],
  ["D", "2026-06-25", "09:00", "USA", "TUR"], ["D", "2026-06-25", "09:00", "PAR", "AUS"],
  ["L", "2026-06-25", "09:00", "ENG", "PAN"], ["L", "2026-06-25", "09:00", "CRO", "GHA"],
  ["E", "2026-06-25", "12:00", "GER", "ECU"], ["E", "2026-06-25", "12:00", "CUW", "CIV"],
  ["F", "2026-06-25", "15:00", "NED", "TUN"], ["F", "2026-06-25", "15:00", "JPN", "SWE"],
  ["G", "2026-06-25", "18:00", "BEL", "NZL"], ["G", "2026-06-25", "18:00", "EGY", "IRN"],
  ["H", "2026-06-25", "21:00", "ESP", "URU"], ["H", "2026-06-25", "21:00", "CPV", "KSA"],
];

export function seedFixtures(db: Database.Database): number {
  const idByName = new Map<string, number>(
    (db.prepare("SELECT id, name FROM teams").all() as { id: number; name: string }[])
      .map((t) => [t.name, t.id]),
  );

  const insert = db.prepare(
    `INSERT INTO fixtures (home_team_id, away_team_id, kickoff, stage, venue, altitude_m, temp_c, status)
     SELECT @home, @away, @kickoff, 'group', NULL, NULL, NULL, 'scheduled'
     WHERE NOT EXISTS (
       SELECT 1 FROM fixtures WHERE home_team_id=@home AND away_team_id=@away AND stage='group'
     )`,
  );

  let count = 0;
  const tx = db.transaction(() => {
    for (const [, date, time, hc, ac] of FIXTURES) {
      const home = idByName.get(CODE[hc]!);
      const away = idByName.get(CODE[ac]!);
      if (!home || !away) continue; // equipo no sembrado: se salta sin romper
      const kickoff = `${date}T${time}:00.000Z`;
      count += insert.run({ home, away, kickoff }).changes;
    }
  });
  tx();
  return count;
}
