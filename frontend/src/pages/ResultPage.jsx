import { useState, useRef, useEffect, useMemo } from 'react'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import DOMPurify from 'dompurify'
import Sidebar from '../components/Sidebar'
import ExportDropdown from '../components/ExportDropdown'
import EditorToolbar from '../components/EditorToolbar'
import HistoryPopup from '../components/HistoryPopup'

// Sanitize HTML before passing it to dangerouslySetInnerHTML. The HTML comes
// from contentEditable serialization that includes LLM-generated text — a
// poisoned source PDF/URL could prompt-inject the model into emitting
// `<img src=x onerror=...>` inside a vocab definition; once the teacher
// hits Save, the edited HTML becomes savedHTML and gets re-rendered on
// every subsequent view, turning it into stored XSS. DOMPurify strips any
// active script vectors before render.
const sanitizeHTML = (html) => DOMPurify.sanitize(html || '', { USE_PROFILES: { html: true } })

export default function ResultPage({ worksheet, formData, tabs, onNewTab, onCloseTab, onAdapt, onRemix, onLoadFromHistory, api }) {
  const [activeTabIdx, setActiveTabIdx] = useState(0)
  const [activeSidebar, setActiveSidebar] = useState(null)
  const [showAnswers, setShowAnswers] = useState(false)
  const [isEditMode, setIsEditMode] = useState(false)
  const [editableHTML, setEditableHTML] = useState(null)
  const [savedHTML, setSavedHTML] = useState(null)
  const editableRef = useRef(null)
  const [toast, setToast] = useState(null)
  const [history, setHistory] = useState([])
  const [showHistory, setShowHistory] = useState(false)
  const [showAllHistory, setShowAllHistory] = useState(false)
  const contentRef = useRef(null)

  // When a different worksheet is loaded (from history or a new generation),
  // clear any frozen edited HTML and reset to student view so the Answer Key
  // toggle works on the freshly-loaded worksheet.
  useEffect(() => {
    setSavedHTML(null)
    setShowAnswers(false)
    setIsEditMode(false)
    setEditableHTML(null)
  }, [worksheet])

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
    // Any action other than toggling Edit must first leave edit mode, otherwise
    // the editable overlay stays on top and the action appears to do nothing.
    if (label !== 'Edit' && isEditMode) {
      setIsEditMode(false)
    }

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
    if (label === 'Edit') {
      if (!isEditMode) {
        setEditableHTML(contentRef.current?.innerHTML || '')
        setIsEditMode(true)
        setActiveSidebar('Edit')
        setTimeout(() => { editableRef.current?.focus() }, 80)
      } else {
        setIsEditMode(false)
        setActiveSidebar(null)
      }
      return
    }
    if (label === 'Evaluate') {
      // Toggle answer-key view WITHOUT destroying savedHTML. The render
      // below now prefers the dynamic JSX when showAnswers=true, and the
      // saved (edited) HTML when showAnswers=false — so the teacher's
      // edits survive a flip to the answer key and back.
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
      // History now opens in a centered popup with a per-item Word-like editor + downloads.
      setShowHistory(true)
      setActiveSidebar('History')
      return
    }
  }

  const GRADE_WORD_LIMITS = {
    1: 5, 2: 8, 3: 12, 4: 15, 5: 20,
    6: 25, 7: 35, 8: 45, 9: 55, 10: 70, 11: 85, 12: 100,
  }
  const wordLimit = GRADE_WORD_LIMITS[formData.grade_level] || 35

  const ws = worksheet || {}
  const vocabWords = ws.vocab_words || []
  const matching = ws.matching_section || {}
  const fib = ws.fill_in_blank || {}
  const sw = ws.sentence_writing || {}

  // Deterministic shuffle of the matching definitions. We previously did
  // [...items].sort(() => Math.random() - 0.5) inline in JSX, which reshuffled
  // on every render — students would write "1=C", toggle the answer key, and
  // come back to find "C" pointing at a different definition. Cache the
  // shuffled order in useMemo keyed by the items themselves so it only
  // changes when the underlying worksheet changes.
  const shuffledDefinitions = useMemo(() => {
    const items = matching.items || []
    const arr = items.map((item, i) => ({ ...item, _origIdx: i }))
    // Fisher–Yates with a seed derived from the items so the order is stable
    // for the same worksheet across renders.
    const seed = items.map(it => (it.word || '') + '|' + (it.definition || '')).join(';')
    let h = 0
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
    const rand = () => { h = (h * 1103515245 + 12345) & 0x7fffffff; return h / 0x7fffffff }
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]]
    }
    return arr
  }, [matching.items])

  const handleCopy = async () => {
    const text = contentRef.current?.innerText || ''
    try {
      // navigator.clipboard is undefined on non-HTTPS origins (e.g. http://
      // LAN deploys). Fall back to a textarea + execCommand so the button
      // doesn't silently fail.
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text)
      } else {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.style.position = 'fixed'
        ta.style.left = '-9999px'
        document.body.appendChild(ta)
        ta.focus(); ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      setToast({ type: 'success', message: 'Copied to clipboard' })
    } catch (e) {
      setToast({ type: 'error', message: 'Copy failed — please select and copy manually' })
    }
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
      <div className="bg-white border-b border-gray-100 flex items-center gap-3 px-4 py-1 text-gray-500 text-xs">
        <button
          onClick={() => { setIsEditMode(false); setShowAnswers(a => !a) }}
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

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 bg-gray-900 text-white text-sm rounded-xl shadow-lg">
          {toast}
        </div>
      )}

      {/* Editor toolbar — outside scroll area so it stays fixed while scrolling */}
      {isEditMode && (
        <EditorToolbar onDone={() => { setSavedHTML(editableRef.current?.innerHTML || editableHTML); setIsEditMode(false); setActiveSidebar(null) }} />
      )}

      {/* Centered History popup with per-item Word-like editor + downloads */}
      <HistoryPopup
        open={showHistory}
        onClose={() => { setShowHistory(false); setActiveSidebar(null) }}
        api={api}
        onLoadFromHistory={(item) => onLoadFromHistory?.(item)}
      />

      {/* Main layout: Sidebar + Document */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar onAction={handleSidebarAction} activeAction={activeSidebar} />

        {/* Document area */}
        <div className="flex-1 overflow-y-auto px-8 py-8">
          <div className="max-w-3xl mx-auto">

            {/* Document page */}
            {isEditMode ? (
              <div
                ref={editableRef}
                contentEditable
                suppressContentEditableWarning
                dangerouslySetInnerHTML={{ __html: sanitizeHTML(editableHTML) }}
                className="bg-white rounded-xl shadow-sm border-2 border-dashed border-orange-400 p-10 min-h-[800px] focus:outline-none"
              />
            ) : (savedHTML && !showAnswers) ? (
              // Saved (edited) student view — only when answer key is OFF.
              // When showAnswers=true we want the dynamic JSX render below
              // so the answer key actually shows answers, but savedHTML is
              // preserved so flipping back to student view restores the edits.
              <div
                ref={contentRef}
                dangerouslySetInnerHTML={{ __html: sanitizeHTML(savedHTML) }}
                className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 min-h-[800px]"
              />
            ) : (
            <div
              ref={contentRef}
              className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 min-h-[800px]"
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
                            : <div contentEditable suppressContentEditableWarning className="min-h-[24px] px-1 text-sm text-gray-800 border-b-2 border-dashed border-gray-300 focus:outline-none focus:border-orange-400" />
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {/* Definitions (shuffled — stable for the same worksheet) */}
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {shuffledDefinitions.map((item, i) => (
                    <div key={item._origIdx} className="text-sm text-gray-600">
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
                <ol className="space-y-4">
                  {(fib.sentences || []).map((s, i) => (
                    <li key={i} className="text-sm text-gray-700">
                      <span className="font-medium text-gray-400 mr-2">{i + 1}.</span>
                      {s.sentence}
                      {showAnswers && s.answer && (
                        <span className="ml-2 px-2 py-0.5 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700 font-medium">
                          {s.answer}
                        </span>
                      )}
                      {!showAnswers && (
                        <div className="mt-1">
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-50 border border-orange-200" style={{ color: '#E85D04' }}>
                            Write the missing word
                          </span>
                          <div contentEditable suppressContentEditableWarning className="min-h-[28px] mt-1 px-1 text-sm text-gray-800 border-b-2 border-dashed border-gray-300 focus:outline-none focus:border-orange-400" />
                        </div>
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
                      {showAnswers ? (
                        <div className="mt-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded text-sm text-amber-700 font-medium">
                          {p.example}
                        </div>
                      ) : (
                        <div className="mt-2">
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-50 border border-orange-200" style={{ color: '#E85D04' }}>
                            Word limit: up to {wordLimit} words
                          </span>
                          <div contentEditable suppressContentEditableWarning className="min-h-[32px] mt-2 px-1 text-sm text-gray-800 border-b-2 border-dashed border-gray-300 focus:outline-none focus:border-orange-400" />
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}
