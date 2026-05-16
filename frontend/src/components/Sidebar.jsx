import { useState, useRef, useEffect } from 'react'

const SIDEBAR_ITEMS = [
  { icon: '+', label: 'Create', color: '#E85D04' },
  { icon: '✦', label: 'Adapt', color: '#7c3aed' },
  { icon: '↺', label: 'Remix', color: '#0891b2' },
  { icon: '✓', label: 'Evaluate', color: '#16a34a' },
  { icon: '🖼', label: 'Images', color: '#db2777' },
  { icon: '⏱', label: 'History', color: '#d97706' },
]

const POPOVER_CONTENT = {
  Adapt: {
    title: 'Adapt',
    body: 'Change the grade level or topic to adapt this worksheet for a different group of students.',
    action: null,
  },
  Evaluate: {
    title: 'Evaluate',
    body: 'Student self-assessment tools and scoring rubrics — coming soon.',
    action: null,
  },
  Images: {
    title: 'Images',
    body: 'AI image generation for vocabulary cards — coming soon.',
    action: null,
  },
  History: {
    title: 'Session History',
    body: 'View past generated vocabulary worksheets for this session.',
    action: null,
  },
}

export default function Sidebar({ onAction, activeAction }) {
  const [openPopover, setOpenPopover] = useState(null)
  const popoverRef = useRef(null)

  useEffect(() => {
    const handler = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setOpenPopover(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleClick = (label) => {
    if (label === 'Create' || label === 'Remix') {
      onAction?.(label)
      setOpenPopover(null)
      return
    }
    setOpenPopover(prev => prev === label ? null : label)
  }

  return (
    <div className="relative flex flex-col items-center gap-1 py-4 border-r border-gray-200 bg-white flex-shrink-0"
      style={{ width: 64, minHeight: '100%', zIndex: 20 }}>
      {SIDEBAR_ITEMS.map(({ icon, label, color }) => (
        <div key={label} className="relative">
          <button
            title={label}
            onClick={() => handleClick(label)}
            className={`flex flex-col items-center justify-center gap-0.5 w-12 h-12 rounded-xl transition-all ${
              activeAction === label || openPopover === label
                ? 'bg-orange-50 text-orange-600'
                : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700'
            }`}
          >
            <span className="text-base leading-none">{icon}</span>
            <span className="text-[9px] font-medium leading-none">{label}</span>
          </button>

          {openPopover === label && POPOVER_CONTENT[label] && (
            <div
              ref={popoverRef}
              className="absolute left-14 top-0 bg-white border border-gray-200 rounded-xl shadow-xl p-4 z-50"
              style={{ width: 220 }}
            >
              <p className="text-xs font-bold text-gray-800 mb-1">{POPOVER_CONTENT[label].title}</p>
              <p className="text-xs text-gray-500 mb-3">{POPOVER_CONTENT[label].body}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
