export function getPoints(rank: number) {
  if (rank === 1) return 75
  if (rank === 2) return 70
  if (rank === 3) return 65
  if (rank === 4) return 63
  if (rank === 5) return 62
  if (rank === 6) return 61
  return 60 - (rank - 7)
}