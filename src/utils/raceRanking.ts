export const normalizeRaceStatus = (value: any) =>
  String(value || "").trim().toUpperCase();

export const hasDnsInAllThreePreliminaryMotos = (runs: Record<string | number, any> = {}) =>
  [0, 1, 2].every((runIndex) => normalizeRaceStatus(runs?.[runIndex]) === "DNS");

export const shouldIncludePreliminaryRankingRow = (runs: Record<string | number, any> = {}) =>
  !hasDnsInAllThreePreliminaryMotos(runs);
