import React, { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000'

const spans = ['A', 'B', 'C', 'D', 'ALL']
const sensorTypes = ['Accelerometer', 'Strain Gauge']
const rates = [100, 250, 500]
const durations = [10, 30, 60]

function generateValue(sensorType, t, spanCode) {
  const spanShift = { A: 0.12, B: 0.35, C: 0.02, D: 0.2 }[spanCode] || 0.1
  if (sensorType === 'Accelerometer') {
    return Math.sin(2 * Math.PI * (2.5 - spanShift) * t) + (Math.random() - 0.5) * 0.4
  }
  return 0.8 * Math.sin(2 * Math.PI * 0.15 * t) + (Math.random() - 0.5) * 0.15 + 0.01 * t
}

export default function SensorIngestion() {
  const [span, setSpan] = useState('A')
  const [sensorType, setSensorType] = useState('Accelerometer')
  const [samplingRate, setSamplingRate] = useState(500)
  const [duration, setDuration] = useState(10)
  const [liveSeries, setLiveSeries] = useState([])
  const [rawSignal, setRawSignal] = useState([])
  const [received, setReceived] = useState(0)
  const [collecting, setCollecting] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [steps, setSteps] = useState([])
  const [result, setResult] = useState(null)
  const timerRef = useRef(null)

  const totalSamples = samplingRate * duration

  const startCollection = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    setCollecting(true)
    setCompleted(false)
    setResult(null)
    setSteps([])
    setLiveSeries([])
    setRawSignal([])
    setReceived(0)

    const chunk = Math.max(5, Math.floor(samplingRate / 10))
    let index = 0

    timerRef.current = setInterval(() => {
      const next = []
      for (let i = 0; i < chunk && index < totalSamples; i += 1, index += 1) {
        const t = index / samplingRate
        next.push({ idx: index, t: Number(t.toFixed(3)), value: generateValue(sensorType, t, span) })
      }

      if (next.length > 0) {
        setRawSignal((prev) => [...prev, ...next])
        setLiveSeries((prev) => [...prev, ...next].slice(-260))
        setReceived((r) => r + next.length)
      }

      if (index >= totalSamples) {
        clearInterval(timerRef.current)
        timerRef.current = null
        setCollecting(false)
        setCompleted(true)
      }
    }, 100)
  }

  const runProcessAndUpload = async () => {
    setProcessing(true)
    setSteps([])

    const labels = [
      'Segmenting into 256-sample windows',
      'Extracting RMS, Kurtosis, FFT Features',
      'Running LSTM Autoencoder',
      'Computing Anomaly Score',
      'Updating Health Index for selected Span'
    ]

    for (let i = 0; i < labels.length; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 650))
      setSteps((prev) => [...prev, labels[i]])
    }

    try {
      const values = rawSignal.map((d) => d.value)
      const mean = values.reduce((s, v) => s + v, 0) / Math.max(values.length, 1)
      const rms = Math.sqrt(values.reduce((s, v) => s + v * v, 0) / Math.max(values.length, 1))
      const peak = values.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
      const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(values.length, 1)
      const std = Math.sqrt(variance)

      // Heuristic anomaly estimate from signal roughness and peak behavior.
      const anomaly = Math.max(0, Math.min(1, ((peak - 1.2) * 0.25) + (std * 0.18) + (sensorType === 'Accelerometer' ? 0.08 : 0.04)))
      const downsampleStep = Math.max(1, Math.floor(values.length / 1800))
      const compactValues = values.filter((_, idx) => idx % downsampleStep === 0)
      const compactStrain = compactValues.map((v) => Number((v * 0.22 + (Math.random() - 0.5) * 0.03).toFixed(4)))

      const singleSpanPayload = {
        source: 'sensor-ingestion-sim',
        span_id: `Span-${span}`,
        sensor_type: sensorType,
        sampling_rate: samplingRate,
        duration_seconds: duration,
        samples_received: rawSignal.length,
        signal_values: compactValues,
        strain_values: compactStrain,
        anomaly_score: anomaly,
        anomaly_threshold: 1.0,
        dominant_frequency_detected: sensorType === 'Accelerometer' ? 2.5 : 0.15,
        flagged_window_count: Math.round(anomaly * 12),
        feature_summary: {
          rms_mean: rms,
          peak_mean: peak,
          variance_mean: variance,
          std_mean: std
        }
      }

      const payload = span !== 'ALL'
        ? singleSpanPayload
        : {
            source: 'sensor-ingestion-batch',
            span_id: 'Span-A',
            sensor_by_span: ['A', 'B', 'C', 'D'].reduce((acc, sCode, idx) => {
              const spanScale = [0.85, 1.25, 0.65, 1.05][idx]
              const spanVals = compactValues.map((v) => Number((v * spanScale + (Math.random() - 0.5) * 0.05).toFixed(5)))
              const spanAnomaly = Number(Math.max(0, Math.min(1, anomaly * [0.8, 1.45, 0.5, 1.1][idx])).toFixed(4))
              acc[`Span-${sCode}`] = {
                sample_rate: samplingRate,
                signal_values: spanVals,
                strain_values: spanVals.map((v) => Number((v * 0.22).toFixed(4))),
                anomaly_score: spanAnomaly,
                anomaly_threshold: 1.0,
                dominant_frequency_detected: sensorType === 'Accelerometer' ? Number((2.5 - (idx * 0.08)).toFixed(3)) : 0.15,
                flagged_window_count: Math.round(spanAnomaly * 12),
                feature_summary: {
                  rms_mean: rms * spanScale,
                  peak_mean: peak * spanScale,
                  variance_mean: variance * spanScale,
                  std_mean: std * spanScale
                }
              }
              return acc
            }, {})
          }

      const res = await fetch(`${API_BASE}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const json = await res.json()
      setResult(span !== 'ALL' ? (json?.selected_span || null) : { span_id: 'Span-A..D', anomaly_score: 0.0, health_index: 0.0, classification: 'BATCH UPLOADED' })
    } catch {
      setResult({ span_id: span === 'ALL' ? 'Span-A..D' : `Span-${span}`, anomaly_score: 0, health_index: 0, classification: 'UPLOAD FAILED' })
    } finally {
      setProcessing(false)
    }
  }

  const previewSignal = useMemo(() => {
    const step = Math.max(1, Math.floor(rawSignal.length / 1200))
    return rawSignal.filter((_, idx) => idx % step === 0)
  }, [rawSignal])

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-display text-2xl">Time Series Data Ingestion Simulator</h1>
        <Link to="/" className="px-3 py-2 rounded border border-line bg-black/20 hover:bg-black/35 text-sm">{'<'} Back to Dashboard</Link>
      </div>

      <section className="card p-4 mb-4">
        <h2 className="font-display text-lg mb-3">Sensor Configuration</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
          <label className="flex flex-col gap-1">Span
            <select className="bg-black/30 border border-line rounded p-2" value={span} onChange={(e) => setSpan(e.target.value)}>{spans.map((s) => <option key={s} value={s}>{s === 'ALL' ? 'All Spans (A-D)' : `Span-${s}`}</option>)}</select>
          </label>
          <label className="flex flex-col gap-1">Sensor Type
            <select className="bg-black/30 border border-line rounded p-2" value={sensorType} onChange={(e) => setSensorType(e.target.value)}>{sensorTypes.map((s) => <option key={s}>{s}</option>)}</select>
          </label>
          <label className="flex flex-col gap-1">Sampling Rate
            <select className="bg-black/30 border border-line rounded p-2" value={samplingRate} onChange={(e) => setSamplingRate(Number(e.target.value))}>{rates.map((r) => <option key={r} value={r}>{`${r}Hz`}</option>)}</select>
          </label>
          <label className="flex flex-col gap-1">Duration
            <select className="bg-black/30 border border-line rounded p-2" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>{durations.map((d) => <option key={d} value={d}>{`${d}s`}</option>)}</select>
          </label>
        </div>
        <button onClick={startCollection} disabled={collecting} className="mt-4 px-4 py-2 rounded bg-[#238636] hover:bg-[#2ea043] text-sm disabled:opacity-60">
          {collecting ? 'Collecting...' : 'Start Data Collection'}
        </button>
      </section>

      <section className="card p-4 mb-4">
        <h2 className="font-display text-lg mb-2">Live Stream Waveform</h2>
        <div className="text-xs text-slate-400 mb-2">
          {collecting
            ? `Collecting from ${span === 'ALL' ? 'All Spans A-D' : `Span-${span}`} | ${samplingRate}Hz | ${received} samples received...`
            : completed
              ? `Collection complete: ${received} samples captured.`
              : 'Waiting to start collection.'}
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={liveSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="#29313b" />
              <XAxis dataKey="idx" stroke="#8b98a8" tick={{ fontSize: 11 }} />
              <YAxis stroke="#8b98a8" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#151b22', border: '1px solid #30363d' }} />
              <Line type="monotone" dataKey="value" stroke="#58a6ff" dot={false} strokeWidth={1.5} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {completed && (
        <section className="card p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-display text-lg">Raw Signal Preview</h2>
            <button onClick={runProcessAndUpload} disabled={processing} className="px-4 py-2 rounded bg-[#d29922] text-black text-sm font-semibold disabled:opacity-60">
              {processing ? 'Processing...' : 'Process & Upload to Pipeline'}
            </button>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={previewSignal}>
                <CartesianGrid strokeDasharray="3 3" stroke="#29313b" />
                <XAxis dataKey="idx" stroke="#8b98a8" tick={{ fontSize: 11 }} />
                <YAxis stroke="#8b98a8" tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#151b22', border: '1px solid #30363d' }} />
                <Line type="monotone" dataKey="value" stroke="#8ddb8c" dot={false} strokeWidth={1.3} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {(steps.length > 0 || result) && (
            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="border border-line rounded p-3">
                <h3 className="font-semibold mb-2 text-sm">Processing Pipeline</h3>
                <div className="space-y-1 text-sm">
                  {steps.map((s) => (
                    <div key={s} className="text-emerald-300">✓ {s}</div>
                  ))}
                </div>
              </div>
              <div className="border border-line rounded p-3 text-sm">
                <h3 className="font-semibold mb-2">Result</h3>
                {result ? (
                  <>
                    <div>Span: {result.span_id}</div>
                    <div>Anomaly Score: {(result.anomaly_score ?? 0).toFixed(4)}</div>
                    <div>Health Contribution: {(result.health_index ?? 0).toFixed(2)}</div>
                    <div>Classification: {result.classification || 'n/a'}</div>
                  </>
                ) : (
                  <div className="text-slate-400">Waiting for upload result...</div>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      <section className="card p-4 text-sm text-slate-300">
        In real deployment, MEMS accelerometers (e.g. ADXL355) and foil strain gauges are mounted on each span. Data is streamed via IoT gateway at 500Hz into this pipeline.
      </section>
    </div>
  )
}
