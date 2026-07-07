import { useState, useMemo, useRef } from 'react'
import PullToRefresh from '../components/PullToRefresh'
import ComprehensiveReport from '../components/ComprehensiveReport'
import { D, KPI_PALETTE, CARD, formatDates } from '../components/VisualSummaryColors'
import { exportPNG, exportPDF, shareImage } from '../components/VisualSummaryExport'
import { useAuth } from '../contexts/AuthContext' 

/* ─── helpers ─────────────────────────────────────────────── */
const TODAY_START = (() => { const d = new Date(); d.setHours(0,0,0,0); return d })()
const TODAY_END   = (() => { const d = new Date(); d.setHours(23,59,59,999); return d })()

function isCompletedToday(t) {
  if (!t.done || !t.completedAt) return false
  const c = new Date(t.completedAt)
  return c >= TODAY_START && c <= TODAY_END
}

function isOverdue(t) {
  if (t.done || !t.dueDate) return false
  return new Date(t.dueDate) < TODAY_START
}

const LAST_24H = new Date(Date.now() - 24 * 60 * 60 * 1000)

function isCompletedLast24h(t) {
  if (!t.done || !t.completedAt) return false
  return new Date(t.completedAt) >= LAST_24H
}

function isDueToday(t) {
  if (t.done || !t.dueDate) return false
  const d = new Date(t.dueDate); d.setHours(0,0,0,0)
  return d.getTime() === TODAY_START.getTime()
}

function formatArabicDate(date = new Date()) {
  return date.toLocaleDateString('ar-SA', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  })
}

function formatShortDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('ar-SA', { day: 'numeric', month: 'short' })
}

/* ─── Build WhatsApp text ─────────────────────────────────── */
function buildWhatsAppText(tasks, userName) {
  const all     = tasks
  const urgent  = all.filter(t => t.priority === 'urgent' && !t.done)
  const today   = all.filter(isCompletedToday)
  const overdue = all.filter(isOverdue)
  const total   = all.length
  const done    = all.filter(t => t.done).length
  const pct     = total ? Math.round((done / total) * 100) : 0

  const persons = {}
  all.forEach(t => {
    if (!t.person) return
    t.person.split(/[،,]/).map(p => p.trim()).filter(Boolean).forEach(p => {
      if (!persons[p]) persons[p] = { total: 0, done: 0 }
      persons[p].total++
      if (t.done) persons[p].done++
    })
  })

  const sep = '━━━━━━━━━━━━━━━━'
  const lines = []

  lines.push(`📋 *تقرير المهام اليومي*`)
  lines.push(`🗓 ${formatArabicDate()}`)
  lines.push(`👤 ${userName || 'مستخدم'} | الأداء والتحليلات P&A`)
  lines.push(sep)

  lines.push(`📊 *الملخص التنفيذي*`)
  lines.push(`• إجمالي المهام: ${total}`)
  lines.push(`• نسبة الإنجاز: ${pct}%`)
  lines.push(`• عاجلة معلقة: ${urgent.length}`)
  lines.push(`• أنجز اليوم: ${today.length}`)
  if (overdue.length) lines.push(`• متأخرة عن موعدها: ${overdue.length}`)

  if (urgent.length) {
    lines.push(sep)
    lines.push(`🔴 *المهام العاجلة المعلقة* (${urgent.length})`)
    urgent.slice(0, 10).forEach((t, i) => {
      lines.push(`${i + 1}. ${t.title}`)
      if (t.person) lines.push(`   👤 ${t.person}`)
      if (t.dueDate) lines.push(`   📅 ${formatShortDate(t.dueDate)}`)
    })
    if (urgent.length > 10) lines.push(`   ... و${urgent.length - 10} مهام أخرى`)
  }

  if (today.length) {
    lines.push(sep)
    lines.push(`✅ *أنجز اليوم* (${today.length})`)
    today.forEach(t => {
      lines.push(`✓ ${t.title}`)
      if (t.person) lines.push(`  👤 ${t.person}`)
    })
  }

  if (overdue.length) {
    lines.push(sep)
    lines.push(`⚠️ *متأخرة عن موعدها* (${overdue.length})`)
    overdue.slice(0, 5).forEach(t => {
      lines.push(`• ${t.title} — ${formatShortDate(t.dueDate)}`)
    })
  }

  const personEntries = Object.entries(persons).sort((a,b) => b[1].total - a[1].total)
  if (personEntries.length) {
    lines.push(sep)
    lines.push(`👥 *المهام حسب المسؤول*`)
    personEntries.slice(0, 8).forEach(([name, v]) => {
      const filled = Math.round((v.done / v.total) * 5)
      const bar = '▓'.repeat(filled) + '░'.repeat(5 - filled)
      lines.push(`• ${name}: ${v.total} مهمة (${v.done} مكتملة) ${bar}`)
    })
  }

  lines.push(sep)
  lines.push(`_تم إصداره عبر My Day_`)

  return lines.join('\n')
}

