import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import BridgeMap from '../components/BridgeMap'
import HealthGauge from '../components/HealthGauge'
import SensorChart from '../components/SensorChart'
import VehicleCounter from '../components/VehicleCounter'
import CrackViewer from '../components/CrackViewer'
import TTFPanel from '../components/TTFPanel'
import ReportPanel from '../components/ReportPanel'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000'

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [selectedSpan, setSelectedSpan] = useState('Span-A')
  const [loading, setLoading] = useState(false)
  const [reportLoading, setReportLoading] = useState(false)
  const [error, setError] = useState('')
  const [statusMsg, setStatusMsg] = useState('')

  const loadInitial = async () => {
    setLoading(true)
    setError('')
    setStatusMsg('Loading initial analysis...')
    try {
      const res = await fetch(`${API_BASE}/api/full`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setData(json)
      const spans = Object.keys(json?.fusion?.per_span || {})
      if (spans.length) {
        setSelectedSpan((prev) => {
          if (prev && spans.includes(prev)) return prev
          const lowest = spans
            .map((s) => ({ span: s, health: json?.fusion?.per_span?.[s]?.health_index ?? 100 }))
            .sort((a, b) => a.health - b.health)[0]?.span
          return lowest || spans[0]
        })
      }
      setStatusMsg(`Loaded run ${json?.meta?.run_id?.slice(0, 8) || 'n/a'}`)
    } catch (e) {
      setError('Failed to load dashboard data. Ensure backend is running on port 5000.')
      setStatusMsg('')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadInitial()
  }, [])

  const runNewAnalysis = async () => {
    setLoading(true)
    setError('')
    setStatusMsg('Resetting all spans and starting a new monitoring cycle...')
    try {
      const res = await fetch(`${API_BASE}/api/run-full-analysis`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setData(json)
      setStatusMsg(`Reset complete: run ${json?.meta?.run_id?.slice(0, 8) || 'n/a'}`)
    } catch (e) {
      setError('Failed to reset monitoring cycle.')
      setStatusMsg('')
    } finally {
      setLoading(false)
    }
  }

  const refreshReport = async () => {
    setReportLoading(true)
    setError('')
    setStatusMsg('Refreshing inspection report...')
    try {
      const res = await fetch(`${API_BASE}/api/report`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setData((prev) => ({ ...(prev || {}), report: json }))
      setStatusMsg(`Report refreshed at ${new Date(json?.generated_at || Date.now()).toLocaleTimeString()}`)
    } catch (e) {
      setError('Failed to refresh report.')
      setStatusMsg('')
    } finally {
      setReportLoading(false)
    }
  }

  const healthData = data?.fusion?.per_span || {}
  const sensorSpan = data?.simulation?.spans?.[selectedSpan]
  const spanAnalysis = data?.timeseries?.per_span?.[selectedSpan]
  const crackSpan = data?.crack?.per_span?.[selectedSpan]
  const ttfData = data?.ttf?.per_span || {}
  const reportSource = data?.report?.source || 'n/a'
  const llmConnected = reportSource === 'anthropic' || reportSource === 'openrouter' || reportSource === 'gemini'

  const completeness = useMemo(() => {
    const spans = Object.keys(healthData)
    return spans.map((span) => {
      const sensorRec = data?.timeseries?.per_span?.[span] || {}
      const crackRec = data?.crack?.per_span?.[span] || {}
      const vehRec = data?.vehicle?.per_span_vehicle_counts?.[span] || {}

      const sensorReady = Number(sensorRec.sensor_anomaly_score ?? 0) > 0
        || Number(sensorRec.flagged_window_count ?? 0) > 0
        || Number(sensorRec.dominant_frequency_detected ?? 0) > 0
      const droneReady = Number(crackRec.crack_count ?? 0) > 0
        || (crackRec.annotated_image_base64 || '').length > 0
      const vehicleReady = (Number(vehRec.heavy ?? 0) + Number(vehRec.medium ?? 0) + Number(vehRec.small ?? 0)) > 0

      return { span, sensorReady, droneReady, vehicleReady }
    })
  }, [data, healthData])

  const overallStatus = useMemo(() => {
    const vals = Object.values(healthData)
    if (!vals.length) return 'No data'
    const avg = vals.reduce((s, v) => s + v.health_index, 0) / vals.length
    if (avg >= 75) return 'STABLE'
    if (avg >= 50) return 'MONITOR'
    if (avg >= 25) return 'HIGH RISK'
    return 'EMERGENCY'
  }, [healthData])

  const cards = [
    { title: 'Sensor Ingestion', to: '/sensor', desc: 'Live time-series collection and upload simulation.' },
    { title: 'Drone Capture', to: '/drone', desc: 'Span imaging workflow and crack analysis feed.' },
    { title: 'Vehicle Monitor', to: '/vehicle', desc: 'CAM1/CAM2 timestamps to damage contribution pipeline.' },
    { title: 'Data Flow', to: '/dataflow', desc: 'Visual map of all modules into final health index.' }
  ]

  return (
    <div className="min-h-screen p-4 md:p-6">
      <header className="mb-4 card p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl md:text-3xl tracking-wide">AI Structural Health Monitoring</h1>
          <p className="text-sm text-slate-400">Bridge Infrastructure Command Dashboard</p>
          <div className="mt-2 inline-flex items-center gap-2 text-xs">
            <span className={`px-2 py-1 rounded border ${llmConnected ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300' : 'border-amber-400/40 bg-amber-500/10 text-amber-200'}`}>
              {llmConnected ? `LLM Connected (${reportSource})` : `LLM Fallback (${reportSource})`}
            </span>
          </div>
        </div>
        <button
          onClick={runNewAnalysis}
          disabled={loading}
          className="px-4 py-2 rounded bg-[#238636] hover:bg-[#2ea043] text-sm font-medium disabled:opacity-60"
        >
          {loading ? 'Resetting...' : 'Run New Analysis (Reset)'}
        </button>
      </header>

      {error && <div className="mb-4 p-3 rounded border border-red-400/40 bg-red-500/10 text-sm">{error}</div>}
      {statusMsg && <div className="mb-4 p-3 rounded border border-emerald-400/40 bg-emerald-500/10 text-sm">{statusMsg}</div>}

      <section className="card p-4 mb-4">
        <h2 className="font-display text-lg mb-3">How This Works</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {cards.map((card) => (
            <Link key={card.to} to={card.to} className="border border-line rounded p-3 bg-black/20 hover:bg-black/35 transition">
              <div className="font-semibold text-sm mb-1">{card.title}</div>
              <div className="text-xs text-slate-400">{card.desc}</div>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <aside className="xl:col-span-2 card p-4 h-fit fade-in">
          <h2 className="font-display text-lg mb-2">System Status</h2>
          <div className="text-sm text-slate-300 mb-3">Overall: <span className="font-semibold">{overallStatus}</span></div>

          <div className="space-y-2">
            {Object.keys(healthData).map((span) => (
              <button
                key={span}
                onClick={() => setSelectedSpan(span)}
                className={`w-full text-left rounded px-3 py-2 border text-sm transition ${
                  selectedSpan === span
                    ? 'border-white bg-white/10'
                    : 'border-line hover:border-slate-500 hover:bg-white/5'
                }`}
              >
                <div className="font-medium">{span}</div>
                <div className="text-xs" style={{ color: healthData[span]?.color_code || '#9da7b4' }}>
                  {(healthData[span]?.health_index ?? 0).toFixed(1)} - {healthData[span]?.classification || 'n/a'}
                </div>
              </button>
            ))}
          </div>

          <div className="mt-4 border-t border-line pt-3">
            <h3 className="text-sm font-semibold mb-2">Data Completeness</h3>
            <div className="space-y-2 text-xs">
              {completeness.map((row) => (
                <div key={row.span} className="border border-line rounded p-2 bg-black/20">
                  <div className="font-medium mb-1">{row.span}</div>
                  <div className="flex flex-wrap gap-1">
                    <span className={`px-1.5 py-0.5 rounded ${row.sensorReady ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-500/20 text-slate-400'}`}>
                      Sensor {row.sensorReady ? 'OK' : 'Pending'}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded ${row.droneReady ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-500/20 text-slate-400'}`}>
                      Drone {row.droneReady ? 'OK' : 'Pending'}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded ${row.vehicleReady ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-500/20 text-slate-400'}`}>
                      Vehicle {row.vehicleReady ? 'OK' : 'Pending'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>

        <main className="xl:col-span-10 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <BridgeMap healthData={healthData} selectedSpan={selectedSpan} onSelect={setSelectedSpan} />
          <HealthGauge
            spanId={selectedSpan}
            value={healthData[selectedSpan]?.health_index || 0}
            classification={healthData[selectedSpan]?.classification || 'UNKNOWN'}
          />
          <VehicleCounter vehicleData={data?.vehicle} selectedSpan={selectedSpan} />

          <SensorChart sensorData={sensorSpan} spanAnalysis={spanAnalysis} />
          <CrackViewer spanId={selectedSpan} crackData={crackSpan} />
          <TTFPanel ttfData={ttfData} />

          <div className="md:col-span-2 xl:col-span-3">
            <ReportPanel
              reportText={data?.report?.report}
              reportSource={data?.report?.source}
              reportGeneratedAt={data?.report?.generated_at}
              onRefreshReport={refreshReport}
              refreshing={reportLoading}
            />
          </div>
        </main>
      </div>
    </div>
  )
}
