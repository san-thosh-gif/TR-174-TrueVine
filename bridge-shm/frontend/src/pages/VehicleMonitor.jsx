import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000'

const weights = { heavy: 1.0, medium: 0.5, small: 0.2 }

function randomHSV(baseHue = null) {
  const h = baseHue ?? Math.floor(Math.random() * 180)
  return [h, 80 + Math.floor(Math.random() * 175), 80 + Math.floor(Math.random() * 175)]
}

export default function VehicleMonitor() {
  const [span, setSpan] = useState('A')
  const [vehicleClass, setVehicleClass] = useState('heavy')
  const [cam1, setCam1] = useState(null)
  const [cam2, setCam2] = useState(null)
  const [calcLines, setCalcLines] = useState([])
  const [events, setEvents] = useState([])
  const [pushing, setPushing] = useState(false)
  const [pushMsg, setPushMsg] = useState('')

  const generateAllSpanTraffic = () => {
    const now = Date.now()
    const template = [
      { span: 'Span-A', cls: 'heavy', dwell: 52.4, icon: '🚚' },
      { span: 'Span-B', cls: 'medium', dwell: 31.1, icon: '🚌' },
      { span: 'Span-C', cls: 'small', dwell: 14.8, icon: '🚗' },
      { span: 'Span-D', cls: 'medium', dwell: 26.6, icon: '🚌' }
    ]
    const generated = template.map((t, idx) => {
      const raw = t.dwell * weights[t.cls]
      const normalized = Math.min(raw / 100, 1.0)
      const cam1T = new Date(now + idx * 60000)
      const cam2T = new Date(cam1T.getTime() + t.dwell * 1000)
      return {
        vehicle: t.icon,
        class: t.cls,
        span: t.span,
        cam1: cam1T.toLocaleTimeString(),
        cam2: cam2T.toLocaleTimeString(),
        dwell: t.dwell,
        damage: normalized
      }
    })
    setEvents((prev) => [...generated, ...prev])
    setPushMsg('Generated realistic traffic for Span-A to Span-D. Click Push to Health Fusion.')
  }

  const registerCam1 = () => {
    const t1 = new Date()
    const hsv = randomHSV()
    setCam1({
      id: `V-${Date.now()}`,
      class: vehicleClass,
      span: `Span-${span}`,
      hsv,
      time: t1,
      icon: vehicleClass === 'heavy' ? '🚚' : vehicleClass === 'medium' ? '🚌' : '🚗'
    })
    setCam2(null)
    setCalcLines([])
  }

  const registerCam2 = async () => {
    if (!cam1) return
    const dwell = Math.round((10 + Math.random() * 80) * 10) / 10
    const t2 = new Date(cam1.time.getTime() + dwell * 1000)
    const hsv2 = randomHSV(cam1.hsv[0] + Math.floor((Math.random() - 0.5) * 8))

    const c2 = {
      ...cam1,
      hsv: hsv2,
      exitTime: t2,
      dwell
    }
    setCam2(c2)

    const raw = dwell * weights[cam1.class]
    const normalized = Math.min(raw / 100, 1.0)

    const lines = [
      `Vehicle Class: ${cam1.class.toUpperCase()}`,
      `Dwell Time: ${dwell.toFixed(1)} seconds`,
      '',
      'Damage Formula:',
      'Heavy Weight   = 1.0',
      'Medium Weight  = 0.5',
      'Small Weight   = 0.2',
      '',
      `Raw Damage     = ${dwell.toFixed(1)} × ${weights[cam1.class]} = ${raw.toFixed(3)}`,
      `Normalized     = ${raw.toFixed(3)} / 100 = ${normalized.toFixed(3)}`,
      '',
      `Span Damage Contribution: ${normalized.toFixed(3)}`
    ]

    setCalcLines([])
    for (let i = 0; i < lines.length; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 160))
      setCalcLines((prev) => [...prev, lines[i]])
    }

    setEvents((prev) => [
      {
        vehicle: c2.icon,
        class: c2.class,
        span: c2.span,
        cam1: c2.time.toLocaleTimeString(),
        cam2: c2.exitTime.toLocaleTimeString(),
        dwell: c2.dwell,
        damage: normalized
      },
      ...prev
    ])
  }

  const barData = useMemo(() => {
    const sums = { 'Span-A': 0, 'Span-B': 0, 'Span-C': 0, 'Span-D': 0 }
    events.forEach((e) => {
      sums[e.span] += e.damage
    })
    return Object.keys(sums).map((s) => ({ span: s, damage: Number(sums[s].toFixed(3)) }))
  }, [events])

  const pushToFusion = async () => {
    setPushing(true)
    setPushMsg('')
    try {
      if (!events.length) {
        setPushMsg('No vehicle events found. Register CAM-1/CAM-2 first or use Generate All-Span Traffic.')
        setPushing(false)
        return
      }

      const perSpanDamageRaw = events.reduce((acc, e) => {
        acc[e.span] = (acc[e.span] || 0) + e.damage * 100
        return acc
      }, { 'Span-A': 0, 'Span-B': 0, 'Span-C': 0, 'Span-D': 0 })

      const perSpanCounts = events.reduce((acc, e) => {
        if (!acc[e.span]) acc[e.span] = { heavy: 0, medium: 0, small: 0 }
        acc[e.span][e.class] += 1
        return acc
      }, { 'Span-A': { heavy: 0, medium: 0, small: 0 }, 'Span-B': { heavy: 0, medium: 0, small: 0 }, 'Span-C': { heavy: 0, medium: 0, small: 0 }, 'Span-D': { heavy: 0, medium: 0, small: 0 } })

      const avgDwell = {
        heavy: events.filter((e) => e.class === 'heavy').reduce((s, e) => s + e.dwell, 0) / Math.max(1, events.filter((e) => e.class === 'heavy').length),
        medium: events.filter((e) => e.class === 'medium').reduce((s, e) => s + e.dwell, 0) / Math.max(1, events.filter((e) => e.class === 'medium').length),
        small: events.filter((e) => e.class === 'small').reduce((s, e) => s + e.dwell, 0) / Math.max(1, events.filter((e) => e.class === 'small').length)
      }

      const res = await fetch(`${API_BASE}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'vehicle-monitor-sim',
          span_id: `Span-${span}`,
          event_count: events.length,
          per_span_damage_raw: perSpanDamageRaw,
          per_span_vehicle_counts: perSpanCounts,
          average_dwell_per_category: avgDwell,
          events
        })
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setPushMsg(`Health fusion updated for all spans. Run ${json?.meta?.run_id?.slice(0, 8) || 'n/a'}`)
    } catch (err) {
      setPushMsg(`Failed to push updates to fusion. ${err?.message || ''}`)
    } finally {
      setPushing(false)
    }
  }

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-display text-2xl">Vehicle Timestamp & Classification Simulator</h1>
        <Link to="/" className="px-3 py-2 rounded border border-line bg-black/20 hover:bg-black/35 text-sm">{'<'} Back to Dashboard</Link>
      </div>

      <section className="card p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <div className="text-sm">Span:
            <select className="ml-2 bg-black/30 border border-line rounded p-1" value={span} onChange={(e) => setSpan(e.target.value)}>
              <option value="A">Span-A</option>
              <option value="B">Span-B</option>
              <option value="C">Span-C</option>
              <option value="D">Span-D</option>
            </select>
          </div>
          <div className="flex gap-2 text-sm">
            <button onClick={() => setVehicleClass('heavy')} className={`px-2 py-1 rounded border ${vehicleClass === 'heavy' ? 'bg-red-500/20 border-red-400' : 'border-line'}`}>Heavy Vehicle (Truck)</button>
            <button onClick={() => setVehicleClass('medium')} className={`px-2 py-1 rounded border ${vehicleClass === 'medium' ? 'bg-yellow-500/20 border-yellow-400' : 'border-line'}`}>Medium Vehicle (Bus/Van)</button>
            <button onClick={() => setVehicleClass('small')} className={`px-2 py-1 rounded border ${vehicleClass === 'small' ? 'bg-green-500/20 border-green-400' : 'border-line'}`}>Small Vehicle (Car/Bike)</button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-line rounded p-3 bg-black/20">
            <h3 className="font-semibold mb-2">CAM-1 (Entry)</h3>
            <button onClick={registerCam1} className="mb-2 px-3 py-2 rounded bg-[#238636] text-sm">Register Vehicle on CAM-1</button>
            {cam1 && (
              <div className="text-sm space-y-1">
                <div>{cam1.icon} Vehicle Class: {cam1.class}</div>
                <div>Color Signature (HSV): [{cam1.hsv.join(', ')}]</div>
                <div>Timestamp: {cam1.time.toLocaleTimeString()}</div>
              </div>
            )}
          </div>

          <div className="border border-line rounded p-3 bg-black/20">
            <h3 className="font-semibold mb-2">CAM-2 (Exit)</h3>
            <button onClick={registerCam2} disabled={!cam1} className="mb-2 px-3 py-2 rounded bg-[#1f6feb] text-sm disabled:opacity-60">Register Vehicle on CAM-2</button>
            {cam2 && (
              <div className="text-sm space-y-1">
                <div>{cam2.icon} Vehicle Class: {cam2.class}</div>
                <div>Color Signature (HSV): [{cam2.hsv.join(', ')}]</div>
                <div>Timestamp: {cam2.exitTime.toLocaleTimeString()}</div>
                <div>Dwell Time = {(cam2.dwell).toFixed(1)} seconds</div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="card p-4 mb-4">
        <h2 className="font-display text-lg mb-2">Damage Calculation Engine</h2>
        <pre className="text-sm whitespace-pre-wrap bg-black/20 border border-line rounded p-3 min-h-44">{calcLines.join('\n')}</pre>
      </section>

      <section className="card p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-display text-lg">Cumulative Span Damage Log</h2>
          <div className="flex gap-2">
            <button onClick={generateAllSpanTraffic} className="px-3 py-2 rounded border border-line bg-black/20 hover:bg-black/35 text-sm">
              Generate All-Span Traffic
            </button>
            <button onClick={pushToFusion} disabled={pushing} className="px-3 py-2 rounded bg-[#d29922] text-black text-sm font-semibold disabled:opacity-60">
              {pushing ? 'Pushing...' : 'Push to Health Fusion'}
            </button>
          </div>
        </div>
        {pushMsg && <div className="text-xs text-emerald-300 mb-2">{pushMsg}</div>}

        <div className="overflow-auto border border-line rounded mb-3">
          <table className="w-full text-xs">
            <thead className="bg-black/30">
              <tr>
                <th className="p-2 text-left">Vehicle</th>
                <th className="p-2 text-left">Class</th>
                <th className="p-2 text-left">Span</th>
                <th className="p-2 text-left">CAM-1 Time</th>
                <th className="p-2 text-left">CAM-2 Time</th>
                <th className="p-2 text-left">Dwell (s)</th>
                <th className="p-2 text-left">Damage Score</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e, idx) => (
                <tr key={`${e.cam1}-${idx}`} className="border-t border-line/60">
                  <td className="p-2">{e.vehicle}</td>
                  <td className="p-2">{e.class}</td>
                  <td className="p-2">{e.span}</td>
                  <td className="p-2">{e.cam1}</td>
                  <td className="p-2">{e.cam2}</td>
                  <td className="p-2">{e.dwell.toFixed(1)}</td>
                  <td className="p-2">{e.damage.toFixed(3)}</td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr><td className="p-3 text-slate-500" colSpan={7}>No vehicle events yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#29313b" />
              <XAxis dataKey="span" stroke="#8b98a8" tick={{ fontSize: 11 }} />
              <YAxis stroke="#8b98a8" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#151b22', border: '1px solid #30363d' }} />
              <Bar dataKey="damage" fill="#ff7b72" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="card p-4 text-sm text-slate-300">
        In real deployment, IP cameras with ANPR and computer vision classify vehicles by type and track them across spans using HSV color matching and timestamp correlation.
      </section>
    </div>
  )
}