/* ─── Build Brief WhatsApp text ──────────────────────────── */
function buildBriefText(tasks) {
  const urgentP  = tasks.filter(t => t.priority === 'urgent' && !t.done)
  const dueT     = tasks.filter(isDueToday).filter(t => t.priority !== 'urgent')
  const overdueT = tasks.filter(isOverdue).filter(t => t.priority !== 'urgent')
  const done24h  = tasks.filter(isCompletedLast24h)
  const sep = '━━━━━━━━━━━━━━━━'
  const lines = []

  lines.push(`⚡ *الموجز اليومي*`)
  lines.push(`🗓 ${formatArabicDate()}`)
  lines.push(sep)

  const totalToday = urgentP.length + dueT.length + overdueT.length
  lines.push(`📌 *ما يجب إنجازه اليوم* (${totalToday})`)
  if (totalToday === 0) {
    lines.push(`• لا توجد مهام معلقة`)
  } else {
    urgentP.forEach((t, i) => {
      lines.push(`🔴 ${i + 1}. ${t.title}`)
      if (t.person) lines.push(`   👤 ${t.person}`)
    })
    dueT.forEach((t, i) => {
      lines.push(`🔵 ${urgentP.length + i + 1}. ${t.title}`)
      if (t.person) lines.push(`   👤 ${t.person}`)
    })
    overdueT.forEach((t, i) => {
      lines.push(`⚠️ ${urgentP.length + dueT.length + i + 1}. ${t.title}`)
      if (t.person) lines.push(`   👤 ${t.person}`)
    })
  }

  lines.push(sep)
  lines.push(`✅ *أنجز خلال آخر ٢٤ ساعة* (${done24h.length})`)
  if (done24h.length === 0) {
    lines.push(`• لا توجد إنجازات`)
  } else {
    done24h.forEach(t => {
      lines.push(`✓ ${t.title}`)
      if (t.person) lines.push(`  👤 ${t.person}`)
    })
  }

  lines.push(sep)
  lines.push(`_تم إصداره عبر My Day_`)
  return lines.join('\n')
}

/* ─── Build Weekly Report WhatsApp text ─────────────────── */
function buildWeeklyReport(tasks, userName) {
  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  
  const all = tasks
  const total = all.length
  const doneCount = all.filter(t => t.done).length
  const pct = total ? Math.round((doneCount / total) * 100) : 0

  // Completed this week
  const completedThisWeek = all.filter(t => {
    if (!t.done || !t.completedAt) return false
    return new Date(t.completedAt) >= weekAgo
  })

  // Overdue
  const overdue = all.filter(t => !t.done && t.dueDate && new Date(t.dueDate) < now)

  // Urgent pending
  const urgent = all.filter(t => t.priority === 'urgent' && !t.done)

  // By person
  const personMap = {}
  all.forEach(t => {
    if (!t.person) return
    t.person.split(/[،,]/).map(p => p.trim()).filter(Boolean).forEach(p => {
      if (!personMap[p]) personMap[p] = { total: 0, done: 0, thisWeek: 0 }
      personMap[p].total++
      if (t.done) personMap[p].done++
      if (t.done && t.completedAt && new Date(t.completedAt) >= weekAgo) personMap[p].thisWeek++
    })
  })
  const persons = Object.entries(personMap).sort((a, b) => b[1].thisWeek - a[1].thisWeek)

  // By project
  const projectMap = {}
  all.forEach(t => {
    const proj = t.projectName?.trim() || 'بدون مشروع'
    if (!projectMap[proj]) projectMap[proj] = { total: 0, done: 0 }
    projectMap[proj].total++
    if (t.done) projectMap[proj].done++
  })
  const projects = Object.entries(projectMap).sort((a, b) => b[1].total - a[1].total)

  const sep = '━━━━━━━━━━━━━━━━'
  const lines = []

  lines.push(`📊 *التقرير الأسبوعي*`)
  lines.push(`🗓 ${formatArabicDate()}`)
  lines.push(`👤 ${userName || 'مستخدم'} | الأداء والتحليلات P&A`)
  lines.push(sep)

  lines.push(`📈 *مؤشرات الأداء*`)
  lines.push(`• إجمالي المهام: ${total}`)
  lines.push(`• نسبة الإنجاز الكلية: ${pct}%`)
  lines.push(`• أنجز هذا الأسبوع: ${completedThisWeek.length}`)
  lines.push(`• عاجلة معلقة: ${urgent.length}`)
  lines.push(`• متأخرة: ${overdue.length}`)

  if (completedThisWeek.length) {
    lines.push(sep)
    lines.push(`✅ *إنجازات الأسبوع* (${completedThisWeek.length})`)
    completedThisWeek.slice(0, 15).forEach((t, i) => {
      lines.push(`${i + 1}. ${t.title}`)
      if (t.person) lines.push(`   👤 ${t.person}`)
    })
    if (completedThisWeek.length > 15) lines.push(`   ... و${completedThisWeek.length - 15} أخرى`)
  }

  if (urgent.length) {
    lines.push(sep)
    lines.push(`🔴 *عاجلة معلقة* (${urgent.length})`)
    urgent.slice(0, 8).forEach((t, i) => {
      lines.push(`${i + 1}. ${t.title}`)
      if (t.person) lines.push(`   👤 ${t.person}`)
    })
  }

  if (overdue.length) {
    lines.push(sep)
    lines.push(`⚠️ *متأخرة عن الموعد* (${overdue.length})`)
    overdue.slice(0, 8).forEach((t, i) => {
      lines.push(`${i + 1}. ${t.title} — ${formatShortDate(t.dueDate)}`)
    })
  }

  if (persons.length) {
    lines.push(sep)
    lines.push(`👥 *أداء الفريق هذا الأسبوع*`)
    persons.slice(0, 10).forEach(([name, v]) => {
      const p = v.total ? Math.round((v.done / v.total) * 100) : 0
      const bar = '▓'.repeat(Math.round(p / 20)) + '░'.repeat(5 - Math.round(p / 20))
      lines.push(`• ${name}: أنجز ${v.thisWeek} هذا الأسبوع (${p}% كلي) ${bar}`)
    })
  }

  if (projects.length > 1) {
    lines.push(sep)
    lines.push(`📁 *المشاريع*`)
    projects.slice(0, 6).forEach(([name, v]) => {
      const p = v.total ? Math.round((v.done / v.total) * 100) : 0
      lines.push(`• ${name}: ${v.done}/${v.total} (${p}%)`)
    })
  }

  lines.push(sep)
  lines.push(`_تم إصداره عبر My Day_`)
  return lines.join('\n')
}

