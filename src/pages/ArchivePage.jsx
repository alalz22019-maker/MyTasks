import { useState, useMemo } from 'react'
import { getEffectiveStatus, getStatusInfo } from '../constants'

/**
 * الأرشيف — مهام عهد مركز عمليات المختبرات (قبل ARCHIVE_CUTOFF)
 * عرض للقراءة فقط: بحث + فلترة بالحالة، بدون تعديل أو حذف.
 */
export default function ArchivePage({ archivedTasks }) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const filtered = useMemo(() => {
    let list = archivedTasks || []
    if (statusFilter !== 'all') list = list.filter(t => getEffectiveStatus(t) === statusFilter)
    const q = search.trim()
    if (q) {
      list = list.filter(t =>
        (t.title || '').includes(q) ||
        (t.person || '').includes(q) ||
        (t.projectName || '').includes(q)
      )
    }
    return list
  }, [archivedTasks, search, statusFilter])

  const total = (archivedTasks || []).length
  const completed = (archivedTasks || []).filter(t => getEffectiveStatus(t) === 'completed').length

  const formatDate = (d) => {
    if (!d) return ''
    try {
      const date = d.toDate ? d.toDate() : new Date(d)
      return date.toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' })
    } catch { return '' }
  }

  return (
    <div className="page" style={{ paddingBottom: 90 }}>
      <div style={{ padding: 16, maxWidth: 600, margin: '0 auto', direction: 'rtl' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <h2 style={{ color: 'var(--text)', margin: 0, fontSize: 20 }}>🗄 الأرشيف</h2>
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>{total} مهمة | {completed} مكتملة</span>
        </div>
        <p style={{ color: 'var(--text3)', fontSize: 12, margin: '0 0 14px' }}>
          مهام عهد مركز عمليات المختبرات — للاطلاع فقط، لا يمكن تعديلها من هنا.
        </p>

        <input
          placeholder="🔍 بحث بالعنوان أو الشخص أو الملف..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 10, boxSizing: 'border-box',
            border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)',
            fontSize: 14, marginBottom: 10, fontFamily: 'inherit',
          }}
        />

        <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
          {[{ value: 'all', label: 'الكل' },
            { value: 'completed', label: 'مكتمل' },
            { value: 'overdue', label: 'متأخر' },
            { value: 'in_progress', label: 'جاري العمل' },
            { value: 'not_started', label: 'لم يبدأ' }].map(f => (
            <button key={f.value} onClick={() => setStatusFilter(f.value)} style={{
              background: statusFilter === f.value ? '#3b82f6' : 'var(--bg3)',
              color: statusFilter === f.value ? '#fff' : 'var(--text2)',
              border: 'none', borderRadius: 8, padding: '6px 12px',
              fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}>{f.label}</button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text3)', padding: 40 }}>
            لا توجد مهام مطابقة في الأرشيف
          </div>
        ) : (
          filtered.map(t => {
            const status = getEffectiveStatus(t)
            const info = getStatusInfo(status)
            return (
              <div key={t.id} style={{
                background: 'var(--card)', borderRadius: 12, padding: 14, marginBottom: 8,
                border: '1px solid var(--border)', opacity: 0.85,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                  <span style={{
                    background: info.color, color: '#fff', borderRadius: 6,
                    padding: '2px 8px', fontSize: 11, fontWeight: 600,
                  }}>{info.label}</span>
                  {t.projectName && (
                    <span style={{
                      background: 'rgba(99,102,241,0.2)', color: '#a5b4fc',
                      borderRadius: 6, padding: '2px 8px', fontSize: 11,
                    }}>{t.projectName}</span>
                  )}
                </div>
                <p style={{ color: 'var(--text)', fontSize: 14, fontWeight: 700, margin: '4px 0' }}>{t.title}</p>
                {t.person && <p style={{ color: 'var(--text2)', fontSize: 13, margin: '4px 0' }}>👤 {t.person}</p>}
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {t.dueDate && <span style={{ color: 'var(--text3)', fontSize: 12 }}>📅 استحقاق: {t.dueDate}</span>}
                  {t.createdAt && <span style={{ color: 'var(--text3)', fontSize: 12 }}>🕐 أُنشئت: {formatDate(t.createdAt)}</span>}
                </div>
                {t.closeNote && <p style={{ color: 'var(--text2)', fontSize: 12, margin: '6px 0 0', lineHeight: 1.5 }}>📝 {t.closeNote}</p>}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
