export default function HeatView({ heat, onUpdate }: any) {
  const setResult = (rider: any) => {
    if (rider.result !== null) return

    const next = heat.riders.filter((r: any) => r.result !== null).length + 1

    rider.result = next
    onUpdate()
  }

  return (
    <div style={{ marginTop: 20 }}>
      <h3>Heat</h3>

      {heat.riders.map((r: any) => (
        <button
          key={r.id}
          onClick={() => setResult(r)}
          style={{
            display: "block",
            margin: 5,
            padding: 10
          }}
        >
          #{r.plate} {r.name} → {r.result ?? "-"}
        </button>
      ))}
    </div>
  )
}