/* ─── StatCard ────────────────────────────────────────────── */
function StatCard({ value, label, color }) {
  return (
    <div className="report-card">
      <div className="report-card-num" style={{
        background: `linear-gradient(135deg, ${color}, ${color}88)`,
        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text'
      }}>{value}</div>
      <div className="report-card-label">{label}</div>
    </div>
  )
}

/* ─── TaskRow ─────────────────────────────────────────────── */
function TaskRow({ t, accent }) {
  const isUrgent  = t.priority === 'urgent' && !t.done
  const isLate    = isOverdue(t)
  const borderColor = isUrgent ? '#ef4444' : isLate ? '#f97316' : accent
  const statusIcon  = isUrgent ? '🔴' : isLate ? '⚠️' : null

  return (
    <div style={{
      background: 'var(--card)', borderRadius: 12, padding: '12px 14px',
      marginBottom: 8, borderRight: `3px solid ${borderColor}`,
      boxShadow: isUrgent
        ? '0 0 0 1px rgba(239,68,68,0.15)'
        : isLate
        ? '0 0 0 1px rgba(249,115,22,0.15)'
        : 'none',
    }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, display: 'flex', gap: 6, alignItems: 'center' }}>
        {statusIcon && <span style={{ fontSize: 13, flexShrink: 0 }}>{statusIcon}</span>}
        <span>{t.title}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12, color: 'var(--text2)' }}>
        {t.person && <span>👤 {t.person}</span>}
        {t.dueDate && <span>📅 {formatShortDate(t.dueDate)}</span>}
      </div>
    </div>
  )
}

