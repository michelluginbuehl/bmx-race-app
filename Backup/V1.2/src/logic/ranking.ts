export function calculateRanking(heats: any[]) {
  const points: Record<string, number> = {}

  heats.forEach(h => {
    h.riders.forEach((r: any) => {
      if (r.result === null) return
      points[r.name] = (points[r.name] || 0) + r.result
    })
  })

  return Object.entries(points)
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => a.total - b.total)
}