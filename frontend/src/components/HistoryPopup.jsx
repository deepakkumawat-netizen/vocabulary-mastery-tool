import { useEffect, useState, useMemo, useRef } from 'react'
import EditorToolbar from './EditorToolbar'

const todayIso = () => new Date().toISOString().slice(0, 10)
const daysAgoIso = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10) }

const fmt = (s) => {
  if (!s) return ''
  const d = new Date(s.includes('Z') || s.includes('T') ? s : s.replace(' ', 'T') + 'Z')
  return isNaN(d.getTime()) ? s : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Render vocabulary worksheet JSON to HTML for the contentEditable.
// Field names must match the backend schema used in ResultPage.jsx:
//   - vocab_words: [{word, part_of_speech, definition}]
//   - matching_section: {title, instructions, items: [{word, definition}]}
//   - fill_in_blank (SINGULAR): {title, instructions, word_bank: [str], sentences: [{sentence, answer}]}
//   - sentence_writing: {title, instructions, prompts: [{word, hint, example}]}
function worksheetToHtml(w) {
  if (!w) return ''
  if (typeof w === 'string') return w
  const parts = []
  const esc = (s) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  const block = (title, body) => parts.push(`<h2 style="font-size:18px;font-weight:700;margin:18px 0 8px;color:#0f172a">${esc(title)}</h2>${body}`)

  if (Array.isArray(w.vocab_words) && w.vocab_words.length) {
    const items = w.vocab_words.map(v => `<li><strong>${esc(v.word)}</strong>${v.part_of_speech ? ` <em style="color:#6b7280">(${esc(v.part_of_speech)})</em>` : ''}${v.definition ? ` — ${esc(v.definition)}` : ''}</li>`).join('')
    block('Vocabulary Words', `<ul style="padding-left:22px;line-height:1.7">${items}</ul>`)
  }
  if (w.matching_section) {
    const items = (w.matching_section.items || []).map(it => `<li><strong>${esc(it.word)}</strong> — ${esc(it.definition)}</li>`).join('')
    block(w.matching_section.title || 'Section 1: Match the Word to Its Meaning', `
      <p style="color:#475569;font-size:14px;margin:0 0 6px">${esc(w.matching_section.instructions)}</p>
      <ol style="padding-left:22px;line-height:1.7">${items}</ol>`)
  }
  // Fill in the Blank (note: singular `fill_in_blank`, with `sentences` and `word_bank`)
  if (w.fill_in_blank) {
    const wb = Array.isArray(w.fill_in_blank.word_bank) && w.fill_in_blank.word_bank.length
      ? `<div style="margin:6px 0 10px;padding:8px 12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;color:#475569"><strong>Word Bank:</strong> ${w.fill_in_blank.word_bank.map(esc).join(' · ')}</div>`
      : ''
    const sentences = (w.fill_in_blank.sentences || []).map(s =>
      `<li>${esc(s.sentence)}${s.answer ? `<br/><span style="color:#b45309;font-size:12px">Answer: ${esc(s.answer)}</span>` : ''}</li>`
    ).join('')
    block(w.fill_in_blank.title || 'Section 2: Fill in the Blank', `
      <p style="color:#475569;font-size:14px;margin:0 0 6px">${esc(w.fill_in_blank.instructions)}</p>
      ${wb}
      <ol style="padding-left:22px;line-height:1.8">${sentences}</ol>`)
  }
  // Sentence Writing — items live under `prompts` with {word, hint, example}
  if (w.sentence_writing) {
    const prompts = (w.sentence_writing.prompts || []).map(p =>
      `<li><strong style="color:#E85D04">${esc(p.word)}</strong>${p.hint ? `<br/><span style="color:#6b7280;font-size:12px;font-style:italic">💡 ${esc(p.hint)}</span>` : ''}${p.example ? `<br/><span style="color:#b45309;font-size:12px">Example: ${esc(p.example)}</span>` : ''}</li>`
    ).join('')
    block(w.sentence_writing.title || 'Section 3: Write Your Own Sentences', `
      <p style="color:#475569;font-size:14px;margin:0 0 6px">${esc(w.sentence_writing.instructions)}</p>
      <ol style="padding-left:22px;line-height:1.9">${prompts}</ol>`)
  }
  return parts.join('')
}

function downloadTxt(text, filename) {
  const blob = new Blob([text], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function downloadPdf(text, filename, title) {
  const s = document.createElement('script')
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
  s.onload = () => {
    const { jsPDF } = window.jspdf
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageW = doc.internal.pageSize.getWidth()
    const pageH = doc.internal.pageSize.getHeight()
    const margin = 15, maxW = pageW - margin * 2
    let y = margin
    if (title) { doc.setFont('helvetica','bold'); doc.setFontSize(14); doc.text(title, margin, y); y += 8 }
    doc.setFont('helvetica','normal'); doc.setFontSize(11); doc.setTextColor(11, 27, 45)
    text.split('\n').forEach(line => {
      if (y > pageH - margin) { doc.addPage(); y = margin }
      const t = line; if (!t.trim()) { y += 4; return }
      const wrapped = doc.splitTextToSize(t, maxW)
      if (y + wrapped.length * 5.5 > pageH - margin) { doc.addPage(); y = margin }
      doc.text(wrapped, margin, y); y += wrapped.length * 5.5 + 1.5
    })
    doc.save(filename)
  }
  document.head.appendChild(s)
}

export default function HistoryPopup({ open, onClose, api, onLoadFromHistory }) {
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [active, setActive] = useState(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!open) return
    setLoading(true); setError(null)
    fetch(`${api}/api/worksheets?limit=100`)
      .then(r => r.json())
      .then(d => setHistory(d.worksheets || []))
      .catch(e => setError(`Could not load history: ${e.message}`))
      .finally(() => setLoading(false))
  }, [open, api])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return history.filter(it => {
      if (q) {
        const hay = `${it.topic || ''} ${it.learning_objective || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (dateFrom && it.created_at && it.created_at.slice(0,10) < dateFrom) return false
      if (dateTo   && it.created_at && it.created_at.slice(0,10) > dateTo) return false
      return true
    })
  }, [history, search, dateFrom, dateTo])

  if (!open) return null

  const setPreset = (p) => {
    const t = todayIso()
    if (p === 'today')      { setDateFrom(t);             setDateTo(t) }
    else if (p === 'week')  { setDateFrom(daysAgoIso(7)); setDateTo(t) }
    else if (p === 'month') { setDateFrom(daysAgoIso(30));setDateTo(t) }
    else                    { setDateFrom('');            setDateTo('') }
  }

  return (
    <>
      <div onClick={onClose}
        style={{ position:'fixed', inset:0, zIndex:1100, background:'rgba(2,6,23,0.55)',
          display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
        <div onClick={e => e.stopPropagation()}
          style={{ width:'min(760px, 100%)', height:'min(86vh, 760px)',
            background:'#fff', color:'#0f172a', borderRadius:14, border:'1.5px solid #e5e7eb',
            boxShadow:'0 24px 80px rgba(0,0,0,0.4)', display:'flex', flexDirection:'column', overflow:'hidden' }}>

          <div style={{ padding:'14px 18px', color:'#fff',
            background:'linear-gradient(135deg, #E85D04 0%, #c14b00 100%)',
            display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div>
              <div style={{ fontSize:16, fontWeight:700 }}>📋 Vocabulary Worksheet History</div>
              <div style={{ fontSize:11, opacity:0.9 }}>
                {loading ? 'Loading…' : `${filtered.length} of ${history.length}`}
              </div>
            </div>
            <button onClick={onClose}
              style={{ background:'rgba(255,255,255,0.2)', border:'none', color:'#fff',
                width:32, height:32, borderRadius:8, cursor:'pointer', fontSize:18 }}>✕</button>
          </div>

          <div style={{ padding:'10px 14px', borderBottom:'1.5px solid #e5e7eb',
            background:'#fafafa', display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search topic / objective…"
              style={{ flex:1, minWidth:160, padding:'5px 10px', fontSize:12, border:'1px solid #e5e7eb', borderRadius:6 }}/>
            <div style={{ display:'flex', gap:4 }}>
              <button onClick={() => setPreset('today')} style={preset}>Today</button>
              <button onClick={() => setPreset('week')}  style={preset}>7d</button>
              <button onClick={() => setPreset('month')} style={preset}>30d</button>
              <button onClick={() => setPreset('all')}   style={preset}>All</button>
            </div>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={dateInput} />
            <span style={{ fontSize:11, color:'#6b7280' }}>→</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={dateInput} />
          </div>

          <div style={{ flex:1, overflowY:'auto', padding:10 }}>
            {error && <div style={{ padding:10, background:'#fef2f2', border:'1px solid #fecaca', borderRadius:8, color:'#dc2626', fontSize:12 }}>⚠️ {error}</div>}
            {loading ? (
              <div style={{ padding:48, textAlign:'center', color:'#6b7280' }}>Loading history…</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding:48, textAlign:'center', color:'#6b7280' }}>
                <p style={{ fontSize:14, fontWeight:600 }}>No worksheets match your filters.</p>
                <p style={{ fontSize:12, marginTop:6 }}>Generate a worksheet and it'll appear here.</p>
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {filtered.map((it, i) => (
                  <div key={it.id || i} onClick={() => setActive(it)}
                    style={{ display:'flex', gap:12, padding:'10px 12px', borderRadius:10, cursor:'pointer',
                      border:'1px solid #e5e7eb', background:'#fff', transition:'all .15s' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#E85D04'; e.currentTarget.style.transform = 'translateX(2px)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.transform = 'translateX(0)' }}>
                    <div style={{ fontSize:22, flexShrink:0 }}>📝</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:700, fontSize:14, color:'#0f172a',
                        whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{it.topic || 'Untitled'}</div>
                      <div style={{ fontSize:12, color:'#6b7280', marginTop:2,
                        whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                        Grade {it.grade_level || '?'} · {it.learning_objective || '(no objective)'}
                      </div>
                      <div style={{ fontSize:11, color:'#9ca3af', marginTop:3 }}>{fmt(it.created_at)}</div>
                    </div>
                    <div style={{ alignSelf:'center', fontSize:11, color:'#E85D04', fontWeight:700, whiteSpace:'nowrap' }}>Open →</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {active && (
        <HistoryItemEditor
          item={active}
          onClose={() => setActive(null)}
          onLoad={() => { onLoadFromHistory?.(active); setActive(null); onClose?.() }}
        />
      )}
    </>
  )
}

function HistoryItemEditor({ item, onClose, onLoad }) {
  const editorRef = useRef(null)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!editorRef.current) return
    editorRef.current.innerHTML = worksheetToHtml(item?.content || {})
    setDirty(false)
  }, [item])

  if (!item) return null

  const safeName = (item.topic || 'worksheet').replace(/[^\w\-]+/g, '-').toLowerCase()

  const handleTxt = () => downloadTxt(editorRef.current?.innerText || '', `${safeName}.txt`)
  const handlePdf = () => downloadPdf(editorRef.current?.innerText || '', `${safeName}.pdf`, item.topic || 'Vocabulary Worksheet')
  const handlePrint = () => {
    const html = editorRef.current?.innerHTML || ''
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<!doctype html><html><head><title>${item.topic || ''}</title>
      <style>body{font-family:Georgia,'Times New Roman',serif;padding:24mm;line-height:1.6;color:#111}
      h2{color:#0b1b2d;margin-top:18px}ul,ol{padding-left:22px}</style></head>
      <body>${html}</body></html>`)
    w.document.close(); w.focus(); w.print()
  }

  return (
    <div onClick={onClose}
      style={{ position:'fixed', inset:0, zIndex:1500, background:'rgba(2,6,23,0.55)',
        display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ width:'min(900px, 100%)', height:'min(90vh, 900px)',
          background:'#fff', borderRadius:14, border:'1.5px solid #e5e7eb',
          boxShadow:'0 24px 80px rgba(0,0,0,0.4)', display:'flex', flexDirection:'column', overflow:'hidden' }}>

        <div style={{ padding:'10px 16px', background:'linear-gradient(135deg, #E85D04 0%, #c14b00 100%)',
          color:'#fff', display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:14, fontWeight:700,
              whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
              📝 {item.topic || 'Untitled'} {dirty && <span style={{ opacity:0.85, fontWeight:500 }}>(edited)</span>}
            </div>
            <div style={{ fontSize:11, opacity:0.9 }}>Grade {item.grade_level || '?'} · {fmt(item.created_at)}</div>
          </div>
          <button onClick={onLoad} title="Load this worksheet back into the result page"
            style={{ background:'rgba(255,255,255,0.25)', color:'#fff', border:'none', borderRadius:8,
              padding:'6px 10px', fontWeight:700, fontSize:12, cursor:'pointer' }}>Load</button>
          <button onClick={handlePdf} title="Download as PDF"
            style={{ background:'#fff', color:'#dc2626', border:'none', borderRadius:8,
              padding:'6px 12px', fontWeight:700, fontSize:12, cursor:'pointer' }}>⬇ PDF</button>
          <button onClick={handleTxt} title="Download as TXT"
            style={{ background:'rgba(255,255,255,0.95)', color:'#16a34a', border:'none', borderRadius:8,
              padding:'6px 10px', fontWeight:700, fontSize:12, cursor:'pointer' }}>TXT</button>
          <button onClick={handlePrint} title="Print"
            style={{ background:'rgba(255,255,255,0.18)', color:'#fff', border:'none', borderRadius:8,
              padding:'6px 10px', fontWeight:700, fontSize:12, cursor:'pointer' }}>🖨</button>
          <button onClick={onClose}
            style={{ background:'rgba(255,255,255,0.2)', border:'none', color:'#fff',
              width:30, height:30, borderRadius:8, cursor:'pointer', fontSize:16 }}>✕</button>
        </div>

        <EditorToolbar onDone={() => { /* edits live in this contentEditable */ }} />

        <div style={{ flex:1, minHeight:0, overflow:'auto', padding:'20px 0', background:'#f3f4f6' }}>
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={() => setDirty(true)}
            spellCheck
            style={{ maxWidth:780, margin:'0 auto', minHeight:'100%',
              background:'#fff', color:'#111', padding:'40px 56px',
              boxShadow:'0 1px 4px rgba(0,0,0,0.08)', borderRadius:4,
              fontFamily:'"Calibri","Segoe UI","Helvetica Neue",Arial,sans-serif',
              fontSize:15, lineHeight:1.7, outline:'none' }}
          />
        </div>

        <div style={{ padding:'8px 16px', borderTop:'1.5px solid #e5e7eb', background:'#fff',
          fontSize:11, color:'#6b7280' }}>
          Edits are local to this view · use Download or Print to save · Load pushes it back to the result page
        </div>
      </div>
    </div>
  )
}

const preset = { padding:'4px 10px', fontSize:11, fontWeight:700,
  background:'#fff', color:'#0f172a', border:'1px solid #e5e7eb', borderRadius:6, cursor:'pointer' }
const dateInput = { padding:'4px 8px', fontSize:11,
  background:'#fff', color:'#0f172a', border:'1px solid #e5e7eb', borderRadius:6 }