/* ─── PersonRow ───────────────────────────────────────────── */
function PersonRow({ name, total, done }) {
  const pct = total ? Math.round((done / total) * 100) : 0
  return (
    <div style={{
      background: 'var(--card)', borderRadius: 12, padding: '12px 14px', marginBottom: 8,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12
    }}>
      <div style={{ fontSize: 14, fontWeight: 500, minWidth: 0, flex: 1,
        overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
        {name}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: 12, color: 'var(--text2)' }}>{done}/{total}</span>
        <div style={{ width: 60, height: 6, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${pct}%`,
            background: pct === 100 ? '#10b981' : '#3b82f6', borderRadius: 3
          }} />
        </div>
        <span style={{ fontSize: 12, color: 'var(--text3)', width: 32, textAlign: 'left' }}>{pct}%</span>
      </div>
    </div>
  )
}

/* ─── DailyBriefCard ──────────────────────────────────────── */
function DailyBriefCard({ tasks }) {
  const cardRef   = useRef(null)
  const [exporting, setExporting] = useState(false)

  const all       = tasks
  const total     = all.length
  const doneCount = all.filter(t => t.done).length
  const pct       = total ? Math.round((doneCount / total) * 100) : 0
  const urgentP   = all.filter(t => t.priority === 'urgent' && !t.done)
  const dueT      = all.filter(isDueToday)
  const overdueT  = all.filter(isOverdue)
  const done24h   = all.filter(isCompletedLast24h)

  const persons = (() => {
    const map = {}
    all.forEach(t => {
      if (!t.person) return
      t.person.split(/[،,]/).map(p => p.trim()).filter(Boolean).forEach(p => {
        if (!map[p]) map[p] = { total: 0, done: 0 }
        map[p].total++
        if (t.done) map[p].done++
      })
    })
    return Object.entries(map).sort((a,b) => b[1].total - a[1].total)
  })()

  const { hijri, gregorianEn } = formatDates()
  const barColor = pct >= 70 ? D.green : pct >= 40 ? D.yellow : D.red

  const kpis = [
    { label: 'إجمالي المهام',       value: total,          icon: '📋', color: 'blue'   },
    { label: 'متأخرة',              value: overdueT.length, icon: '⚡', color: 'red'    },
    { label: 'مستحقة اليوم',        value: dueT.length,    icon: '📅', color: 'yellow' },
    { label: 'أنجز آخر ٢٤ ساعة',   value: done24h.length, icon: '✅', color: 'green'  },
    { label: 'عاجلة معلقة',         value: urgentP.length, icon: '🔴', color: 'red'    },
    { label: 'نسبة الإنجاز',        value: `${pct}%`,      icon: '📊', color: 'blue'   },
  ]

  async function withExport(fn) {
    if (!cardRef.current) return
    setExporting(true)
    try { await fn(cardRef.current) }
    catch (e) { console.error(e) }
    finally { setExporting(false) }
  }

  function shareBrief() {
    const text    = buildBriefText(tasks)
    const encoded = encodeURIComponent(text)
    window.open(`https://wa.me/?text=${encoded}`, '_blank')
  }

  function TaskItem({ t, accent }) {
    const col = KPI_PALETTE[accent] || KPI_PALETTE.gray
    return (
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        padding: '10px 12px', marginBottom: 6,
        background: col.bg, borderRadius: 10,
        border: `1px solid ${col.color}20`,
      }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: col.color, flexShrink: 0, marginTop: 5,
        }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: D.text, lineHeight: 1.5 }}>{t.title}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 3 }}>
            {t.person && (
              <span style={{ fontSize: 10, color: D.text2 }}>👤 {t.person}</span>
            )}
            {t.dueDate && (
              <span style={{ fontSize: 10, color: col.color }}>📅 {formatShortDate(t.dueDate)}</span>
            )}
          </div>
        </div>
      </div>
    )
  }

  function SectionHead({ icon, label, count, color }) {
    const col = KPI_PALETTE[color] || KPI_PALETTE.gray
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <span style={{ fontSize: 13 }}>{icon}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: col.color, flex: 1 }}>{label}</span>
        <div style={{
          background: col.bg, border: `1px solid ${col.color}40`,
          borderRadius: 20, padding: '1px 8px',
          fontSize: 11, fontWeight: 700, color: col.color,
        }}>{count}</div>
      </div>
    )
  }

  return (
    <div style={{ padding: '0 16px 32px', direction: 'rtl' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button onClick={() => withExport(exportPDF)} disabled={exporting} style={{
          flex: 1, padding: '11px 0', borderRadius: 12, border: 'none',
          background: D.green, color: '#fff', fontSize: 14, fontWeight: 700,
          cursor: exporting ? 'default' : 'pointer', fontFamily: 'inherit', opacity: exporting ? 0.6 : 1,
        }}>📄 PDF</button>
        <button onClick={() => withExport(exportPNG)} disabled={exporting} style={{
          flex: 1, padding: '11px 0', borderRadius: 12, border: 'none',
          background: D.blue, color: '#fff', fontSize: 14, fontWeight: 700,
          cursor: exporting ? 'default' : 'pointer', fontFamily: 'inherit', opacity: exporting ? 0.6 : 1,
        }}>🖼️ صورة</button>
        <button onClick={shareBrief} style={{
          flex: 1, padding: '11px 0', borderRadius: 12, border: 'none',
          background: '#25D366', color: '#fff', fontSize: 14, fontWeight: 700,
          cursor: 'pointer', fontFamily: 'inherit',
        }}>📤 واتساب</button>
      </div>

      <div ref={cardRef} style={{
        background: D.bg, borderRadius: 20,
        fontFamily: "'IBM Plex Sans Arabic','Segoe UI',system-ui,sans-serif",
        boxShadow: '0 4px 24px rgba(0,107,63,0.13)',
        border: `1px solid ${D.border}`,
      }}>
        <div style={{
          background: 'linear-gradient(135deg, #004D2C 0%, #006B3F 100%)',
          borderRadius: '20px 20px 0 0', padding: '18px 20px 16px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <div>
              <div style={{ color: '#fff', fontSize: 17, fontWeight: 900, lineHeight: 1.2, marginBottom: 3 }}>
                الموجز اليومي
              </div>
              <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 10 }}>
                My Day
              </div>
            </div>
            <div style={{
              background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: 8, padding: '4px 10px',
              fontSize: 10, fontWeight: 700, color: '#fff',
            }}>⚡ يومي</div>
          </div>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.2)', marginBottom: 10 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.9)' }}>📅</span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.9)', fontWeight: 600 }}>{hijri}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>📆</span>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', direction: 'ltr' }}>{gregorianEn}</span>
            </div>
          </div>
        </div>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {kpis.map((kpi, i) => {
              const col = KPI_PALETTE[kpi.color] || KPI_PALETTE.gray
              return (
                <div key={i} style={{
                  background: col.bg, border: `1px solid ${col.color}30`,
                  borderRadius: 14, padding: '12px 13px',
                  boxShadow: `0 2px 10px ${col.glow}`,
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 10,
                    background: `${col.color}15`, border: `1px solid ${col.color}25`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 18, flexShrink: 0,
                  }}>{kpi.icon}</div>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: col.color, lineHeight: 1 }}>{kpi.value}</div>
                    <div style={{ fontSize: 10, color: D.text2, marginTop: 2 }}>{kpi.label}</div>
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{
            background: CARD.background, borderRadius: CARD.borderRadius,
            border: `1px solid ${D.border}`, padding: CARD.padding, boxShadow: CARD.boxShadow,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 13 }}>📊</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: D.blue }}>تقدم الإنجاز</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 800, color: barColor }}>{pct}%</span>
            </div>
            <div style={{ height: 8, background: D.bg3, borderRadius: 99, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${pct}%`, borderRadius: 99,
                background: pct >= 70
                  ? 'linear-gradient(90deg,#006B3F,#28A265)'
                  : pct >= 40
                  ? 'linear-gradient(90deg,#D4770A,#F59E0B)'
                  : 'linear-gradient(90deg,#C0392B,#E74C3C)',
              }} />
            </div>
          </div>

          {dueT.length > 0 && (
            <div style={{ background: CARD.background, borderRadius: CARD.borderRadius, border: `1px solid ${D.border}`, padding: CARD.padding, boxShadow: CARD.boxShadow }}>
              <SectionHead icon="📅" label="مستحقة اليوم" count={dueT.length} color="yellow" />
              {dueT.map(t => <TaskItem key={t.id} t={t} accent="yellow" />)}
            </div>
          )}

          {overdueT.length > 0 && (
            <div style={{ background: CARD.background, borderRadius: CARD.borderRadius, border: `1px solid ${D.border}`, padding: CARD.padding, boxShadow: CARD.boxShadow }}>
              <SectionHead icon="⚡" label="متأخرة عن الموعد" count={overdueT.length} color="red" />
              {overdueT.map(t => <TaskItem key={t.id} t={t} accent="red" />)}
            </div>
          )}

          {done24h.length > 0 && (
            <div style={{
              background: 'linear-gradient(135deg, rgba(0,107,63,0.08), rgba(16,185,129,0.05))',
              border: `1px solid rgba(0,107,63,0.22)`,
              borderRadius: 14, padding: '14px 16px',
            }}>
              <SectionHead icon="✅" label="أنجز خلال آخر ٢٤ ساعة" count={done24h.length} color="green" />
              {done24h.map(t => (
                <div key={t.id} style={{ display: 'flex', gap: 8, marginBottom: 5, alignItems: 'flex-start' }}>
                  <span style={{ color: D.green, fontSize: 11, flexShrink: 0, lineHeight: 1.5 }}>✓</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: D.text, lineHeight: 1.5, textDecoration: 'line-through', textDecorationColor: D.green }}>{t.title}</div>
                    {t.person && <div style={{ fontSize: 10, color: D.text2, marginTop: 2 }}>👤 {t.person}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {persons.length > 0 && (
            <div style={{ background: CARD.background, borderRadius: CARD.borderRadius, border: `1px solid ${D.border}`, padding: CARD.padding, boxShadow: CARD.boxShadow }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <span style={{ fontSize: 13 }}>👥</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: D.purple }}>الأداء حسب المسؤول</span>
              </div>
              {persons.map(([name, v]) => {
                const p = v.total ? Math.round((v.done / v.total) * 100) : 0
                const pc = p === 100 ? KPI_PALETTE.green : p >= 50 ? KPI_PALETTE.blue : KPI_PALETTE.yellow
                return (
                  <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: D.text, flex: 1, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <span style={{ fontSize: 11, color: D.text2 }}>{v.done}/{v.total}</span>
                      <div style={{ width: 60, height: 6, background: D.bg3, borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${p}%`, background: pc.color, borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 11, color: pc.color, fontWeight: 700, width: 30, textAlign: 'left' }}>{p}%</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div style={{ textAlign: 'center', paddingTop: 4 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: D.green }}>My Day</div>
            <div style={{ fontSize: 10, color: D.text3, marginTop: 2 }}>
              {new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })} • {hijri}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Main Page ───────────────────────────────────────────── */
