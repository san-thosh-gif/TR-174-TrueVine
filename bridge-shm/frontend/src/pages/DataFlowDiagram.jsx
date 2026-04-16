import React from 'react'
import { Link, useNavigate } from 'react-router-dom'

function Box({ title, subtitle, onClick }) {
  return (
    <button onClick={onClick} className="w-full text-left border border-line rounded p-3 bg-black/20 hover:bg-black/35 transition">
      <div className="font-semibold text-sm">{title}</div>
      {subtitle && <div className="text-xs text-slate-400 mt-1">{subtitle}</div>}
    </button>
  )
}

export default function DataFlowDiagram() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-display text-2xl">Data Flow Overview</h1>
        <Link to="/" className="px-3 py-2 rounded border border-line bg-black/20 hover:bg-black/35 text-sm">{'<'} Back to Dashboard</Link>
      </div>

      <section className="card p-4 mb-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="space-y-3">
            <Box title="Accelerometer / Strain" subtitle="Raw vibration + strain streams" onClick={() => navigate('/sensor')} />
            <div className="text-center text-slate-500">↓</div>
            <Box title="Signal Processing + LSTM" subtitle="Windowing + feature extraction + AE" onClick={() => navigate('/sensor')} />
            <div className="text-center text-slate-500">↓</div>
            <Box title="Anomaly Score (0–1)" subtitle="Sensor anomaly contribution" onClick={() => navigate('/sensor')} />
          </div>

          <div className="space-y-3">
            <Box title="Drone RGB Camera" subtitle="Scheduled span flyovers" onClick={() => navigate('/drone')} />
            <div className="text-center text-slate-500">↓</div>
            <Box title="YOLOv8 Crack Detection" subtitle="Crack count, area, growth" onClick={() => navigate('/drone')} />
            <div className="text-center text-slate-500">↓</div>
            <Box title="Crack Severity Score" subtitle="Per-span crack severity index" onClick={() => navigate('/drone')} />
          </div>

          <div className="space-y-3">
            <Box title="Vehicle CAM-1 / CAM-2" subtitle="Entry/exit timestamp matching" onClick={() => navigate('/vehicle')} />
            <div className="text-center text-slate-500">↓</div>
            <Box title="Dwell × Class Weight" subtitle="Damage contribution per event" onClick={() => navigate('/vehicle')} />
            <div className="text-center text-slate-500">↓</div>
            <Box title="Damage Contribution" subtitle="Normalized span load damage" onClick={() => navigate('/vehicle')} />
          </div>
        </div>

        <div className="my-4 border-t border-line" />

        <div className="space-y-3">
          <div className="text-center text-slate-400">All three streams fuse here</div>
          <Box title="Fusion Engine" subtitle="Sensor 40% | Crack 35% | Vehicle 25%" onClick={() => navigate('/')} />
          <div className="text-center text-slate-500">↓</div>
          <Box title="Health Index (0–100)" subtitle="GOOD / WARNING / CRITICAL / FAILURE" onClick={() => navigate('/')} />
          <div className="text-center text-slate-500">↓</div>
          <Box title="Time-to-Failure (days)" subtitle="Trend + confidence interval" onClick={() => navigate('/')} />
          <div className="text-center text-slate-500">↓</div>
          <Box title="AI Inspection Report" subtitle="Actionable maintenance priorities" onClick={() => navigate('/')} />
        </div>
      </section>

      <section className="card p-4 text-sm text-slate-300">
        <div className="font-semibold mb-2">Fusion Weight Legend</div>
        <div>Sensor anomaly stream contributes <span className="text-emerald-300">40%</span>.</div>
        <div>Crack severity stream contributes <span className="text-amber-300">35%</span>.</div>
        <div>Vehicle damage stream contributes <span className="text-rose-300">25%</span>.</div>
      </section>
    </div>
  )
}
