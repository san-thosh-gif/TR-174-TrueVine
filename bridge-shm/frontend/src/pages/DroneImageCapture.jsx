import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000'

export default function DroneImageCapture() {
  const [span, setSpan] = useState('C')
  const [altitude, setAltitude] = useState('10m')
  const [resolution, setResolution] = useState('4K')
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('Mission idle.')
  const [captured, setCaptured] = useState(false)
  const [processingSteps, setProcessingSteps] = useState([])
  const [result, setResult] = useState(null)
  const [allResults, setAllResults] = useState({})
  const [running, setRunning] = useState(false)

  const launchMission = async () => {
    setRunning(true)
    setResult(null)
    setAllResults({})
    setCaptured(false)
    setProcessingSteps([])
    setProgress(0)

    setStatus(`Drone scanning ${span === 'ALL' ? 'Span-A to Span-D' : `Span-${span}`} at ${altitude} altitude... capturing frames`)

    await new Promise((resolve) => {
      let p = 0
      const id = setInterval(() => {
        p += 4
        setProgress(Math.min(p, 100))
        if (p >= 100) {
          clearInterval(id)
          resolve()
        }
      }, 120)
    })

    setCaptured(true)
    setStatus('4 frames captured. Uploading to crack detection module...')

    const stepLabels = [
      'Frame received from drone feed',
      'Running crack segmentation model',
      'Computing crack area and growth rate',
      'Severity score calculated',
      'Result pushed to Health Fusion module'
    ]

    for (let i = 0; i < stepLabels.length; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 500))
      setProcessingSteps((prev) => [...prev, stepLabels[i]])
    }

    try {
      if (span !== 'ALL') {
        const res = await fetch(`${API_BASE}/api/crack-sim/Span-${span}`)
        const json = await res.json()
        setResult(json)

        await fetch(`${API_BASE}/api/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: 'drone-capture-sim',
            span_id: `Span-${span}`,
            crack_count: json?.crack_count || 0,
            max_severity: json?.max_severity || 0,
            severity_score: json?.severity_score || 0,
            iou_mean: json?.iou_mean || 0,
            growth_rate: json?.growth_rate || 0,
            annotated_image_base64: json?.annotated_image_base64 || '',
            detections: json?.detections || [],
            image_shape: json?.image_shape || [360, 640],
            using_yolo: json?.using_yolo || false
          })
        })
        setStatus(`Crack analysis complete for Span-${span}.`)
      } else {
        const res = await fetch(`${API_BASE}/api/crack-sim-all`)
        const json = await res.json()
        const perSpan = json?.per_span || {}
        setAllResults(perSpan)
        setResult(perSpan['Span-A'] || null)

        await fetch(`${API_BASE}/api/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: 'drone-capture-batch',
            span_id: 'Span-A',
            crack_by_span: perSpan
          })
        })
        setStatus('Crack analysis complete for Span-A to Span-D and uploaded together.')
      }
    } catch {
      setStatus('Failed to fetch crack analysis result.')
    } finally {
      setRunning(false)
    }
  }

  const droneX = useMemo(() => `${Math.min(progress, 100)}%`, [progress])

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-display text-2xl">Drone RGB Image Collection Simulator</h1>
        <Link to="/" className="px-3 py-2 rounded border border-line bg-black/20 hover:bg-black/35 text-sm">{'<'} Back to Dashboard</Link>
      </div>

      <section className="card p-4 mb-4">
        <h2 className="font-display text-lg mb-3">Drone Mission Setup</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <label className="flex flex-col gap-1">Span
            <select className="bg-black/30 border border-line rounded p-2" value={span} onChange={(e) => setSpan(e.target.value)}>
              <option value="A">Span-A</option>
              <option value="B">Span-B</option>
              <option value="C">Span-C</option>
              <option value="D">Span-D</option>
              <option value="ALL">All Spans (A-D)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">Altitude
            <select className="bg-black/30 border border-line rounded p-2" value={altitude} onChange={(e) => setAltitude(e.target.value)}>
              <option>5m</option>
              <option>10m</option>
              <option>20m</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">Camera Resolution
            <select className="bg-black/30 border border-line rounded p-2" value={resolution} onChange={(e) => setResolution(e.target.value)}>
              <option>1080p</option>
              <option>4K</option>
            </select>
          </label>
        </div>
        <button onClick={launchMission} disabled={running} className="mt-4 px-4 py-2 rounded bg-[#238636] hover:bg-[#2ea043] text-sm disabled:opacity-60">
          {running ? 'Mission Running...' : 'Launch Drone Inspection'}
        </button>
      </section>

      <section className="card p-4 mb-4">
        <div className="relative h-28 border border-line rounded bg-[#0f141b] overflow-hidden">
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 1000 220" preserveAspectRatio="none">
            <rect x="0" y="170" width="1000" height="50" fill="#2c3440" />
            <rect x="120" y="130" width="150" height="40" fill="#485567" />
            <rect x="340" y="120" width="180" height="50" fill="#4f5f72" />
            <rect x="600" y="125" width="170" height="45" fill="#4a5869" />
          </svg>
          <div className="absolute top-8 transition-all duration-150" style={{ left: droneX }}>
            <div className="text-xl">🚁</div>
          </div>
        </div>
        <div className="text-sm text-slate-300 mt-2">{status}</div>
      </section>

      {captured && (
        <section className="card p-4 mb-4">
          <h2 className="font-display text-lg mb-3">Crack Detection Output</h2>
          {span === 'ALL' && Object.keys(allResults).length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
              {Object.entries(allResults).map(([spanId, rec]) => (
                <button key={spanId} onClick={() => setResult({ span_id: spanId, ...rec })} className="border border-line rounded p-2 text-left bg-black/20 hover:bg-black/35">
                  <div className="text-sm font-semibold mb-1">{spanId}</div>
                  <div className="text-xs text-slate-400">Cracks: {rec.crack_count} | Sev: {rec.max_severity}</div>
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="border border-line rounded p-3 bg-black/20">
              {result?.annotated_image_base64 ? (
                <img src={`data:image/jpeg;base64,${result.annotated_image_base64}`} alt="Annotated crack" className="w-full rounded" />
              ) : (
                <div className="h-52 grid place-items-center text-slate-500">Waiting for image...</div>
              )}
            </div>
            <div className="space-y-3">
              <div className="border border-line rounded p-3 text-sm">
                <div>Crack Count: {result?.crack_count ?? '-'}</div>
                <div>Max Severity: {result?.max_severity ?? '-'}</div>
                <div>Growth Rate: {result ? `${(result.growth_rate * 100).toFixed(2)}%` : '-'}</div>
                <div>IoU Mean: {result?.iou_mean?.toFixed ? result.iou_mean.toFixed(3) : '-'}</div>
              </div>
              <div className="border border-line rounded p-3 text-sm space-y-1">
                {processingSteps.map((s) => <div key={s} className="text-emerald-300">✓ {s}</div>)}
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="card p-4 text-sm text-slate-300">
        In real deployment, a DJI Matrice drone with a 4K RGB camera does scheduled span flyovers. Frames are extracted and fed into the YOLOv8 segmentation pipeline automatically.
      </section>
    </div>
  )
}
