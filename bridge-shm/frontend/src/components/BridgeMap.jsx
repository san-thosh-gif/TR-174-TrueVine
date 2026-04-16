import React from 'react'

const spanOrder = ['Span-A', 'Span-B', 'Span-C', 'Span-D']

export default function BridgeMap({ healthData = {}, selectedSpan, onSelect }) {
  const colorFor = (span) => healthData[span]?.color_code || '#30363d'

  return (
    <div className="card p-4 fade-in">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display text-lg">Bridge Span Map</h3>
        <span className="text-xs text-slate-400">Click a span to inspect</span>
      </div>

      <svg viewBox="0 0 760 180" className="w-full h-44">
        <rect x="20" y="120" width="720" height="14" fill="#3b434e" />

        {[0, 1, 2, 3, 4].map((i) => (
          <rect key={i} x={40 + i * 170} y={118} width="24" height="38" fill="#6f7b8a" rx="3" />
        ))}

        {spanOrder.map((span, idx) => {
          const x = 70 + idx * 165
          const active = selectedSpan === span
          return (
            <g key={span} onClick={() => onSelect(span)} style={{ cursor: 'pointer' }}>
              <rect
                x={x}
                y={92}
                width="140"
                height="36"
                rx="9"
                fill={colorFor(span)}
                opacity={active ? 1 : 0.82}
                stroke={active ? '#ffffff' : '#1f2328'}
                strokeWidth={active ? 2 : 1}
              />
              <text x={x + 70} y={114} textAnchor="middle" fill="#ffffff" fontSize="14" fontWeight="600">
                {span}
              </text>
            </g>
          )
        })}
      </svg>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
        {spanOrder.map((span) => (
          <div key={span} className="rounded border border-line bg-black/20 p-2 text-xs">
            <div className="text-slate-400">{span}</div>
            <div className="font-semibold" style={{ color: colorFor(span) }}>
              {healthData[span]?.classification || 'UNKNOWN'}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
