import React from 'react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts'

function urgencyColor(ttf) {
  if (ttf < 10) return '#da3633'
  if (ttf < 25) return '#fb8500'
  if (ttf < 45) return '#d29922'
  return '#2ea043'
}

export default function TTFPanel({ ttfData }) {
  const spans = Object.keys(ttfData || {})

  return (
    <div className="card p-4 h-full fade-in overflow-y-auto">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-display text-lg">Time to Failure</h3>
        <span className="text-xs text-slate-400">Prediction + CI</span>
      </div>

      <div className="space-y-3 max-h-80 pr-1">
        {spans.map((span) => {
          const rec = ttfData[span]
          const trend = (rec.trend_history || []).map((y, i) => ({ day: i + 1, y }))
          const color = urgencyColor(rec.TTF_days)
          return (
            <div key={span} className="border border-line rounded p-3">
              <div className="flex items-center justify-between text-sm">
                <div className="font-semibold">{span}</div>
                <div style={{ color }} className="font-semibold">
                  {rec.TTF_days.toFixed(1)} days
                </div>
              </div>
              <div className="text-xs text-slate-400">
                CI: [{rec.TTF_lower.toFixed(1)}, {rec.TTF_upper.toFixed(1)}], slope: {rec.degradation_rate.toFixed(3)} / day
              </div>
              <div className="h-16 mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend}>
                    <XAxis dataKey="day" hide />
                    <YAxis hide domain={[0, 100]} />
                    <Tooltip contentStyle={{ background: '#151b22', border: '1px solid #30363d' }} />
                    <Line type="monotone" dataKey="y" stroke={color} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
