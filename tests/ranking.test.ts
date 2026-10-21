import { describe, expect, it } from "vitest";
import {
  hasDnsInAllThreePreliminaryMotos,
  shouldIncludePreliminaryRankingRow,
} from "../src/utils/raceRanking";

describe("preliminary DNS ranking rules", () => {
  it("excludes a rider only when all three motos are DNS", () => {
    expect(hasDnsInAllThreePreliminaryMotos({ 0: "DNS", 1: "DNS", 2: "DNS" })).toBe(true);
    expect(shouldIncludePreliminaryRankingRow({ 0: "DNS", 1: "DNS", 2: "DNS" })).toBe(false);
  });

  it("keeps DNF + DNS + DNS in the ranking", () => {
    expect(hasDnsInAllThreePreliminaryMotos({ 0: "DNF", 1: "DNS", 2: "DNS" })).toBe(false);
    expect(shouldIncludePreliminaryRankingRow({ 0: "DNF", 1: "DNS", 2: "DNS" })).toBe(true);
  });

  it("keeps riders who started or have an unfinished set of motos", () => {
    expect(shouldIncludePreliminaryRankingRow({ 0: 4, 1: "DNS", 2: "DNF" })).toBe(true);
    expect(shouldIncludePreliminaryRankingRow({ 0: "DNS" })).toBe(true);
  });
});
