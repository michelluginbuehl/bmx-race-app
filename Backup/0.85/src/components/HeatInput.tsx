import React, { useEffect, useMemo, useState } from "react"

type Rider = {
  riderId?: string
  id?: string
  name: string
  plate: string | number
  club?: string
  startPos?: number
}

type ResultRow = {
  riderId: string
  name: string
  plate: string | number
  club?: string
  rank: number
  points: number
}

type Props = {
  heat: Rider[]
  value?: ResultRow[]
  onSave: (data: ResultRow[]) => void
}

const ROW_HEIGHT = 30
const BOX_MIN_HEIGHT = 8 * ROW_HEIGHT + 34

export default function HeatInput({ heat, value = [], onSave }: Props) {
  const [selected, setSelected] = useState<ResultRow[]>([])

  const colors = {
    cardBg: "#ffffff",
    cardBorder: "#d8e0e6",
    title: "#1f2a37",
    greenBtn: "#2fa84f",
    greenBtnText: "#ffffff",
    blueBtn: "#2d6cdf",
    redBtn: "#d64545",
    softBlue: "#eef4ff",
    softGreen: "#eefaf1",
    softRed: "#fff1f1"
  }

  useEffect(() => {
    const normalized: ResultRow[] = (value || []).map((r: any, index: number) => ({
      riderId: String(r.riderId ?? r.id ?? ""),
      name: r.name,
      plate: r.plate,
      club: r.club || "",
      rank: r.rank ?? index + 1,
      points: r.points ?? index + 1
    }))

    setSelected(normalized)
  }, [value])

  const selectedIds = useMemo(() => {
    return new Set(selected.map(r => String(r.riderId)))
  }, [selected])

  const rebuildRanks = (arr: ResultRow[]) => {
    return arr.map((r, index) => ({
      ...r,
      rank: index + 1,
      points: index + 1
    }))
  }

  const normalizeRider = (r: Rider) => ({
    riderId: String(r.riderId ?? r.id ?? ""),
    name: r.name,
    plate: r.plate,
    club: r.club || ""
  })

  const addRider = (r: Rider) => {
    const rider = normalizeRider(r)
    if (!rider.riderId) return
    if (selectedIds.has(rider.riderId)) return

    const updated = rebuildRanks([
      ...selected,
      {
        riderId: rider.riderId,
        name: rider.name,
        plate: rider.plate,
        club: rider.club,
        rank: selected.length + 1,
        points: selected.length + 1
      }
    ])

    setSelected(updated)
    onSave(updated)
  }

  const removeRider = (index: number) => {
    const updated = rebuildRanks(selected.filter((_, i) => i !== index))
    setSelected(updated)
    onSave(updated)
  }

  const moveRider = (index: number, dir: number) => {
    const newIndex = index + dir
    if (newIndex < 0 || newIndex >= selected.length) return

    const copy = [...selected]
    ;[copy[index], copy[newIndex]] = [copy[newIndex], copy[index]]

    const updated = rebuildRanks(copy)
    setSelected(updated)
    onSave(updated)
  }

  const fixedRowStyle: React.CSSProperties = {
    minHeight: ROW_HEIGHT,
    height: ROW_HEIGHT,
    display: "flex",
    alignItems: "center",
    overflow: "hidden"
  }

  const panelStyle: React.CSSProperties = {
    border: `1px solid ${colors.cardBorder}`,
    borderRadius: 10,
    background: colors.cardBg,
    padding: 10,
    boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
  }

  const listBoxStyle: React.CSSProperties = {
    minHeight: BOX_MIN_HEIGHT,
    height: BOX_MIN_HEIGHT
  }

  const availableGridStyle: React.CSSProperties = {
    minHeight: BOX_MIN_HEIGHT,
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gridAutoRows: "86px",
    gap: 10,
    alignContent: "start"
  }
  const smallButtonStyle: React.CSSProperties = {
    border: "none",
    borderRadius: 6,
    padding: "5px 8px",
    cursor: "pointer",
    fontWeight: 700
  }

  const saveButtonStyle: React.CSSProperties = {
    background: colors.greenBtn,
    color: colors.greenBtnText,
    border: "none",
    borderRadius: 8,
    padding: "10px 14px",
    cursor: "pointer",
    fontWeight: 700
  }

  const renderEightRows = (
    items: any[],
    renderItem: (item: any, index: number) => React.ReactNode
  ) => {
    return Array.from({ length: 8 }).map((_, index) => (
      <div key={index} style={fixedRowStyle}>
        {items[index] ? renderItem(items[index], index) : <span style={{ color: "#999" }}>-</span>}
      </div>
    ))
  }

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ marginBottom: 10 }}>
        <strong style={{ color: colors.title }}>Zieleinlauf erfassen</strong>
      </div>

      <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
        <div style={{ width: "50%", ...panelStyle }}>
          <div style={{ marginBottom: 8, fontWeight: 700, color: colors.title }}>Ausgewählt</div>

          <div style={listBoxStyle}>
            {renderEightRows(selected, (r, i) => (
              <div
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 6
                }}
              >
                <div
                  style={{
                    flex: 1,
                    display: "grid",
                    gridTemplateColumns: "34px 70px minmax(120px, 1fr) minmax(90px, 0.8fr)",
                    gap: 8,
                    alignItems: "center",
                    overflow: "hidden"
                  }}
                >
                  <span>{i + 1}.</span>
                  <span style={{ fontWeight: 900 }}>#{r.plate}</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.club || "-"}</span>
                </div>

                <div style={{ flexShrink: 0, display: "flex", gap: 4 }}>
                  <button
                    onClick={() => moveRider(i, -1)}
                    style={{
                      ...smallButtonStyle,
                      background: colors.softBlue,
                      color: colors.blueBtn,
                      border: `1px solid #bfd2ff`
                    }}
                  >
                    ⬆
                  </button>
                  <button
                    onClick={() => moveRider(i, 1)}
                    style={{
                      ...smallButtonStyle,
                      background: colors.softBlue,
                      color: colors.blueBtn,
                      border: `1px solid #bfd2ff`
                    }}
                  >
                    ⬇
                  </button>
                  <button
                    onClick={() => removeRider(i)}
                    style={{
                      ...smallButtonStyle,
                      background: colors.softRed,
                      color: colors.redBtn,
                      border: `1px solid #f2bcbc`
                    }}
                  >
                    ❌
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 10 }}>
            <button onClick={() => onSave(selected)} style={saveButtonStyle}>
              Speichern
            </button>
          </div>
        </div>

        <div style={{ width: "50%", ...panelStyle }}>
          <div style={{ marginBottom: 8, fontWeight: 700, color: colors.title }}>Zum Anklicken</div>

          <div style={availableGridStyle}>
            {(heat || []).map((r, index) => {
              const riderId = String(r.riderId ?? r.id ?? "")
              const isSelected = selectedIds.has(riderId)

              return (
                <button
                  key={riderId || `slot-${index}`}
                  onClick={() => addRider(r)}
                  disabled={isSelected}
                  style={{
                    width: "100%",
                    minHeight: 86,
                    borderRadius: 12,
                    border: isSelected ? "2px solid #cfd8e3" : "2px solid #b8d8c0",
                    background: isSelected ? "#f1f4f7" : colors.softGreen,
                    color: isSelected ? "#8a96a3" : "#216c36",
                    cursor: isSelected ? "default" : "pointer",
                    fontWeight: 700,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    padding: "8px 6px",
                    touchAction: "manipulation",
                    boxShadow: isSelected ? "none" : "0 1px 3px rgba(0,0,0,0.08)",
                    opacity: isSelected ? 0.72 : 1
                  }}
                >
                  <span style={{ fontSize: 26, lineHeight: 1, fontWeight: 900 }}>#{r.plate}</span>
                  <span
                    style={{
                      fontSize: 14,
                      lineHeight: 1.15,
                      maxWidth: "100%",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap"
                    }}
                  >
                    {r.name}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      lineHeight: 1.15,
                      maxWidth: "100%",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      opacity: 0.85
                    }}
                  >
                    {r.club || "-"}
                  </span>
                  {isSelected && (
                    <span style={{ fontSize: 11, lineHeight: 1, fontWeight: 800 }}>gewählt</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}