import { Rider } from "../types"

export function generateMotos(riders: Rider[]) {
  const shuffled = [...riders].sort(() => Math.random() - 0.5)

  const heats: any[] = []
  const size = 8

  for (let i = 0; i < shuffled.length; i += size) {
    heats.push({
      id: i,
      riders: shuffled.slice(i, i + size).map(r => ({
        ...r,
        result: null
      }))
    })
  }

  return heats
}