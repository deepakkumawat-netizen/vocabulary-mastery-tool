import { useState, useRef } from 'react'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import Sidebar from '../components/Sidebar'
import ExportDropdown from '../components/ExportDropdown'

export default function ResultPage({ worksheet, formData, tabs, onNewTab, onCloseTab, onAdapt, onRemix, onLoadFromHistory, api }) {
  const [activeTabIdx, setActiveTabIdx] = useState(0)
  const [activeSidebar, setActiveSidebar] = useState(null)
  const [showAnswers, setShowAnswers] = useState(false)
  const [toast, setToast] = useState(null)
  const [history, setHistory] = useState([])
  const [showHistory, setShowHistory] = useState(false)
  const [showAllHistory, setShowAllHistory] = useState(false)
  const contentRef = useRef(null)

  const formatDate = (iso) => {
    try {
      const d = new Date(iso)
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
        ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    } catch { return iso }
  }

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const handleSidebarAction = (label) => {
    if (label === 'Create') {
      onNewTab()
      setActiveSidebar(null)
      setShowHistory(false)
      return
    }
    if (label === 'Adapt') {
      onAdapt?.(formData)
      setActiveSidebar(null)
      setShowHistory(false)
      return
    }
    if (label === 'Remix') {
      onRemix?.(formData)
      setActiveSidebar(null)
      setShowHistory(false)
      return
    }
    if (label === 'Evaluate') {
      setShowAnswers(a => !a)
      setActiveSidebar(prev => prev === 'Evaluate' ? null : 'Evaluate')
      setShowHistory(false)
      return
    }
    if (label === 'Images') {
      showToast('AI image generation coming soon!')
      setActiveSidebar(null)
      return
    }
    if (label === 'History') {
      const next = !showHistory
      setShowHistory(next)
      setActiveSidebar(next ? 'History' : null)
      setShowAllHistory(false)
      if (next) {
        fetch(`${api}/api/worksheets?limit=50`)
          .then(r => r.json())
          .then(d => setHistory(d.worksheets || []))
          .catch(() => setHistory([]))
      }
      return
    }
  }

  const ws = worksheet || {}
  const vocabWords = ws.vocab_words || []
  const matching = ws.matching_section || {}
  const fib = ws.fill_in_blank || {}
  const sw = ws.sentence_writing || {}

  const handleCopy = () => {
    const text = contentRef.current?.innerText || ''
    navigator.clipboard.writeText(text)
    alert('Copied to clipboard!')
  }

  const handlePdf = async () => {
    const element = contentRef.current
    if (!element) return
    const canvas = await html2canvas(element, { scale: 2, useCORS: true })
    const imgData = canvas.toDataURL('image/png')
    const pdf = new jsPDF('p', 'mm', 'a4')
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const imgHeight = (canvas.height * pageWidth) / canvas.width
    let y = 0
    while (y < imgHeight) {
      pdf.addImage(imgData, 'PNG', 0, -y, pageWidth, imgHeight)
      if (y + pageHeight < imgHeight) pdf.addPage()
      y += pageHeight
    }
    pdf.save(`vocabulary_${formData.topic || 'worksheet'}.pdf`)
  }

  const handleDocx = async () => {
    const res = await fetch(`${api}/api/vocabulary/export/docx`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worksheet: ws, ...formData })
    })
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vocabulary_${formData.topic || 'worksheet'}.docx`
    a.click()
  }

  const handleGoogleDrive = () => alert('Connect Google Drive coming soon!')

  return (
    <div className="flex flex-col h-screen" style={{ background: '#FAF9F7' }}>

      {/* Top bar with tabs + export */}
      <div className="bg-white border-b border-gray-200 flex items-center px-4 gap-2" style={{ minHeight: 44 }}>
        {/* Tabs */}
        <div className="flex items-center gap-0 flex-1 overflow-x-auto">
          {tabs.map((tab, idx) => (
            <div
              key={tab.id || idx}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium cursor-pointer border-b-2 transition-all whitespace-nowrap ${
                idx === activeTabIdx
                  ? 'border-orange-500 text-gray-900'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
              onClick={() => setActiveTabIdx(idx)}
            >
              <span className="max-w-[160px] truncate">{tab.label}</span>
              <button
                onClick={e => { e.stopPropagation(); onCloseTab(idx) }}
                className="text-gray-300 hover:text-gray-500 leading-none"
              >
                ×
              </button>
            </div>
          ))}
          <button
            onClick={onNewTab}
            className="px-3 py-2 text-gray-300 hover:text-gray-600 text-sm leading-none"
          >
            +
          </button>
        </div>

        {/* Export */}
        <ExportDropdown
          onCopy={handleCopy}
          onPdf={handlePdf}
          onDocx={handleDocx}
          onGoogleDrive={handleGoogleDrive}
        />
      </div>

      {/* Toolbar */}
      <div className="bg-white border-b border-gray-100 flex items-center gap-0.5 px-4 py-1 text-gray-500 text-xs flex-wrap">
        <button title="Undo" onClick={() => document.execCommand('undo')} className="p-1.5 rounded hover:bg-gray-100 transition-colors">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 7H11a3 3 0 0 1 0 6H8"/><polyline points="6,4 3,7 6,10"/></svg>
        </button>
        <button title="Redo" onClick={() => document.execCommand('redo')} className="p-1.5 rounded hover:bg-gray-100 transition-colors">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M13 7H5a3 3 0 0 0 0 6h3"/><polyline points="10,4 13,7 10,10"/></svg>
        </button>
        <span className="w-px h-4 bg-gray-200 mx-1"/>
        <button title="Bold" onClick={() => document.execCommand('bold')} className="px-1.5 py-1 rounded hover:bg-gray-100 transition-colors font-bold text-sm">B</button>
        <button title="Italic" onClick={() => document.execCommand('italic')} className="px-1.5 py-1 rounded hover:bg-gray-100 transition-colors italic text-sm">I</button>
        <button title="Underline" onClick={() => document.execCommand('underline')} className="px-1.5 py-1 rounded hover:bg-gray-100 transition-colors underline text-sm">U</button>
        <button title="Strikethrough" onClick={() => document.execCommand('strikeThrough')} className="px-1.5 py-1 rounded hover:bg-gray-100 transition-colors line-through text-sm">S</button>
        <span className="w-px h-4 bg-gray-200 mx-1"/>
        <button title="Align Left" onClick={() => document.execCommand('justifyLeft')} className="p-1.5 rounded hover:bg-gray-100 transition-colors">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
            <rect x="1" y="3" width="14" height="1.5" rx="0.75"/><rect x="1" y="7" width="9" height="1.5" rx="0.75"/><rect x="1" y="11" width="11" height="1.5" rx="0.75"/>
          </svg>
        </button>
        <button title="Align Center" onClick={() => document.execCommand('justifyCenter')} className="p-1.5 rounded hover:bg-gray-100 transition-colors">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
            <rect x="1" y="3" width="14" height="1.5" rx="0.75"/><rect x="3.5" y="7" width="9" height="1.5" rx="0.75"/><rect x="2.5" y="11" width="11" height="1.5" rx="0.75"/>
          </svg>
        </button>
        <button title="Align Right" onClick={() => document.execCommand('justifyRight')} className="p-1.5 rounded hover:bg-gray-100 transition-colors">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
            <rect x="1" y="3" width="14" height="1.5" rx="0.75"/><rect x="6" y="7" width="9" height="1.5" rx="0.75"/><rect x="4" y="11" width="11" height="1.5" rx="0.75"/>
          </svg>
        </button>
        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={() => setShowAnswers(a => !a)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${
              showAnswers
                ? 'border-orange-300 text-orange-600 bg-orange-50'
                : 'border-gray-200 text-gray-500 hover:border-gray-300'
            }`}
          >
            📋 {showAnswers ? 'Student View' : 'Answer Key'}
          </button>
          {ws.rag_context_used && (
            <span className="px-2 py-0.5 rounded-full text-purple-600 bg-purple-50 font-medium">🧠 RAG</span>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 bg-gray-900 text-white text-sm rounded-xl shadow-lg">
          {toast}
        </div>
      )}

      {/* Main layout: Sidebar + Document */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar onAction={handleSidebarAction} activeAction={activeSidebar} />

        {/* History panel */}
        {showHistory && (
          <div className="w-72 border-r border-gray-200 bg-white flex flex-col flex-shrink-0" style={{ maxHeight: '100%' }}>
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <span className="text-sm font-semibold text-gray-800">
                {showAllHistory ? 'All History' : 'Recent (Last 7)'}
              </span>
              <button onClick={() => { setShowHistory(false); setActiveSidebar(null) }}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
            </div>
            <div className="overflow-y-auto flex-1">
              {history.length === 0
                ? <p className="px-4 py-6 text-xs text-gray-400 text-center">No worksheets generated yet.</p>
                : (showAllHistory ? history : history.slice(0, 7)).map((item, i) => (
                  <button
                    key={item.id || i}
                    onClick={() => {
                      onLoadFromHistory?.(item)
                      setShowHistory(false)
                      setActiveSidebar(null)
                    }}
                    className="w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-orange-50 transition-colors group"
                  >
                    <p className="text-xs font-semibold text-gray-800 truncate group-hover:text-orange-700">
                      {item.topic || 'Untitled'}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Grade {item.grade_level} · {formatDate(item.created_at)}
                    </p>
                  </button>
                ))
              }
            </div>
            {history.length > 0 && (
              <div className="px-4 py-2 border-t border-gray-100 flex-shrink-0">
                <button
                  onClick={() => setShowAllHistory(a => !a)}
                  className="text-xs text-orange-600 hover:text-orange-700 font-medium w-full text-center"
                >
                  {showAllHistory ? '↑ Show last 7 only' : `↓ View all ${history.length} worksheets`}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Document area */}
        <div className="flex-1 overflow-y-auto px-8 py-8">
          <div className="max-w-3xl mx-auto">

            {/* Document page */}
            <div
              key={showAnswers}
              ref={contentRef}
              contentEditable
              suppressContentEditableWarning
              className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 min-h-[800px] focus:outline-none"
            >
              {/* Title */}
              <h1 className="text-2xl font-bold text-gray-900 mb-1">
                Vocabulary Worksheet: {formData.topic || 'Vocabulary'}
              </h1>
              <p className="text-xs text-gray-400 mb-6">
                Grade: {formData.grade_level} · Objective: {formData.learning_objective}
              </p>
              <hr className="mb-6 border-gray-200" />

              {/* Section 1: Matching */}
              <div className="mb-8">
                <h2 className="text-base font-bold text-gray-800 mb-1">
                  {matching.title || 'Section 1: Matching'}
                </h2>
                <p className="text-sm text-gray-500 mb-4">{matching.instructions}</p>
                <table className="w-full text-sm border-collapse border border-gray-200">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="border border-gray-200 px-3 py-2 text-left font-semibold text-gray-600 w-12">Number</th>
                      <th className="border border-gray-200 px-3 py-2 text-left font-semibold text-gray-600">Term</th>
                      <th className="border border-gray-200 px-3 py-2 text-left font-semibold text-gray-600">Your Answer (blank ___)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(matching.items || []).map((item, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                        <td className="border border-gray-200 px-3 py-2 text-gray-400">{i + 1}</td>
                        <td className="border border-gray-200 px-3 py-2 font-medium text-gray-800">{item.word}</td>
                        <td className="border border-gray-200 px-3 py-2">
                          {showAnswers
                            ? <span className="text-amber-700 font-medium">{item.definition}</span>
                            : <span className="text-gray-200">_______________</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {/* Definitions (shuffled) */}
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {[...(matching.items || [])].sort(() => Math.random() - 0.5).map((item, i) => (
                    <div key={i} className="text-sm text-gray-600">
                      <span className="font-semibold text-gray-400">{String.fromCharCode(65 + i)}.</span> {item.definition}
                    </div>
                  ))}
                </div>
              </div>

              {/* Section 2: Fill in the Blank */}
              <div className="mb-8">
                <h2 className="text-base font-bold text-gray-800 mb-1">
                  {fib.title || 'Section 2: Fill in the Blank'}
                </h2>
                <p className="text-sm text-gray-500 mb-3">{fib.instructions}</p>
                {fib.word_bank && (
                  <div className="flex flex-wrap gap-2 mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <span className="text-xs font-semibold text-gray-500 w-full">Word Bank:</span>
                    {fib.word_bank.map((w, i) => (
                      <span key={i} className="text-xs px-2 py-1 bg-white border border-gray-200 rounded-md text-gray-700">
                        {w}
                      </span>
                    ))}
                  </div>
                )}
                <ol className="space-y-3">
                  {(fib.sentences || []).map((s, i) => (
                    <li key={i} className="text-sm text-gray-700">
                      <span className="font-medium text-gray-400 mr-2">{i + 1}.</span>
                      {s.sentence}
                      {showAnswers && s.answer && (
                        <span className="ml-2 px-2 py-0.5 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700 font-medium">
                          {s.answer}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              </div>

              {/* Section 3: Sentence Writing */}
              <div className="mb-4">
                <h2 className="text-base font-bold text-gray-800 mb-1">
                  {sw.title || 'Section 3: Write Your Own Sentences'}
                </h2>
                <p className="text-sm text-gray-500 mb-4">{sw.instructions}</p>
                <ol className="space-y-6">
                  {(sw.prompts || []).map((p, i) => (
                    <li key={i}>
                      <div className="text-sm font-semibold text-gray-800">
                        {i + 1}. <span style={{ color: '#E85D04' }}>{p.word}</span>
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">💡 {p.hint}</div>
                      <div className="text-xs text-gray-300 italic mt-0.5">{p.example}</div>
                      <div className="mt-2 border-b border-dashed border-gray-200 pb-4"></div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
