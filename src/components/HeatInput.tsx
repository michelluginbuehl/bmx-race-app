import React, { useEffect, useMemo, useState } from "react"

type Rider = {
  riderId?: string
  id?: string
  participantId?: string
  masterId?: string
  name: string
  plate: string | number
  club?: string
  category?: string
  birthYear?: number | string
  jahrgang?: number | string
  gender?: string
  geschlecht?: string
  startPos?: number
}

type ResultStatus = "" | "DNF" | "DNS" | "DSQ"

type ResultRow = {
  riderId: string
  participantId?: string
  masterId?: string
  name: string
  plate: string | number
  club?: string
  category?: string
  birthYear?: number | string
  gender?: string
  rank: number
  points: number
  status?: ResultStatus
}

type SaveMeta = {
  confirmed?: boolean
}

type Props = {
  heat: Rider[]
  value?: ResultRow[]
  onSave: (data: ResultRow[], meta?: SaveMeta) => void
  allowUnlimitedSelectedRows?: boolean
}

const ROW_HEIGHT = 30
const BOX_MIN_HEIGHT = 8 * ROW_HEIGHT + 34

export default function HeatInput({ heat, value = [], onSave, allowUnlimitedSelectedRows = false }: Props) {
  const [selected, setSelected] = useState<ResultRow[]>([])
  const [confirmOpen, setConfirmOpen] = useState(false)

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
    softRed: "#fff1f1",
    softOrange: "#fff7e6"
  }

  const getStatusOrder = (status?: ResultStatus) => {
    if (status === "DNF") return 1
    if (status === "DSQ") return 2
    if (status === "DNS") return 3
    return 0
  }

  const normalizeStatus = (status: any): ResultStatus => {
    const normalized = String(status || "").toUpperCase()
    if (normalized === "DNF" || normalized === "DNS" || normalized === "DSQ") return normalized
    return ""
  }

  const rebuildRanks = (arr: ResultRow[]) => {
    const withOriginalIndex = arr.map((r, index) => ({ ...r, _originalIndex: index }))
    const ordered = [...withOriginalIndex].sort((a: any, b: any) => {
      const statusDiff = getStatusOrder(a.status) - getStatusOrder(b.status)
      if (statusDiff !== 0) return statusDiff
      return a._originalIndex - b._originalIndex
    })

    let finishRank = 1
    return ordered.map((r: any, index) => {
      const status = normalizeStatus(r.status)
      const rank = index + 1
      let points = rank

      if (status === "") {
        points = finishRank
        finishRank += 1
      } else if (status === "DNF") {
        points = 10
      } else if (status === "DNS") {
        points = 10
      } else {
        points = 0
      }

      const { _originalIndex, ...clean } = r
      return {
        ...clean,
        status,
        rank,
        points
      }
    })
  }

  useEffect(() => {
    const normalized: ResultRow[] = (value || []).map((r: any, index: number) => ({
      riderId: String(r.riderId ?? r.id ?? ""),
      participantId: r.participantId ? String(r.participantId) : undefined,
      masterId: r.masterId ? String(r.masterId) : undefined,
      name: r.name,
      plate: r.plate,
      club: r.club || "",
      category: r.category || "",
      birthYear: r.birthYear || r.jahrgang || "",
      gender: r.gender || r.geschlecht || "",
      rank: r.rank ?? index + 1,
      points: r.points ?? index + 1,
      status: normalizeStatus(r.status)
    }))

    setSelected(rebuildRanks(normalized))
  }, [value])

  const selectedIds = useMemo(() => {
    return new Set(selected.map(r => String(r.riderId)))
  }, [selected])

  const normalizeRider = (r: Rider): Omit<ResultRow, "rank" | "points" | "status"> => ({
    riderId: String(r.riderId ?? r.id ?? ""),
    participantId: r.participantId ? String(r.participantId) : undefined,
    masterId: r.masterId ? String(r.masterId) : undefined,
    name: r.name,
    plate: r.plate,
    club: r.club || "",
    category: r.category || "",
    birthYear: r.birthYear || r.jahrgang || "",
    gender: r.gender || r.geschlecht || ""
  })

  const applyChange = (next: ResultRow[], options: { openConfirmation?: boolean; persistPartial?: boolean } = {}) => {
    const updated = rebuildRanks(next)
    setSelected(updated)

    const isComplete = heat.length > 0 && updated.length >= heat.length
    if (isComplete) {
      if (options.openConfirmation !== false) setConfirmOpen(true)
      return updated
    }

    setConfirmOpen(false)
    if (options.persistPartial !== false) onSave(updated, { confirmed: false })
    return updated
  }

  const addRider = (r: Rider) => {
    const rider = normalizeRider(r)
    if (!rider.riderId) return
    if (selectedIds.has(rider.riderId)) return

    applyChange([
      ...selected,
      {
        ...rider,
        rank: selected.length + 1,
        points: selected.length + 1,
        status: ""
      }
    ])
  }

  const removeRider = (index: number) => {
    applyChange(selected.filter((_, i) => i !== index))
  }

  const moveRider = (index: number, dir: number, inModal = false) => {
    const newIndex = index + dir
    if (newIndex < 0 || newIndex >= selected.length) return
    const copy = [...selected]
    ;[copy[index], copy[newIndex]] = [copy[newIndex], copy[index]]
    const updated = rebuildRanks(copy)
    setSelected(updated)
    if (!inModal && updated.length < heat.length) {
      onSave(updated, { confirmed: false })
    } else if (!inModal && updated.length >= heat.length) {
      setConfirmOpen(true)
    }
  }

  const setStatus = (index: number, status: ResultStatus, inModal = false) => {
    const copy = [...selected]
    const current = normalizeStatus(copy[index]?.status)
    copy[index] = { ...copy[index], status: current === status ? "" : status }
    const updated = rebuildRanks(copy)
    setSelected(updated)
    if (!inModal && updated.length < heat.length) {
      onSave(updated, { confirmed: false })
    } else if (!inModal && updated.length >= heat.length) {
      setConfirmOpen(true)
    }
  }

  const confirmResult = () => {
    const confirmed = rebuildRanks(selected)
    if (heat.length > 0 && confirmed.length < heat.length) return
    setSelected(confirmed)
    setConfirmOpen(false)
    onSave(confirmed, { confirmed: true })
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
    height: allowUnlimitedSelectedRows ? "auto" : BOX_MIN_HEIGHT
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

  const statusButtonStyle = (active: boolean): React.CSSProperties => ({
    ...smallButtonStyle,
    background: active ? colors.softOrange : "#f7f9fb",
    color: active ? "#9a5b00" : "#52606d",
    border: active ? "1px solid #f2b85c" : "1px solid #d8e0e6",
    fontSize: 11,
    padding: "5px 6px"
  })

  const saveButtonStyle: React.CSSProperties = {
    background: colors.greenBtn,
    color: colors.greenBtnText,
    border: "none",
    borderRadius: 8,
    padding: "10px 14px",
    cursor: "pointer",
    fontWeight: 700
  }

  const renderResultRows = (
    items: any[],
    renderItem: (item: any, index: number) => React.ReactNode
  ) => {
    const rowCount = allowUnlimitedSelectedRows ? Math.max(items.length, 1) : 8
    return Array.from({ length: rowCount }).map((_, index) => (
      <div key={index} style={allowUnlimitedSelectedRows ? { ...fixedRowStyle, height: "auto", minHeight: ROW_HEIGHT + 4 } : fixedRowStyle}>
        {items[index] ? renderItem(items[index], index) : <span style={{ color: "#999" }}>-</span>}
      </div>
    ))
  }

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ marginBottom: 10 }}>
        <strong style={{ color: colors.title }}>Zieleinlauf erfassen</strong>
        <div style={{ marginTop: 4, fontSize: 12, color: "#667085" }}>
          DNF = 10 Rangpunkte. DNS wird in einem einzelnen Moto ebenfalls mit 10 Rangpunkten gewertet; nur 3× DNS schliesst den Fahrer aus der Vorlauf-Rangliste aus.
        </div>
      </div>

      <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
        <div style={{ width: "50%", ...panelStyle }}>
          <div style={{ marginBottom: 8, fontWeight: 700, color: colors.title }}>Ausgewählt</div>

          <div style={listBoxStyle}>
            {renderResultRows(selected, (r, i) => (
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
                    gridTemplateColumns: "34px 70px minmax(110px, 1fr) 44px minmax(70px, 0.7fr)",
                    gap: 8,
                    alignItems: "center",
                    overflow: "hidden"
                  }}
                >
                  <span>{r.status ? r.status : `${i + 1}.`}</span>
                  <span style={{ fontWeight: 900 }}>#{r.plate}</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                  <span style={{ fontWeight: 800, color: r.status ? "#9a5b00" : "#667085" }}>{r.status || ""}</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.club || "-"}</span>
                </div>

                <div style={{ flexShrink: 0, display: "flex", gap: 4, alignItems: "center" }}>
                  <button type="button" onClick={() => setStatus(i, "DNF")} style={statusButtonStyle(r.status === "DNF")}>DNF</button>
                  <button type="button" onClick={() => setStatus(i, "DNS")} style={statusButtonStyle(r.status === "DNS")}>DNS</button>
                  <button type="button" onClick={() => setStatus(i, "DSQ")} style={statusButtonStyle(r.status === "DSQ")}>DSQ</button>
                  <button
                    type="button"
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
                    type="button"
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
                    type="button"
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
            <button
              type="button"
              onClick={() => {
                if (heat.length > 0 && selected.length >= heat.length) {
                  setConfirmOpen(true)
                } else {
                  onSave(rebuildRanks(selected), { confirmed: false })
                }
              }}
              style={saveButtonStyle}
            >
              {heat.length > 0 && selected.length >= heat.length ? "Reihenfolge prüfen" : "Zwischenspeichern"}
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
                  type="button"
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
                  <span style={{ fontSize: 14, lineHeight: 1.15, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.name}
                  </span>
                  <span style={{ fontSize: 12, lineHeight: 1.15, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", opacity: 0.85 }}>
                    {r.club || "-"}
                  </span>
                  {isSelected && <span style={{ fontSize: 11, lineHeight: 1, fontWeight: 800 }}>gewählt</span>}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {confirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Zieleinlauf bestätigen"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2000,
            background: "rgba(15, 23, 42, 0.58)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 18
          }}
        >
          <div
            style={{
              width: "min(760px, 96vw)",
              maxHeight: "90vh",
              overflowY: "auto",
              borderRadius: 20,
              background: "#fff",
              border: "1px solid #d8e0e6",
              boxShadow: "0 24px 80px rgba(15,23,42,0.28)",
              padding: 18
            }}
          >
            <h2 style={{ margin: "0 0 6px", color: colors.title }}>Zieleinlauf bestätigen</h2>
            <div style={{ color: "#667085", marginBottom: 14, fontWeight: 700 }}>
              Bitte Reihenfolge und Status kontrollieren. Erst mit „Reihenfolge stimmt“ wird der Lauf abgeschlossen und zum nächsten Lauf gewechselt.
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              {selected.map((r, index) => (
                <div
                  key={r.riderId}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "48px 82px minmax(150px, 1fr) auto",
                    gap: 8,
                    alignItems: "center",
                    padding: 10,
                    borderRadius: 12,
                    border: "1px solid #d8e0e6",
                    background: r.status ? "#fffaf0" : "#f8fbff"
                  }}
                >
                  <strong style={{ fontSize: 18 }}>{r.status || `${index + 1}.`}</strong>
                  <strong>#{r.plate}</strong>
                  <div>
                    <div style={{ fontWeight: 800, color: colors.title }}>{r.name}</div>
                    <div style={{ fontSize: 12, color: "#667085" }}>{r.club || "-"}</div>
                  </div>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <button type="button" onClick={() => setStatus(index, "DNF", true)} style={statusButtonStyle(r.status === "DNF")}>DNF</button>
                    <button type="button" onClick={() => setStatus(index, "DNS", true)} style={statusButtonStyle(r.status === "DNS")}>DNS</button>
                    <button type="button" onClick={() => setStatus(index, "DSQ", true)} style={statusButtonStyle(r.status === "DSQ")}>DSQ</button>
                    <button
                      type="button"
                      onClick={() => moveRider(index, -1, true)}
                      disabled={index === 0}
                      style={{ ...smallButtonStyle, background: colors.softBlue, color: colors.blueBtn, opacity: index === 0 ? 0.4 : 1 }}
                    >
                      ⬆
                    </button>
                    <button
                      type="button"
                      onClick={() => moveRider(index, 1, true)}
                      disabled={index === selected.length - 1}
                      style={{ ...smallButtonStyle, background: colors.softBlue, color: colors.blueBtn, opacity: index === selected.length - 1 ? 0.4 : 1 }}
                    >
                      ⬇
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 16, display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button type="button" onClick={() => setConfirmOpen(false)} style={{ ...smallButtonStyle, padding: "11px 16px", background: "#e9eef3", color: "#23303b" }}>
                Zurück
              </button>
              <button type="button" onClick={confirmResult} style={{ ...saveButtonStyle, padding: "11px 18px", fontSize: 15 }}>
                Reihenfolge stimmt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
