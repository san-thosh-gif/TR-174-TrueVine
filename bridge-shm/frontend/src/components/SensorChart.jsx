import React, { useMemo } from 'react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Area } from 'recharts'

function downsampleSeries(time, accel, strain, maxPoints = 700) {
  const step = Math.max(1, Math.floor(time.length / maxPoints))
  const rows = []
  for (let i = 0; i < time.length; i += step) {
    rows.push({ idx: i, t: Number(time[i].toFixed(2)), accel: accel[i], strain: strain[i], error: null, anomaly: null })
  }
  return rows
}

export default function SensorChart({ sensorData, spanAnalysis }) {
  const chartData = useMemo(() => {
    if (!sensorData) return []
    const rows = downsampleSeries(sensorData.time || [], sensorData.accelerometer || [], sensorData.strain || [])

    const err = spanAnalysis?.window_errors || []
    const ranges = spanAnalysis?.window_ranges || []
    const threshold = spanAnalysis?.anomaly_threshold || 1

    ranges.forEach((r, idx) => {
      const start = r[0]
      const row = rows.find((x) => x.idx >= start)
      if (row) {
        row.error = err[idx]
      }
    })

    const spikes = new Set(sensorData.spike_indices || [])
    rows.forEach((row) => {
      if (spikes.has(row.idx)) {
        row.anomaly = row.accel
      }
      if (row.error == null) row.error = 0
      row.errNorm = Math.min(row.error / (threshold * 2), 1)
    })

    return rows
  }, [sensorData, spanAnalysis])

  return (
    <div className="card p-4 h-full fade-in">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-display text-lg">Sensor Time Series</h3>
        <div className="text-xs text-slate-400">Accel + Strain + Reconstruction Error</div>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 16, left: 2, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#29313b" />
            <XAxis dataKey="t" stroke="#8b98a8" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="left" stroke="#8b98a8" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="right" orientation="right" domain={[0, 1]} stroke="#8b98a8" tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ background: '#151b22', border: '1px solid #30363d' }} />
            <Area yAxisId="right" type="monotone" dataKey="errNorm" stroke="none" fill="#ff7b7270" name="Anomaly Score" />
            <Line yAxisId="left" type="monotone" dataKey="accel" stroke="#58a6ff" dot={false} strokeWidth={1.4} name="Accelerometer" />
            <Line yAxisId="left" type="monotone" dataKey="strain" stroke="#8ddb8c" dot={false} strokeWidth={1.2} name="Strain" />
            <Line yAxisId="left" type="monotone" dataKey="anomaly" stroke="#ff4d4f" dot={{ r: 3, stroke: '#ff4d4f' }} connectNulls={false} name="Spike" />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 text-xs">
        <div className="border border-line rounded p-2">
          Avg Health: {(spanAnalysis?.avg_health_index ?? 0).toFixed(2)}
        </div>
        <div className="border border-line rounded p-2">
          Flagged Windows: {spanAnalysis?.flagged_window_count ?? 0}
        </div>
        <div className="border border-line rounded p-2">
          Dom Freq: {(spanAnalysis?.dominant_frequency_detected ?? 0).toFixed(2)} Hz
        </div>
        <div className="border border-line rounded p-2">
          Threshold: {(spanAnalysis?.anomaly_threshold ?? 0).toExponential(2)}
        </div>
      </div>
    </div>
  )
}
