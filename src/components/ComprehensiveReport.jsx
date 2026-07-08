import { useRef, useState, useEffect } from 'react'
import { D, KPI_PALETTE, CARD, formatDates } from './VisualSummaryColors'
import { exportPNG, exportPDF, shareImage } from './VisualSummaryExport'
import { getEffectiveStatus } from '../constants'
import { getRegistryAll } from '../utils/db'

/**
 * 🧾 التقرير الشامل — محسوب مباشرة من بيانات المهام (بدون ذكاء اصطناعي)
 * البنية: عدادات → تقدم الإنجاز → حسب الملف → حسب المسؤول → متأخرة → مفتوحة → مكتملة
 */
export default function ComprehensiveReport({ tasks = [] }) {
  const cardRef = useRef(null)
  const [exporting, setExporting] = useState(false)
  const [registry, setRegistry] = useState({ initiatives: [], reports: [], meetings: [] })
  useEffect(() => {
    Promise.all([
      getRegistryAll('rased_initiatives'),
      getRegistryAll('rased_reports'),
      getRegistryAll('rased_meetings'),
    ]).then(([initiatives, reports, meetings]) => setRegistry({ initiatives, reports, meetings })).catch(() => {})
  }, [])
  const { hijri, gregorianEn } = formatDates()

  /* ── الحسابات ── */
  const total = tasks.length
  const withStatus = tasks.map(t => ({ ...t, _st: getEffectiveStatus(t) }))
  const doneList = withStatus.filter(t => t._st === 'completed')
  const overdueList = withStatus.filter(t => t._st === 'overdue')
  const inProgressList = withStatus.filter(t => t._st === 'in_progress')
  const openList = withStatus.filter(t => t._st !== 'completed')
  const pct = total ? Math.round((doneList.length / total) * 100) : 0

  const groupBy = (keyFn) => {
    const map = {}
    withStatus.forEach(t => {
      const keys = keyFn(t)
      keys.forEach(k => {
        if (!k) return
        if (!map[k]) map[k] = { total: 0, done: 0, overdue: 0 }
        map[k].total++
        if (t._st === 'completed') map[k].done++
        if (t._st === 'overdue') map[k].overdue++
      })
    })
    return Object.entries(map).sort((a, b) => b[1].total - a[1].total)
  }
  const byProject = groupBy(t => [t.projectName || 'بدون ملف'])
  const byPerson = groupBy(t => (t.person || '').split(/[،,]/).map(p => p.trim()).filter(Boolean))

  async function withExport(fn) {
    if (!cardRef.current || exporting) return
    setExporting(true)
    try { await fn(cardRef.current) } finally { setExporting(false) }
  }

  /* ── عناصر مساعدة ── */
  const SectionTitle = ({ icon, text, count, color = D.text }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
      <span style={{ fontSize: 13 }}>{icon}</span>
      <span style={{ fontSize: 13, fontWeight: 800, color, flex: 1 }}>{text}</span>
      {count !== undefined && (
        <span style={{ background: `${color}15`, border: `1px solid ${color}30`, color, borderRadius: 20, padding: '1px 9px', fontSize: 11, fontWeight: 700 }}>{count}</span>
      )}
    </div>
  )

  const Bar = ({ value, color }) => (
    <div style={{ height: 7, background: '#e9ecef', borderRadius: 6, overflow: 'hidden', flex: 1 }}>
      <div style={{ width: `${value}%`, height: '100%', background: color, borderRadius: 6, transition: 'width .3s' }} />
    </div>
  )

  const GroupRows = ({ data, color }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {data.map(([name, v]) => {
        const p = v.total ? Math.round((v.done / v.total) * 100) : 0
        return (
          <div key={name}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3, gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: D.text, display: 'flex', alignItems: 'center', gap: 5 }}>
                {name}
                {v.overdue > 0 && <span style={{ background: '#dc262615', border: '1px solid #dc262635', color: '#dc2626', borderRadius: 10, padding: '0 6px', fontSize: 9, fontWeight: 800 }}>🔴 {v.overdue} متأخرة</span>}
              </span>
              <span style={{ fontSize: 10, color: D.text2, fontWeight: 600 }}>{v.done}/{v.total} — {p}%</span>
            </div>
            <Bar value={p} color={color} />
          </div>
        )
      })}
      {data.length === 0 && <div style={{ fontSize: 11, color: D.text2 }}>لا توجد بيانات</div>}
    </div>
  )

  const prColor = { urgent: '#dc2626', medium: '#d97706', low: '#059669' }
  const TaskRow = ({ t, accent, showDue = true, showDone = false }) => (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '7px 0', borderBottom: '1px dashed #e9ecef' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: accent || prColor[t.priority] || '#94a3b8', marginTop: 5, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: D.text, lineHeight: 1.5 }}>{t.title}</div>
        <div style={{ fontSize: 10, color: D.text2, marginTop: 1, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {t.person && <span>👤 {t.person}</span>}
          {showDue && t.dueDate && <span>📅 {t.dueDate}</span>}
          {showDone && t.completedAt && <span>✅ {String(t.completedAt).slice(0, 10)}</span>}
          {t.projectName && <span>📁 {t.projectName}</span>}
        </div>
      </div>
    </div>
  )

  const Section = ({ children }) => (
    <div style={{ background: CARD.background, borderRadius: CARD.borderRadius, border: `1px solid ${D.border}`, padding: CARD.padding, boxShadow: CARD.boxShadow }}>
      {children}
    </div>
  )

  /* مستحقة خلال 7 أيام (غير مكتملة) */
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const week = new Date(now); week.setDate(week.getDate() + 7)
  const dueSoon = openList.filter(t => {
    if (!t.dueDate) return false
    const d = new Date(t.dueDate)
    return d >= now && d <= week
  })

  /* ── حالة سجل راصد ── */
  const initStatus = (i) => {
    const c = Number(i.completion) || 0
    if (c >= 100) return { label: 'مكتملة', color: '#059669' }
    if (i.dueDate && new Date(i.dueDate) < now) return { label: `⏰ متأخرة`, color: '#dc2626' }
    if (c > 0) return { label: 'جارية', color: '#2563eb' }
    return { label: 'لم تبدأ', color: '#6b7280' }
  }
  const REPORT_ST = {
    'Completed': { label: 'مكتمل', color: '#059669' },
    'In Progress': { label: 'جاري', color: '#2563eb' },
    'Delayed': { label: '⏰ متأخر', color: '#dc2626' },
    'Not Started': { label: 'لم يبدأ', color: '#6b7280' },
  }
  const StChip = ({ st }) => (
    <span style={{ background: `${st.color}14`, border: `1px solid ${st.color}30`, color: st.color, borderRadius: 20, padding: '1px 9px', fontSize: 10, fontWeight: 800, whiteSpace: 'nowrap' }}>{st.label}</span>
  )
  const RegRow = ({ name, chip, extra }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px dashed #e9ecef' }}>
      <div style={{ flex: 1, fontSize: 11.5, fontWeight: 700, color: D.text, lineHeight: 1.5 }}>{name}
        {extra && <div style={{ fontSize: 10, color: D.text2, fontWeight: 400, marginTop: 1 }}>{extra}</div>}
      </div>
      {chip}
    </div>
  )
  const meetDone = registry.meetings.filter(m => m.statusWeek === 'Done').length

  /* الجارية والقادمة: المفتوحة غير المتأخرة — بلا تكرار مع قسم المتأخرة */
  const pendingList = openList
    .filter(t => t._st !== 'overdue')
    .sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0
      if (!a.dueDate) return 1
      if (!b.dueDate) return -1
      return new Date(a.dueDate) - new Date(b.dueDate)
    })
  const dueIn = (t) => {
    if (!t.dueDate) return ''
    const diff = Math.round((new Date(t.dueDate) - now) / 86400000)
    if (diff === 0) return ' (مستحقة اليوم)'
    if (diff === 1) return ' (غداً)'
    return ` (خلال ${diff} يوم)`
  }

  const kpis = [
    { icon: '📋', value: total, label: 'إجمالي المهام', color: 'blue' },
    { icon: '✅', value: doneList.length, label: 'مكتملة', color: 'green' },
    { icon: '📅', value: dueSoon.length, label: 'مستحقة خلال ٧ أيام', color: 'orange' },
    { icon: '🔴', value: overdueList.length, label: 'متأخرة', color: 'red' },
  ]

  /* أيام التأخر */
  const daysLate = (t) => {
    if (!t.dueDate) return 0
    return Math.max(0, Math.round((now - new Date(t.dueDate)) / 86400000))
  }

  return (
    <div style={{ padding: '0 16px 32px', direction: 'rtl' }}>
      {/* أزرار التصدير */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button onClick={() => withExport(exportPDF)} disabled={exporting} style={{ flex: 1, padding: '11px 0', borderRadius: 12, border: 'none', background: D.green, color: '#fff', fontSize: 14, fontWeight: 700, cursor: exporting ? 'default' : 'pointer', fontFamily: 'inherit', opacity: exporting ? 0.6 : 1 }}>📄 PDF</button>
        <button onClick={() => withExport(exportPNG)} disabled={exporting} style={{ flex: 1, padding: '11px 0', borderRadius: 12, border: 'none', background: D.blue, color: '#fff', fontSize: 14, fontWeight: 700, cursor: exporting ? 'default' : 'pointer', fontFamily: 'inherit', opacity: exporting ? 0.6 : 1 }}>🖼️ صورة</button>
        <button onClick={() => withExport(shareImage)} disabled={exporting} style={{ flex: 1, padding: '11px 0', borderRadius: 12, border: 'none', background: '#25D366', color: '#fff', fontSize: 14, fontWeight: 700, cursor: exporting ? 'default' : 'pointer', fontFamily: 'inherit', opacity: exporting ? 0.6 : 1 }}>📤 مشاركة</button>
      </div>

      <div ref={cardRef} style={{ background: D.bg, borderRadius: 20, fontFamily: "'IBM Plex Sans Arabic','Segoe UI',system-ui,sans-serif", boxShadow: '0 4px 24px rgba(0,107,63,0.13)', border: `1px solid ${D.border}` }}>
        {/* الهيدر */}
        <div style={{ background: 'linear-gradient(135deg, #004D2C 0%, #006B3F 100%)', borderRadius: '20px 20px 0 0', padding: '18px 20px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <div>
              <div style={{ color: '#fff', fontSize: 17, fontWeight: 900, lineHeight: 1.2, marginBottom: 3 }}>التقرير الشامل</div>
              <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 10 }}>My Day • الأداء والتحليلات P&A</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, padding: '4px 10px', fontSize: 10, fontWeight: 700, color: '#fff' }}>🧾 شامل</div>
          </div>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.2)', marginBottom: 10 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.9)', fontWeight: 600 }}>📅 {hijri}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', direction: 'ltr', textAlign: 'right' }}>📆 {gregorianEn}</div>
          </div>
        </div>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* العدادات */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {kpis.map((kpi, i) => {
              const col = KPI_PALETTE[kpi.color] || KPI_PALETTE.gray
              return (
                <div key={i} style={{ background: col.bg, border: `1px solid ${col.color}30`, borderRadius: 14, padding: '12px 13px', boxShadow: `0 2px 10px ${col.glow}`, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: `${col.color}15`, border: `1px solid ${col.color}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>{kpi.icon}</div>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: col.color, lineHeight: 1 }}>{kpi.value}</div>
                    <div style={{ fontSize: 10, color: D.text2, marginTop: 2 }}>{kpi.label}</div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* تقدم الإنجاز */}
          <Section>
            <SectionTitle icon="📊" text="تقدم الإنجاز الكلي" color={D.green} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 28, fontWeight: 900, color: D.green }}>{pct}%</span>
              <Bar value={pct} color={D.green} />
            </div>
          </Section>

          {/* 🚀 المبادرات */}
          {registry.initiatives.length > 0 && (
            <Section>
              <SectionTitle icon="🚀" text="المبادرات" count={registry.initiatives.length} color="#7c3aed" />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {registry.initiatives.map(i => {
                  const c = Number(i.completion) || 0
                  return (
                    <div key={i.id} style={{ padding: '7px 0', borderBottom: '1px dashed #e9ecef' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ flex: 1, fontSize: 11.5, fontWeight: 700, color: D.text, lineHeight: 1.5 }}>{i.name}</span>
                        <StChip st={initStatus(i)} />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Bar value={c} color="#7c3aed" />
                        <span style={{ fontSize: 10, fontWeight: 800, color: '#7c3aed' }}>{c}%</span>
                        {i.owner && <span style={{ fontSize: 9.5, color: D.text2 }}>👤 {i.owner}</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </Section>
          )}

          {/* 📄 التقارير الدورية */}
          {registry.reports.length > 0 && (
            <Section>
              <SectionTitle icon="📄" text="التقارير الدورية" count={registry.reports.length} color="#0891b2" />
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                {Object.entries(REPORT_ST).map(([k, st]) => {
                  const n = registry.reports.filter(r => r.status === k).length
                  return n > 0 ? <StChip key={k} st={{ ...st, label: `${st.label}: ${n}` }} /> : null
                })}
              </div>
              {registry.reports.map(r => (
                <RegRow key={r.id} name={r.name}
                  extra={[r.frequency && `🔁 ${r.frequency}`, r.owner && `👤 ${r.owner}`].filter(Boolean).join('  •  ')}
                  chip={<StChip st={REPORT_ST[r.status] || REPORT_ST['Not Started']} />} />
              ))}
            </Section>
          )}

          {/* 🤝 الاجتماعات */}
          {registry.meetings.length > 0 && (
            <Section>
              <SectionTitle icon="🤝" text="الاجتماعات" count={registry.meetings.length} color="#d97706" />
              <div style={{ fontSize: 10.5, color: D.text2, fontWeight: 700, marginBottom: 8 }}>
                انعقد هذا الأسبوع: {meetDone} من {registry.meetings.length}
              </div>
              {registry.meetings.map(m => (
                <RegRow key={m.id} name={m.name}
                  extra={[m.schedule && `🕐 ${m.schedule}`, m.organizer && `👤 ${m.organizer}`].filter(Boolean).join('  •  ')}
                  chip={<StChip st={m.statusWeek === 'Done' ? { label: 'انعقد ✓', color: '#059669' } : { label: 'لم ينعقد', color: '#d97706' }} />} />
              ))}
            </Section>
          )}

          {/* حسب الملف — يُخفى إذا لم تُصنَّف المهام بملفات بعد */}
          {byProject.some(([name]) => name !== 'بدون ملف') && (
            <Section>
              <SectionTitle icon="📁" text="حالة الملفات" count={byProject.length} color="#6366f1" />
              <GroupRows data={byProject.filter(([name]) => name !== 'بدون ملف' || byProject.length === 1)} color="#6366f1" />
            </Section>
          )}

          {/* حسب المسؤول */}
          <Section>
            <SectionTitle icon="👥" text="حسب المسؤول" count={byPerson.length} color={D.blue} />
            <GroupRows data={byPerson} color={D.blue} />
          </Section>

          {/* المتأخرة */}
          {overdueList.length > 0 && (
            <Section>
              <SectionTitle icon="⚠️" text="المهام المتأخرة" count={overdueList.length} color="#dc2626" />
              {overdueList
                .sort((a, b) => daysLate(b) - daysLate(a))
                .map(t => <TaskRow key={t.id} t={{ ...t, title: `${t.title} (متأخرة ${daysLate(t)} يوم)` }} accent="#dc2626" />)}
            </Section>
          )}

          {/* الجارية والقادمة — بدون تكرار المتأخرة */}
          <Section>
            <SectionTitle icon="📌" text="المهام الجارية والقادمة" count={pendingList.length} color="#d97706" />
            {pendingList.slice(0, 40).map(t => <TaskRow key={t.id} t={{ ...t, title: `${t.title}${dueIn(t)}` }} />)}
            {pendingList.length > 40 && <div style={{ fontSize: 10, color: D.text2, marginTop: 6 }}>+ {pendingList.length - 40} مهمة أخرى</div>}
            {pendingList.length === 0 && <div style={{ fontSize: 11, color: D.text2 }}>لا توجد مهام قادمة — كل المفتوح متأخر أو منجز</div>}
          </Section>

          {/* المكتملة */}
          <Section>
            <SectionTitle icon="✅" text="المهام المكتملة" count={doneList.length} color={D.green} />
            {doneList.slice(0, 40).map(t => <TaskRow key={t.id} t={t} accent="#059669" showDue={false} showDone />)}
            {doneList.length > 40 && <div style={{ fontSize: 10, color: D.text2, marginTop: 6 }}>+ {doneList.length - 40} مهمة أخرى</div>}
            {doneList.length === 0 && <div style={{ fontSize: 11, color: D.text2 }}>لا توجد مهام مكتملة بعد</div>}
          </Section>

        </div>
      </div>
    </div>
  )
}
