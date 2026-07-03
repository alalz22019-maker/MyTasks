import { useState, useMemo } from 'react'
import PullToRefresh from '../components/PullToRefresh'
import { useAuth } from '../contexts/AuthContext' // 🔴 استيراد الصلاحيات

/* ── استخراج كل الأسماء الفردية من جميع المهام ── */
function extractAllNames(tasks) {
  const freq = {}
  tasks.forEach(t => {
    if (!t.person?.trim()) return
    t.person.split(/[،,\/]/).map(p => p.trim()).filter(Boolean).forEach(p => {
      freq[p] = (freq[p] || 0) + 1
    })
  })
  return Object.entries(freq).sort((a, b) => b[1] - a[1]).map(([name]) => name)
}

/* ── دمج الأسماء في جميع المهام ── */
function applyMerge(tasks, selectedNames, canonical) {
  const sel = new Set(selectedNames)
  return tasks.map(t => {
    if (!t.person?.trim()) return t
    const parts = t.person.split(/[،,\/]/).map(p => p.trim()).filter(Boolean)
    const hasMatch = parts.some(p => sel.has(p))
    if (!hasMatch) return t
    const newParts = parts.map(p => sel.has(p) ? canonical : p)
    const unique = [...new Set(newParts)].filter(Boolean)
    return { ...t, person: unique.join(' / ') }
  })
}

import { updateTask as dbUpdateTask } from '../utils/db'

