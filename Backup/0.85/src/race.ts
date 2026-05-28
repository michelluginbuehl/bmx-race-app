function shuffle(array: any[]) {
  return array
    .map(v => ({ v, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ v }) => v)
}

// gleichmässige Gruppen (kein 1er Heat)
function splitIntoHeats(riders: any[]) {
  const shuffled = shuffle(riders)

  const heats: any[] = []

  const total = shuffled.length
  const maxHeatSize = 8

  const heatCount = Math.ceil(total / maxHeatSize)

  const baseSize = Math.floor(total / heatCount)
  let remainder = total % heatCount

  let index = 0

  for (let i = 0; i < heatCount; i++) {
    let size = baseSize

    if (remainder > 0) {
      size++
      remainder--
    }

    heats.push(shuffled.slice(index, index + size))
    index += size
  }

  return heats
}

// Startplätze 1–8 zufällig
function assignStartPositions(riders: any[]) {
  const positions = [1,2,3,4,5,6,7,8]
  const shuffled = shuffle(riders)

  const used: number[] = []

  return shuffled.map(r => {
    let pos

    do {
      pos = positions[Math.floor(Math.random() * positions.length)]
    } while (used.includes(pos) && used.length < 8)

    used.push(pos)

    return {
      ...r,
      startPos: pos
    }
  })
}

// 🔥 HAUPTFUNKTION (FIXED)
export function generateCategoryHeats(riders: any[]) {
  const grouped: any = {}

  riders.forEach(r => {
    if (!grouped[r.category]) grouped[r.category] = []
    grouped[r.category].push(r)
  })

  const result: any = {}

  Object.keys(grouped).forEach(cat => {
    const ridersCat = grouped[cat]

    // 🔥 JEDE RUNDE NEU MISCHEN
    const runs = [0,1,2].map(() => {
      const heats = splitIntoHeats(ridersCat)

      return heats.map((heat: any[]) =>
        assignStartPositions(heat)
      )
    })

    result[cat] = runs
  })

  return result
}
// 🔥 FINALS GENERIEREN

export function generateFinals(ranking: any[]) {

  const finals: any = {}

  const groups = [

    { name: "A-Final", start: 0, end: 8 },

    { name: "B-Final", start: 8, end: 16 },

    { name: "C-Final", start: 16, end: 24 }

  ]

  groups.forEach(g => {

    const riders = ranking.slice(g.start, g.end)

    if (riders.length === 0) return

    // Gate Pick: bester zuerst

    const assigned = riders.map((r, i) => ({

      ...r,

      startPos: i + 1

    }))

    finals[g.name] = assigned

  })

  return finals

}