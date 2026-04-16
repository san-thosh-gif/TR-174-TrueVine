import React from 'react'

function gaugeColor(value) {
  if (value >= 75) return '#2ea043'
  if (value >= 50) return '#d29922'
  if (value >= 25) return '#fb8500'
  return '#da3633'
}

export default function HealthGauge({ spanId, value = 0, classification = 'UNKNOWN' }) {
  const size = 190
  const stroke = 18
  const r = (size - stroke) / 2
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * r
  const progress = Math.max(0, Math.min(100, value)) / 100
  const dash = circumference * progress

  return (
    <div className="card p-4 h-full fade-in">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg">Health Gauge</h3>
        <span className="text-xs text-slate-400">{spanId}</span>
      </div>
      <div className="flex justify-center pt-4">
        <svg width={size} height={size}>
          <circle cx={cx} cy={cy} r={r} stroke="#2b3138" strokeWidth={stroke} fill="none" />
          <circle
            cx={cx}
            cy={cy}
            r={r}
            stroke={gaugeColor(value)}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference - dash}`}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
          <text x="50%" y="48%" textAnchor="middle" fill="#fff" fontSize="34" fontWeight="700">
            {value.toFixed(1)}
          </text>
          <text x="50%" y="63%" textAnchor="middle" fill="#9da7b4" fontSize="12" fontWeight="500">
            HEALTH INDEX
          </text>
        </svg>
      </div>
      <div className="text-center mt-2 text-sm" style={{ color: gaugeColor(value) }}>
        {classification}
      </div>
    </div>
  )
}