/* ─── WeeklyReportTab ─────────────────────────────────────── */
function WeeklyReportTab({ tasks, userName }) {
  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const all = tasks
  const total = all.length
  const doneCount = all.filter(t => t.done).length
  const pct = total ? Math.round((doneCount / total) * 100) : 0

  const completedThisWeek = all.filter(t => {
    if (!t.done || !t.completedAt) return false
    return new Date(t.completedAt) >= weekAgo
  })
  const overdue = all.filter(t => !t.done && t.dueDate && new Date(t.dueDate) < now)
  const urgent = all.filter(t => t.priority === 'urgent' && !t.done)

  const personMap = {}
  all.forEach(t => {
    if (!t.person) return
    t.person.split(/[،,]/).map(p => p.trim()).filter(Boolean).forEach(p => {
      if (!personMap[p]) personMap[p] = { total: 0, done: 0, thisWeek: 0 }
      personMap[p].total++
      if (t.done) personMap[p].done++
      if (t.done && t.completedAt && new Date(t.completedAt) >= weekAgo) personMap[p].thisWeek++
    })
  })
  const persons = Object.entries(personMap).sort((a, b) => b[1].thisWeek - a[1].thisWeek)

  const projectMap = {}
  all.forEach(t => {
    const proj = t.projectName?.trim() || 'بدون مشروع'
    if (!projectMap[proj]) projectMap[proj] = { total: 0, done: 0 }
    projectMap[proj].total++
    if (t.done) projectMap[proj].done++
  })
  const projects = Object.entries(projectMap).sort((a, b) => b[1].total - a[1].total)

  function shareWeekly() {
    const text = buildWeeklyReport(tasks, userName)
    const encoded = encodeURIComponent(text)
    window.open(`https://wa.me/?text=${encoded}`, '_blank')
  }

  function copyWeekly() {
    const text = buildWeeklyReport(tasks, userName)
    navigator.clipboard?.writeText(text)
  }

  const kpis = [
    { label: 'إجمالي',     value: total,                  icon: '📋', color: '#3b82f6' },
    { label: 'إنجاز كلي',  value: `${pct}%`,              icon: '📊', color: '#10b981' },
    { label: 'أنجز الأسبوع', value: completedThisWeek.length, icon: '✅', color: '#059669' },
    { label: 'عاجلة',      value: urgent.length,           icon: '🔴', color: '#ef4444' },
    { label: 'متأخرة',     value: overdue.length,          icon: '⚠️', color: '#f59e0b' },
  ]

  return (
    <div style={{ padding: '0 16px 32px', direction: 'rtl' }}>
      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button onClick={shareWeekly} style={{
          flex: 1, padding: '11px 0', borderRadius: 12, border: 'none',
          background: '#25D366', color: '#fff', fontSize: 14, fontWeight: 700,
          cursor: 'pointer', fontFamily: 'inherit',
        }}>📤 واتساب</button>
        <button onClick={copyWeekly} style={{
          flex: 1, padding: '11px 0', borderRadius: 12, border: 'none',
          background: '#3b82f6', color: '#fff', fontSize: 14, fontWeight: 700,
          cursor: 'pointer', fontFamily: 'inherit',
        }}>📋 نسخ</button>
      </div>

      {/* KPI Grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16,
      }}>
        {kpis.map((kpi, i) => (
          <div key={i} style={{
            background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 14, padding: '14px 13px',
            display: 'flex', alignItems: 'center', gap: 10,
            ...(i === kpis.length - 1 && kpis.length % 2 !== 0 ? { gridColumn: '1 / -1' } : {}),
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: `${kpi.color}12`, border: `1px solid ${kpi.color}25`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, flexShrink: 0,
            }}>{kpi.icon}</div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 900, color: kpi.color, lineHeight: 1 }}>{kpi.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{kpi.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Completed this week */}
      {completedThisWeek.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{
            fontSize: 14, fontWeight: 700, color: '#059669', marginBottom: 8,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span>✅</span> إنجازات الأسبوع
            <span style={{
              background: 'rgba(16,185,129,0.12)', borderRadius: 20, padding: '1px 8px',
              fontSize: 12, fontWeight: 700, color: '#059669',
            }}>{completedThisWeek.length}</span>
          </div>
          {completedThisWeek.slice(0, 10).map(t => (
            <div key={t.id} style={{
              background: 'var(--card)', borderRadius: 10, padding: '10px 12px',
              marginBottom: 6, borderRight: '3px solid #10b981',
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{t.title}</div>
              {t.person && <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 3 }}>👤 {t.person}</div>}
            </div>
          ))}
          {completedThisWeek.length > 10 && (
            <div style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', padding: 4 }}>
              +{completedThisWeek.length - 10} أخرى
            </div>
          )}
        </div>
      )}

      {/* Team performance */}
      {persons.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{
            fontSize: 14, fontWeight: 700, color: '#8b5cf6', marginBottom: 8,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span>👥</span> أداء الفريق
          </div>
          {persons.slice(0, 8).map(([name, v]) => {
            const p = v.total ? Math.round((v.done / v.total) * 100) : 0
            return (
              <div key={name} style={{
                background: 'var(--card)', borderRadius: 10, padding: '10px 12px',
                marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                    أنجز {v.thisWeek} هذا الأسبوع • {v.done}/{v.total} كلي
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <div style={{ width: 50, height: 5, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${p}%`, background: p >= 70 ? '#10b981' : p >= 40 ? '#f59e0b' : '#ef4444', borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text3)', width: 28, textAlign: 'left' }}>{p}%</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Projects */}
      {projects.length > 1 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{
            fontSize: 14, fontWeight: 700, color: '#3b82f6', marginBottom: 8,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span>📁</span> المشاريع
          </div>
          {projects.slice(0, 6).map(([name, v]) => {
            const p = v.total ? Math.round((v.done / v.total) * 100) : 0
            return (
              <div key={name} style={{
                background: 'var(--card)', borderRadius: 10, padding: '10px 12px',
                marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--text3)' }}>{v.done}/{v.total}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: p >= 70 ? '#10b981' : '#f59e0b' }}>{p}%</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Urgent */}
      {urgent.length > 0 && (
        <div>
          <div style={{
            fontSize: 14, fontWeight: 700, color: '#ef4444', marginBottom: 8,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span>🔴</span> عاجلة معلقة
            <span style={{
              background: 'rgba(239,68,68,0.12)', borderRadius: 20, padding: '1px 8px',
              fontSize: 12, fontWeight: 700, color: '#ef4444',
            }}>{urgent.length}</span>
          </div>
          {urgent.slice(0, 6).map(t => (
            <div key={t.id} style={{
              background: 'var(--card)', borderRadius: 10, padding: '10px 12px',
              marginBottom: 6, borderRight: '3px solid #ef4444',
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{t.title}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 3, fontSize: 11, color: 'var(--text2)' }}>
                {t.person && <span>👤 {t.person}</span>}
                {t.dueDate && <span>📅 {formatShortDate(t.dueDate)}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ReportsPage({ tasks, showToast, apiKey, userProfile }) {

  const { isUser } = useAuth() 

  const [tab, setTab] = useState('visual')
  const [visualType, setVisualType] = useState('executive')

  const all       = tasks
  const urgent    = useMemo(() => all.filter(t => t.priority === 'urgent' && !t.done), [all])
  const todayDone = useMemo(() => all.filter(isCompletedToday), [all])
  const overdue   = useMemo(() => all.filter(isOverdue), [all])
  const total     = all.length
  const doneCount = all.filter(t => t.done).length
  const pct       = total ? Math.round((doneCount / total) * 100) : 0

  const persons = useMemo(() => {
    const map = {}
    all.forEach(t => {
      if (!t.person) return
      t.person.split(/[،,]/).map(p => p.trim()).filter(Boolean).forEach(p => {
        if (!map[p]) map[p] = { total: 0, done: 0 }
        map[p].total++
        if (t.done) map[p].done++
      })
    })
    return Object.entries(map).sort((a,b) => b[1].total - a[1].total)
  }, [all])

  function shareWhatsApp() {
    const text    = buildWhatsAppText(tasks, userProfile?.name)
    const encoded = encodeURIComponent(text)
    window.open(`https://wa.me/?text=${encoded}`, '_blank')
  }

  function printReport() {
    document.body.classList.add('print-exec')
    window.print()
    document.body.classList.remove('print-exec')
  }

  if (all.length === 0) {
    return (
      <PullToRefresh onRefresh={() => showToast?.('✓ محدّث')}>
        <div className="header">
          <div className="header-title">📊 التقارير</div>
          <div className="header-sub">لا توجد مهام بعد</div>
        </div>
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <div className="empty-text">لا توجد بيانات</div>
          <div className="empty-sub">أضف مهام لعرض التقارير</div>
        </div>
      </PullToRefresh>
    )
  }

  return (
    <PullToRefresh onRefresh={() => showToast?.('✓ محدّث')}>
      <div className="header">
        <div className="header-title">📊 التقارير</div>
        <div className="header-sub">{formatArabicDate()}</div>
      </div>

      <div className="report-tab-bar">
        <button
          className={`report-tab${tab === 'visual' ? ' active' : ''}`}
          onClick={() => setTab('visual')}
        >🎨 بصري</button>
        <button
          className={`report-tab${tab === 'weekly' ? ' active' : ''}`}
          onClick={() => setTab('weekly')}
        >📊 الأسبوعي</button>
      </div>

      {tab === 'dashboard' && (
        <div>
          <div className="report-section">
            <div className="report-section-title" style={{ borderColor: '#60a5fa' }}>
              الإجمالي — نسبة الإنجاز {pct}%
            </div>
            <div style={{ background: 'var(--card)', borderRadius: 12, padding: 14, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--text2)' }}>التقدم</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{doneCount} / {total}</span>
              </div>
              <div style={{ height: 8, background: 'var(--bg3)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${pct}%`,
                  background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)', borderRadius: 4
                }} />
              </div>
            </div>
            <div className="report-row">
              <StatCard value={total} label="الكل" color="#60a5fa" />
              <StatCard value={all.filter(t => !t.done).length} label="معلقة" color="#9090a8" />
              <StatCard value={doneCount} label="مكتملة" color="#10b981" />
              <StatCard value={urgent.length} label="عاجل" color="#ef4444" />
            </div>
          </div>

          <div className="report-section">
            <div className="report-section-title" style={{ borderColor: '#10b981' }}>
              ✅ أنجز اليوم ({todayDone.length})
            </div>
            {todayDone.length === 0
              ? <div style={{ color: 'var(--text3)', fontSize: 13, padding: '8px 4px' }}>لا شيء أنجز اليوم بعد</div>
              : todayDone.map(t => <TaskRow key={t.id} t={t} accent="#10b981" />)
            }
          </div>

          {overdue.length > 0 && (
            <div className="report-section">
              <div className="report-section-title" style={{ borderColor: '#f59e0b' }}>
                ⚠️ متأخرة عن موعدها ({overdue.length})
              </div>
              {overdue.map(t => <TaskRow key={t.id} t={t} accent="#f59e0b" />)}
            </div>
          )}

          {persons.length > 0 && (
            <div className="report-section">
              <div className="report-section-title" style={{ borderColor: '#8b5cf6' }}>
                👥 حسب المسؤول
              </div>
              {persons.map(([name, v]) => (
                <PersonRow key={name} name={name} total={v.total} done={v.done} />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'executive' && (
        <div>
                    {/* 🔴 إخفاء أزرار تصدير الواتساب والـ PDF عن الموظف العادي */}
          {!isUser && (
            <div className="exec-actions" style={{ marginBottom: 16 }}>
              <button className="exec-btn whatsapp" onClick={shareWhatsApp}>
                <span>📤</span> واتساب
              </button>
              <button className="exec-btn print" onClick={printReport}>
                <span>🖨️</span> PDF
              </button>
            </div>
          )}

          <div id="exec-report" className="exec-report-card">
            <div className="exec-report-header">
              <div className="exec-header-top">
                <div className="exec-report-logo">مهامي <span>Pro</span></div>
                <div className="exec-header-badge">التقرير التنفيذي</div>
              </div>
              <div className="exec-report-date">{formatArabicDate()}</div>
              <div className="exec-report-user">{userProfile?.name || 'مستخدم'} — الأداء والتحليلات P&A</div>

              <div className="exec-header-bar" />
            </div>

            <div className="exec-kpi-strip">
              <div className="exec-kpi-item">
                <div className="exec-kpi-dot" style={{ background: '#3b82f6' }} />
                <div className="exec-kpi-num" style={{ color: '#1d4ed8' }}>{total}</div>
                <div className="exec-kpi-label">إجمالي</div>
              </div>
              <div className="exec-kpi-item">
                <div className="exec-kpi-dot" style={{ background: '#10b981' }} />
                <div className="exec-kpi-num" style={{ color: '#059669' }}>{pct}%</div>
                <div className="exec-kpi-label">إنجاز</div>
              </div>
              <div className="exec-kpi-item">
                <div className="exec-kpi-dot" style={{ background: '#ef4444' }} />
                <div className="exec-kpi-num" style={{ color: '#dc2626' }}>{urgent.length}</div>
                <div className="exec-kpi-label">عاجلة</div>
              </div>
              <div className="exec-kpi-item">
                <div className="exec-kpi-dot" style={{ background: '#f59e0b' }} />
                <div className="exec-kpi-num" style={{ color: '#d97706' }}>{todayDone.length}</div>
                <div className="exec-kpi-label">أنجز اليوم</div>
              </div>
            </div>

            <div className="exec-progress-wrap">
              <div className="exec-progress-label">
                <span>التقدم الكلي</span>
                <span style={{ color: '#059669', fontWeight: 700 }}>{doneCount} / {total} مهمة</span>
              </div>
              <div className="exec-progress-track">
                <div className="exec-progress-fill" style={{ width: `${pct}%` }} />
              </div>
            </div>

            {urgent.length > 0 && (
              <div className="exec-section">
                <div className="exec-section-head">
                  <div className="exec-section-line" style={{ background: '#ef4444' }} />
                  <div className="exec-section-title" style={{ color: '#dc2626' }}>المهام العاجلة المعلقة</div>
                  <div className="exec-section-badge" style={{ background: '#fee2e2', color: '#991b1b' }}>{urgent.length}</div>
                </div>
                {urgent.map(t => (
                  <div key={t.id} className="exec-task-row">
                    <div className="exec-task-indicator" style={{ background: '#ef4444' }} />
                    <div className="exec-task-body">
                      <div className="exec-task-title">{t.title}</div>
                      <div className="exec-chips">
                        {t.person && <span className="exec-chip exec-chip-person">{t.person}</span>}
                        {t.dueDate && <span className="exec-chip exec-chip-date">{formatShortDate(t.dueDate)}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {overdue.length > 0 && (
              <div className="exec-section">
                <div className="exec-section-head">
                  <div className="exec-section-line" style={{ background: '#f59e0b' }} />
                  <div className="exec-section-title" style={{ color: '#b45309' }}>متأخرة عن الموعد</div>
                  <div className="exec-section-badge" style={{ background: '#fef3c7', color: '#92400e' }}>{overdue.length}</div>
                </div>
                {overdue.map(t => (
                  <div key={t.id} className="exec-task-row">
                    <div className="exec-task-indicator" style={{ background: '#f59e0b' }} />
                    <div className="exec-task-body">
                      <div className="exec-task-title">{t.title}</div>
                      <div className="exec-chips">
                        {t.person && <span className="exec-chip exec-chip-person">{t.person}</span>}
                        {t.dueDate && <span className="exec-chip exec-chip-date late">{formatShortDate(t.dueDate)}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {todayDone.length > 0 && (
              <div className="exec-section">
                <div className="exec-section-head">
                  <div className="exec-section-line" style={{ background: '#10b981' }} />
                  <div className="exec-section-title" style={{ color: '#059669' }}>أنجز اليوم</div>
                  <div className="exec-section-badge" style={{ background: '#d1fae5', color: '#065f46' }}>{todayDone.length}</div>
                </div>
                {todayDone.map(t => (
                  <div key={t.id} className="exec-task-row">
                    <div className="exec-task-indicator" style={{ background: '#10b981' }} />
                    <div className="exec-task-body">
                      <div className="exec-task-title done">{t.title}</div>
                      <div className="exec-chips">
                        {t.person && <span className="exec-chip exec-chip-person">{t.person}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {persons.length > 0 && (
              <div className="exec-section">
                <div className="exec-section-head">
                  <div className="exec-section-line" style={{ background: '#6366f1' }} />
                  <div className="exec-section-title" style={{ color: '#4338ca' }}>الأداء حسب المسؤول</div>
                </div>
                {persons.map(([name, v]) => {
                  const p = v.total ? Math.round((v.done / v.total) * 100) : 0
                  return (
                    <div key={name} className="exec-person-row">
                      <div className="exec-person-name">{name}</div>
                      <div className="exec-person-bar-wrap">
                        <div className="exec-person-count">{v.done}/{v.total}</div>
                        <div className="exec-person-track">
                          <div className="exec-person-fill" style={{
                            width: `${p}%`,
                            background: p === 100 ? '#10b981' : '#6366f1'
                          }} />
                        </div>
                        <div className="exec-person-pct">{p}%</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="exec-report-footer">
              <div className="exec-foot-brand">My Day</div>
              <div className="exec-foot-time">
                {new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })} • {formatArabicDate()}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'visual' && !isUser && (
        <div>
          <div style={{ display: 'flex', gap: 8, padding: '0 16px 12px' }}>
            <button
              onClick={() => setVisualType('executive')}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
                fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                background: visualType === 'executive'
                  ? 'linear-gradient(135deg, #3b82f6, #8b5cf6)'
                  : 'var(--bg3)',
                color: visualType === 'executive' ? '#fff' : 'var(--text2)',
                transition: 'all 0.2s',
              }}
            >🧾 الشامل</button>
            <button
              onClick={() => setVisualType('daily')}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
                fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                background: visualType === 'daily'
                  ? 'linear-gradient(135deg, #3b82f6, #8b5cf6)'
                  : 'var(--bg3)',
                color: visualType === 'daily' ? '#fff' : 'var(--text2)',
                transition: 'all 0.2s',
              }}
            >⚡ اليومي</button>
          </div>

          {visualType === 'executive' && <ComprehensiveReport tasks={tasks} />}
          {visualType === 'daily'     && <DailyBriefCard tasks={tasks} />}
        </div>
      )}

      {tab === 'weekly' && !isUser && (
        <WeeklyReportTab tasks={tasks} userName={userProfile?.name} />
      )}
    </PullToRefresh>
  )
}
