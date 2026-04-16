import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000'

export default function Assistant() {
  const [tab, setTab] = useState('chat')
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState([
    { role: 'assistant', text: 'Ask me about span risk, crack severity, vehicle impact, or maintenance priorities.' }
  ])
  const [loading, setLoading] = useState(false)
  const [listening, setListening] = useState(false)

  const latestSource = useMemo(() => {
    const src = [...messages].reverse().find((m) => m.source)?.source
    return src || 'n/a'
  }, [messages])

  const askAssistant = async (text) => {
    const q = (text || '').trim()
    if (!q) return

    setMessages((prev) => [...prev, { role: 'user', text: q }])
    setQuestion('')
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/assistant/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q })
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)

      const reply = json?.answer || 'No response returned.'
      setMessages((prev) => [...prev, { role: 'assistant', text: reply, source: json?.source || 'unknown' }])

      if (tab === 'voice' && 'speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(reply)
        utterance.rate = 1.0
        window.speechSynthesis.cancel()
        window.speechSynthesis.speak(utterance)
      }
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'assistant', text: `Assistant error: ${err?.message || 'Unknown error'}` }])
    } finally {
      setLoading(false)
    }
  }

  const startVoiceInput = () => {
    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!Rec) {
      setMessages((prev) => [...prev, { role: 'assistant', text: 'Voice recognition is not supported in this browser. Use Chrome/Edge.' }])
      return
    }

    const rec = new Rec()
    rec.lang = 'en-US'
    rec.interimResults = false
    rec.maxAlternatives = 1

    rec.onstart = () => setListening(true)
    rec.onerror = () => setListening(false)
    rec.onend = () => setListening(false)
    rec.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || ''
      setQuestion(transcript)
      askAssistant(transcript)
    }

    rec.start()
  }

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-display text-2xl">AI Assistant</h1>
        <Link to="/" className="px-3 py-2 rounded border border-line bg-black/20 hover:bg-black/35 text-sm">{'<'} Back to Dashboard</Link>
      </div>

      <section className="card p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex gap-2 text-sm">
            <button onClick={() => setTab('chat')} className={`px-3 py-1.5 rounded border ${tab === 'chat' ? 'border-white bg-white/10' : 'border-line'}`}>Chat</button>
            <button onClick={() => setTab('voice')} className={`px-3 py-1.5 rounded border ${tab === 'voice' ? 'border-white bg-white/10' : 'border-line'}`}>Voice</button>
          </div>
          <div className="text-xs text-slate-400">Source: {latestSource}</div>
        </div>

        <div className="border border-line rounded p-3 bg-black/20 h-80 overflow-auto mb-3">
          <div className="space-y-2 text-sm">
            {messages.map((m, idx) => (
              <div key={idx} className={`${m.role === 'user' ? 'text-blue-200' : 'text-slate-100'}`}>
                <span className="font-semibold mr-2">{m.role === 'user' ? 'You:' : 'Assistant:'}</span>
                <span className="whitespace-pre-wrap">{m.text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={tab === 'voice' ? 'Use the mic or type your question...' : 'Ask a question about bridge condition...'}
            className="flex-1 bg-black/30 border border-line rounded px-3 py-2 text-sm"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !loading) askAssistant(question)
            }}
          />
          {tab === 'voice' && (
            <button onClick={startVoiceInput} disabled={listening || loading} className="px-3 py-2 rounded border border-line bg-black/20 hover:bg-black/35 text-sm disabled:opacity-60">
              {listening ? 'Listening...' : 'Mic'}
            </button>
          )}
          <button onClick={() => askAssistant(question)} disabled={loading} className="px-4 py-2 rounded bg-[#238636] hover:bg-[#2ea043] text-sm disabled:opacity-60">
            {loading ? 'Thinking...' : 'Send'}
          </button>
        </div>
      </section>

      <section className="card p-4 text-sm text-slate-300">
        Tips: Ask “Which span is most critical?”, “Why is Span-B warning?”, “Give maintenance actions for this week”, or use voice mode for spoken queries.
      </section>
    </div>
  )
}
