export default function RankingView({ ranking }: any) {
  return (
    <div style={{ marginTop: 30 }}>
      <h2>Rangliste</h2>

      {ranking.map((r: any, i: number) => (
        <div key={i}>
          {i + 1}. {r.name} – {r.total}
        </div>
      ))}
    </div>
  )
}