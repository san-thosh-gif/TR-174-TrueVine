import React from 'react'

function severityBadge(maxSeverity) {
  if (maxSeverity >= 3) return { text: 'SEVERE', color: '#da3633' }
  if (maxSeverity === 2) return { text: 'MODERATE', color: '#fb8500' }
  return { text: 'HAIRLINE', color: '#d29922' }
}

export default function CrackViewer({ spanId, crackData }) {
  const badge = severityBadge(crackData?.max_severity || 1)
  const growth = crackData?.growth_rate || 0

  return (
    <div className="card p-4 h-full fade-in">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-display text-lg">Crack Viewer</h3>
        <span className="text-xs text-slate-400">{spanId}</span>
      </div>

      {crackData?.annotated_image_base64 ? (
        <img
          src={`data:image/jpeg;base64,${crackData.annotated_image_base64}`}
          alt="Annotated crack"
          className="w-full h-44 object-cover rounded border border-line"
        />
      ) : (
        <div className="w-full h-44 rounded border border-line flex flex-col items-center justify-center text-slate-500 text-sm">
          <div>No drone image uploaded for this span yet.</div>
          <div className="text-xs mt-1">Go to Drone Capture and upload Span data.</div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
        <div className="border border-line rounded p-2">Crack Count: {crackData?.crack_count ?? 0}</div>
        <div className="border border-line rounded p-2">
          Max Severity:{' '}
          <span style={{ color: badge.color }} className="font-semibold">
            {badge.text}
          </span>
        </div>
        <div className="border border-line rounded p-2">IoU Mean: {(crackData?.iou_mean ?? 0).toFixed(3)}</div>
        <div className="border border-line rounded p-2">Growth Rate: {(growth * 100).toFixed(1)}%</div>
      </div>
    </div>
  )
}
