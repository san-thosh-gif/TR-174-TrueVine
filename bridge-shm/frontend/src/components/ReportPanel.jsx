import React from 'react'

export default function ReportPanel({ reportText, reportSource, reportGeneratedAt, onRefreshReport, refreshing }) {
  const downloadReport = () => {
    const blob = new Blob([reportText || 'No report available'], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `bridge-shm-report-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="card p-4 h-full fade-in flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-display text-lg">Inspection Report</h3>
        <div className="flex gap-2">
          <button
            onClick={onRefreshReport}
            disabled={refreshing}
            className="px-3 py-1.5 text-xs rounded border border-line bg-[#212936] hover:bg-[#2a3442] disabled:opacity-60"
          >
            {refreshing ? 'Refreshing...' : 'Refresh Report'}
          </button>
          <button
            onClick={downloadReport}
            className="px-3 py-1.5 text-xs rounded border border-line bg-[#212936] hover:bg-[#2a3442]"
          >
            Download Report
          </button>
        </div>
      </div>

      <div className="text-xs text-slate-400 mb-2">Source: {reportSource || 'n/a'}</div>
      <div className="text-xs text-slate-400 mb-2">
        Generated: {reportGeneratedAt ? new Date(reportGeneratedAt).toLocaleString() : 'n/a'}
      </div>

      <pre className="whitespace-pre-wrap text-sm bg-black/20 border border-line rounded p-3 flex-1 overflow-auto leading-relaxed">
        {reportText || 'No report available yet.'}
      </pre>
    </div>
  )
}