export default function ContactsPage({ contacts, tasks, showToast }) {
  const { isUser } = useAuth() // 🔴 جلب صلاحية الموظف

  const [mergeOpen, setMergeOpen]     = useState(false)
  const [selected,  setSelected]      = useState(new Set())
  const [canonical, setCanonical]     = useState('')

  const allNames = useMemo(() => extractAllNames(tasks), [tasks])

  function toggleName(name) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(name)) { next.delete(name) } else { next.add(name) }
      // auto-fill canonical with the most complete selected name
      const candidates = [...next].sort((a, b) => b.length - a.length)
      setCanonical(candidates[0] || '')
      return next
    })
  }

  async function doMerge() {
    if (selected.size < 2 || !canonical.trim()) return
    const updated = applyMerge(tasks, [...selected], canonical.trim())
    try {
      for (const t of updated) {
        const orig = tasks.find(o => o.id === t.id)
        if (orig && orig.person !== t.person) {
          await dbUpdateTask(t.id, { person: t.person })
        }
      }
      showToast(`✓ تم دمج ${selected.size} أسماء في "${canonical.trim()}"`)
    } catch (e) {
      showToast('❌ خطأ في الدمج')
    }
    setSelected(new Set())
    setCanonical('')
    setMergeOpen(false)
  }

  function shareWhatsApp(name) {
    const personTasks = tasks.filter(t => {
      if (!t.person || t.done) return false
      return t.person.split(/[،,\/]/).map(p => p.trim()).includes(name)
    })
    const msg = encodeURIComponent(
      `مرحباً ${name} 👋\n\nمهامك المعلقة (${personTasks.length}):\n` +
      personTasks.map((t, i) => `${i + 1}. ${t.title}${t.dueDate ? ` (${t.dueDate})` : ''}`).join('\n') +
      '\n\n— My Day'
    )
    window.open(`https://wa.me/?text=${msg}`, '_blank')
  }

  const initial = (name) => {
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) return parts[0][0] + parts[1][0]
    return name[0] || '?'
  }

  return (
    <PullToRefresh onRefresh={() => showToast('✓ محدّث')}>
      <div className="header">
        <div className="header-title">👥 جهات الاتصال</div>
        <div className="header-sub">تُضاف تلقائياً من المهام • {contacts.length} جهة</div>
      </div>

      {/* 🔴 إخفاء زر الدمج عن الموظف العادي */}
      {!isUser && (
        <div style={{ padding: '0 16px 12px' }}>
          <button
            onClick={() => { setMergeOpen(o => !o); setSelected(new Set()); setCanonical('') }}
            style={{
              width: '100%', padding: '11px 0', borderRadius: 12, border: '1px solid var(--border)',
              background: mergeOpen ? 'rgba(99,102,241,0.12)' : 'var(--bg3)',
              color: mergeOpen ? '#818cf8' : 'var(--text2)',
              fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            🔀 دمج الأسماء المتكررة {mergeOpen ? '▲' : '▼'}
          </button>
        </div>
      )}

      {/* 🔴 إخفاء لوحة الدمج بالكامل عن الموظف العادي */}
      {!isUser && mergeOpen && (
        <div style={{ margin: '0 16px 16px', background: 'var(--card)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>

          <div style={{ padding: '12px 14px 8px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>اختر الأسماء التي تمثّل نفس الشخص</div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>اختر اثنين أو أكثر → حدد الاسم الصحيح → اضغط دمج</div>
          </div>

          {/* قائمة الأسماء */}
          <div style={{ maxHeight: 280, overflowY: 'auto', padding: '8px 0' }}>
            {allNames.map(name => {
              const isSelected = selected.has(name)
              return (
                <div
                  key={name}
                  onClick={() => toggleName(name)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 14px', cursor: 'pointer',
                    background: isSelected ? 'rgba(99,102,241,0.08)' : 'transparent',
                    borderBottom: '1px solid var(--border)',
                    transition: 'background 0.15s',
                  }}
                >
                  <div style={{
                    width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                    border: `2px solid ${isSelected ? '#6366f1' : 'var(--border)'}`,
                    background: isSelected ? '#6366f1' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {isSelected && <span style={{ color: '#fff', fontSize: 12, lineHeight: 1 }}>✓</span>}
                  </div>
                  <div style={{ flex: 1, fontSize: 13, fontWeight: isSelected ? 600 : 400 }}>{name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                    {tasks.filter(t => t.person?.split(/[،,\/]/).map(p => p.trim()).includes(name)).length} مهمة
                  </div>
                </div>
              )
            })}
          </div>

          {/* حقل الاسم الكانوني + زر الدمج */}
          {selected.size >= 2 && (
            <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 600 }}>
                الاسم الذي سيُوحَّد عليه ({selected.size} أسماء مختارة):
              </div>
              <input
                value={canonical}
                onChange={e => setCanonical(e.target.value)}
                placeholder="الاسم الصحيح..."
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 10,
                  border: '1px solid var(--border)', background: 'var(--bg)',
                  color: 'var(--text)', fontSize: 14, fontFamily: 'inherit',
                  outline: 'none', direction: 'rtl', boxSizing: 'border-box',
                }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                {[...selected].map(n => (
                  <span key={n} style={{
                    fontSize: 11, padding: '3px 8px', borderRadius: 20,
                    background: 'rgba(99,102,241,0.12)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)',
                  }}>{n}</span>
                ))}
                <span style={{ fontSize: 11, color: 'var(--text3)', alignSelf: 'center' }}>← {canonical || '...'}</span>
              </div>
              <button
                onClick={doMerge}
                disabled={!canonical.trim()}
                style={{
                  padding: '12px 0', borderRadius: 10, border: 'none',
                  background: canonical.trim() ? '#6366f1' : 'var(--bg3)',
                  color: canonical.trim() ? '#fff' : 'var(--text3)',
                  fontSize: 14, fontWeight: 700, cursor: canonical.trim() ? 'pointer' : 'default',
                  fontFamily: 'inherit',
                }}
              >
                🔀 دمج الآن في كل المهام
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── قائمة جهات الاتصال ── */}
      {contacts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">👥</div>
          <div className="empty-text">لا توجد جهات اتصال</div>
          <div className="empty-sub">أضف أشخاصاً في المهام وستظهر هنا تلقائياً</div>
        </div>
      ) : (
        <div className="contact-list">
          {contacts.map(c => {
            const pending = c.tasks.filter(t => !t.done).length
            const done    = c.tasks.filter(t => t.done).length
            return (
              <div key={c.name} className="contact-card">
                <div className="contact-avatar">{initial(c.name)}</div>
                <div className="contact-info">
                  <div className="contact-name">{c.name}</div>
                  <div className="contact-tasks">
                    {pending > 0 && <span style={{ color: 'var(--orange)' }}>{pending} معلقة</span>}
                    {pending > 0 && done > 0 && ' • '}
                    {done > 0 && <span style={{ color: 'var(--green)' }}>{done} مكتملة</span>}
                  </div>
                </div>
                <button className="contact-wa" onClick={() => shareWhatsApp(c.name)} title="مشاركة عبر واتساب">
                  💬
                </button>
              </div>
            )
          })}
        </div>
      )}
    </PullToRefresh>
  )
}
