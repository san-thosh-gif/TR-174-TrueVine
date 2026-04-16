import React, { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

export default function VehicleCounter({ vehicleData, selectedSpan }) {
  const spanCounts = vehicleData?.per_span_vehicle_counts?.[selectedSpan] || { heavy: 0, medium: 0, small: 0 }
  const allSpanCounts = vehicleData?.per_span_vehicle_counts || {}

  const damageChart = useMemo(() => {
    const raw = vehicleData?.per_span_damage_raw || {}
    return Object.keys(raw).map((span) => ({ span, damage: Number(raw[span].toFixed(2)) }))
  }, [vehicleData])

  const avg = vehicleData?.average_dwell_per_category || { heavy: 0, medium: 0, small: 0 }

  return (
    <div className="card p-4 h-full fade-in">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display text-lg">Vehicle Load Monitor</h3>
        <span className="text-xs text-slate-400">{selectedSpan}</span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center text-sm mb-3">
        <div className="border border-line rounded p-2">
          <div className="text-slate-400 text-xs">Heavy</div>
          <div className="text-xl font-semibold text-[#da3633]">{spanCounts.heavy}</div>
        </div>
        <div className="border border-line rounded p-2">
          <div className="text-slate-400 text-xs">Medium</div>
          <div className="text-xl font-semibold text-[#d29922]">{spanCounts.medium}</div>
        </div>
        <div className="border border-line rounded p-2">
          <div className="text-slate-400 text-xs">Small</div>
          <div className="text-xl font-semibold text-[#2ea043]">{spanCounts.small}</div>
        </div>
      </div>

      <div className="border border-line rounded p-2 mb-3 text-xs">
        <div className="text-slate-400 mb-1">All-Span Vehicle Counts</div>
        <div className="grid grid-cols-2 gap-1">
          {['Span-A', 'Span-B', 'Span-C', 'Span-D'].map((span) => {
            const c = allSpanCounts?.[span] || { heavy: 0, medium: 0, small: 0 }
            return <div key={span}>{span}: H{c.heavy} M{c.medium} S{c.small}</div>
          })}
        </div>
      </div>

      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={damageChart}>
            <CartesianGrid strokeDasharray="3 3" stroke="#29313b" />
            <XAxis dataKey="span" stroke="#8b98a8" tick={{ fontSize: 11 }} />
            <YAxis stroke="#8b98a8" tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ background: '#151b22', border: '1px solid #30363d' }} />
            <Bar dataKey="damage" fill="#ff7b72" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
        <div className="border border-line rounded p-2">Avg Heavy Dwell: {(avg.heavy || 0).toFixed(1)}s</div>
        <div className="border border-line rounded p-2">Avg Medium Dwell: {(avg.medium || 0).toFixed(1)}s</div>
        <div className="border border-line rounded p-2">Avg Small Dwell: {(avg.small || 0).toFixed(1)}s</div>
      </div>
    </div>
  )
}
