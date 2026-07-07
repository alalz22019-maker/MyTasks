import { useRef, useState } from 'react'
import { D, KPI_PALETTE, CARD, formatDates } from './VisualSummaryColors'
import { exportPNG, exportPDF, shareImage } from './VisualSummaryExport'
import { getEffectiveStatus } from '../constants'

/**
 * 🧾 التقرير الشامل — محسوب مباشرة من بيانات المهام (بدون ذكاء اصطناعي)
 * البنية: عدادات → تقدم الإنجاز → حسب الملف → حسب المسؤول → متأخرة → مفتوحة → مكتملة
 */
export default function ComprehensiveReport({ tasks = [] }) {
  const cardRef = useRef(null)
  const [exporting, setExporting] = useState(false)
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
        if (!map[k]) map[k] = { total: 0, done: 0 }
        map[k].total++
        if (t._st === 'completed') map[k].done++
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
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: D.text }}>{name}</span>
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

  const kpis = [
    { icon: '📋', value: total, label: 'إجمالي المهام', color: 'blue' },
    { icon: '✅', value: doneList.length, label: 'مكتملة', color: 'green' },
    { icon: '⚙️', value: inProgressList.length, label: 'جاري العمل', color: 'orange' },
    { icon: '🔴', value: overdueList.length, label: 'متأخرة', color: 'red' },
  ]

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

          {/* حسب الملف */}
          <Section>
            <SectionTitle icon="📁" text="حالة الملفات" count={byProject.length} color="#6366f1" />
            <GroupRows data={byProject} color="#6366f1" />
          </Section>

          {/* حسب المسؤول */}
          <Section>
            <SectionTitle icon="👥" text="حسب المسؤول" count={byPerson.length} color={D.blue} />
            <GroupRows data={byPerson} color={D.blue} />
          </Section>

          {/* المتأخرة */}
          {overdueList.length > 0 && (
            <Section>
              <SectionTitle icon="⚠️" text="المهام المتأخرة" count={overdueList.length} color="#dc2626" />
              {overdueList.map(t => <TaskRow key={t.id} t={t} accent="#dc2626" />)}
            </Section>
          )}

          {/* المفتوحة */}
          <Section>
            <SectionTitle icon="📌" text="المهام المفتوحة" count={openList.length} color="#d97706" />
            {openList.slice(0, 40).map(t => <TaskRow key={t.id} t={t} />)}
            {openList.length > 40 && <div style={{ fontSize: 10, color: D.text2, marginTop: 6 }}>+ {openList.length - 40} مهمة أخرى</div>}
            {openList.length === 0 && <div style={{ fontSize: 11, color: D.text2 }}>لا توجد مهام مفتوحة 🎉</div>}
          </Section>

          {/* المكتملة */}
          <Section>
            <SectionTitle icon="✅" text="المهام المكتملة" count={doneList.length} color={D.green} />
            {doneList.slice(0, 40).map(t => <TaskRow key={t.id} t={t} accent="#059669" showDue={false} showDone />)}
            {doneList.length > 40 && <div style={{ fontSize: 10, color: D.text2, marginTop: 6 }}>+ {doneList.length - 40} مهمة أخرى</div>}
            {doneList.length === 0 && <div style={{ fontSize: 11, color: D.text2 }}>لا توجد مهام مكتملة بعد</div>}
          </Section>

          {/* التذييل */}
          <div style={{ textAlign: 'center', fontSize: 9.5, color: D.text2, paddingTop: 2 }}>
            تقرير محسوب آلياً من بيانات المهام • My Day — الأداء والتحليلات P&A
          </div>
        </div>
      </div>
    </div>
  )
}
