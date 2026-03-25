import { useState, useRef } from 'react'
import { toPng } from 'html-to-image'
import { jsPDF } from 'jspdf'
import { generateVisualSummary } from '../utils/claude'

// Bilingual date: Arabic Hijri + English Gregorian
function formatArabicDate() {
  const now = new Date()
  const ar = now.toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const en = now.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  return `${ar}  •  ${en}`
}

// Ministry of Health light/white palette (main card)
const D = {
  bg:       '#FFFFFF',
  bg2:      '#F4F9F5',
  bg3:      '#E8F4EB',
  border:   '#C5DFC9',
  text:     '#1A2A1C',
  text2:    '#3D6045',
  text3:    '#7A9E81',
  green:    '#006C35', greenBg:  '#E6F4EA',
  red:      '#B91C1C', redBg:    '#FEF2F2',
  blue:     '#1565C0', blueBg:   '#E8F1FB',
  yellow:   '#B45309', yellowBg: '#FFF8E1',
  gray:     '#546E7A', grayBg:   '#F4F6F8',
  purple:   '#6D28D9', purpleBg: '#F3F0FF',
}

const KPI_PALETTE = {
  green:  { color: '#006C35', bg: '#E6F4EA', glow: 'rgba(0,108,53,0.10)'   },
  red:    { color: '#B91C1C', bg: '#FEF2F2', glow: 'rgba(185,28,28,0.10)'  },
  blue:   { color: '#1565C0', bg: '#E8F1FB', glow: 'rgba(21,101,192,0.10)' },
  gray:   { color: '#546E7A', bg: '#F4F6F8', glow: 'rgba(84,110,122,0.08)' },
  yellow: { color: '#B45309', bg: '#FFF8E1', glow: 'rgba(180,83,9,0.10)'   },
}

const MATRIX_CFG = [
  { key: 'urgentImportant',    label: 'عاجل ومهم',      icon: '🔴', color: '#B91C1C', bg: '#FEF2F2' },
  { key: 'importantNotUrgent', label: 'مهم وغير عاجل',  icon: '📌', color: '#1565C0', bg: '#E8F1FB' },
  { key: 'urgentNotImportant', label: 'عاجل وغير مهم',  icon: '⚡', color: '#B45309', bg: '#FFF8E1' },
  { key: 'other',              label: 'أخرى',            icon: '📋', color: '#546E7A', bg: '#F4F6F8' },
]

const CARD = {
  background: '#FFFFFF',
  borderRadius: 12,
  border: '#C5DFC9',
  padding: '14px 16px',
}

// Ministry palette for PDF slides (white/green)
const MN = {
  bg:    '#FFFFFF',
  bg2:   '#F4F9F5',
  bg3:   '#E8F4EB',
  gold:  '#C9A84C',
  goldL: '#E8C97A',
  green: '#006C35',
  green2:'#00A651',
  white: '#FFFFFF',
  off:   '#2D4A35',
  gray:  '#6B8C75',
  red:   '#B91C1C',
  red2:  '#DC2626',
  border: '#C5DFC9',
  text:  '#1A2A1C',
  text2: '#3D6045',
}

export default function VisualSummary({ tasks, apiKey }) {
  const [summary, setSummary]     = useState(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [exporting, setExporting] = useState(false)
  const cardRef  = useRef(null)
  const slide1Ref = useRef(null)
  const slide2Ref = useRef(null)

  const total      = tasks.length
  const doneCnt    = tasks.filter(t => t.done).length
  const urgentCnt  = tasks.filter(t => t.priority === 'urgent' && !t.done).length
  const pendingCnt = tasks.filter(t => !t.done && t.priority !== 'urgent').length
  const overdue    = tasks.filter(t => !t.done && t.dueDate && new Date(t.dueDate) < new Date()).length
  const pct        = total ? Math.round((doneCnt / total) * 100) : 0

  async function handleGenerate() {
    if (!apiKey) { setError('أضف مفتاح API أولاً'); return }
    setLoading(true); setError(''); setSummary(null)
    try {
      const result = await generateVisualSummary(apiKey, tasks)
      if (!result) throw new Error('لم يتج إنشاء اللوحة')
      setSummary(result)
    } catch (e) {
      setError(e.message || 'حدث خطأ غير متوقع')
    } finally { setLoading(false) }
  }

  async function handleDownload() {
    if (!cardRef.current) return
    setExporting(true)
    try {
      const el = cardRef.current
      const dataUrl = await toPng(el, {
        pixelRatio: 2, cacheBust: true,
        width: el.scrollWidth, height: el.scrollHeight,
      })
      const blob = await (await fetch(dataUrl)).blob()
      const file = new File([blob], 'الملخص-التنفيذي.png', { type: 'image/png' })
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
      if (isIOS && navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'الملخص التنفيذي' })
      } else {
        const link = document.createElement('a')
        link.download = `الملخص-التنفيذي-${new Date().toISOString().slice(0,10)}.png`
        link.href = dataUrl; link.click()
      }
    } catch { setError('تعذّر تحميل الصورة') }
    finally { setExporting(false) }
  }

  async function handleDownloadPDF() {
    if (!slide1Ref.current || !slide2Ref.current) return
    setExporting(true)
    try {
      const W = 1280, H = 720
      const opts = { pixelRatio: 1.5, cacheBust: true, width: W, height: H }
      const [url1, url2] = await Promise.all([
        toPng(slide1Ref.current, opts),
        toPng(slide2Ref.current, opts),
      ])
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [W, H] })
      pdf.addImage(url1, 'PNG', 0, 0, W, H)
      pdf.addPage([W, H], 'landscape')
      pdf.addImage(url2, 'PNG', 0, 0, W, H)
      pdf.save(`الملخص-التنفيذي-${new Date().toISOString().slice(0, 10)}.pdf`)
    } catch { setError('تعذّر إنشاء PDF') }
    finally { setExporting(false) }
  }

  async function handleShare() {
    if (!cardRef.current) return
    setExporting(true)
    try {
      const el = cardRef.current
      const dataUrl = await toPng(el, {
        pixelRatio: 2, cacheBust: true,
        width: el.scrollWidth, height: el.scrollHeight,
      })
      const blob = await (await fetch(dataUrl)).blob()
      const file = new File([blob], 'الملخص-التنفيذي.png', { type: 'image/png' })
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'الملخص التنفيذي' })
      } else {
        const link = document.createElement('a')
        link.download = 'الملخص-التنفيذي.png'
        link.href = dataUrl; link.click()
      }
    } catch { setError('تعذّرت المشاركة') }
    finally { setExporting(false) }
  }

  // Fallback KPIs computed locally when Claude doesn't return them
  const fallbackKPIs = [
    { label: 'نسبة الإنجاز',     value: `${pct}%`,  icon: '📈', color: 'blue'   },
    { label: 'تحتاج قراراً',     value: urgentCnt,  icon: '⚡', color: 'red'    },
    { label: 'مهام متأخرة',      value: overdue,    icon: '⚠️', color: 'yellow' },
    { label: 'على المسار',       value: doneCnt,    icon: '✅', color: 'green'  },
  ]

  const kpis = summary?.kpis?.length ? summary.kpis : fallbackKPIs

  // Section divider label
  function SectionLabel({ icon, label, color }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 13 }}>{icon}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: color || D.text2 }}>{label}</span>
      </div>
    )
  }

  return (
    <div style={{ padding: '16px', direction: 'rtl' }}>

      {/* ── Generate prompt ── */}
      {!summary && !loading && (
        <div style={{ textAlign: 'center', padding: '32px 16px' }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>🎨</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#e8e8f0', marginBottom: 8 }}>
            الملخص التنفيذي
          </div>
          <div style={{ fontSize: 13, color: '#9090a8', marginBottom: 24 }}>
            ينشئ Claude ملخصاً تنفيذياً يساعدك على اتخاذ القرارات الصحيحة
          </div>
          <button onClick={handleGenerate} style={{
            background: 'linear-gradient(135deg, #3b82f6, #7c3aed)',
            color: '#fff', border: 'none', borderRadius: 14,
            padding: '14px 32px', fontSize: 16, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>✨ إنشاء اللوحة</button>
          {error && <div style={{ marginTop: 16, color: '#ef4444', fontSize: 13 }}>{error}</div>}
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '48px 16px', color: '#9090a8' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div>
          <div>Claude يحلل المهام ويعد الملخص التنفيذي...</div>
        </div>
      )}

      {/* ── Dashboard ── */}
      {summary && (
        <>
          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <button onClick={handleDownload} disabled={exporting} style={{
              flex: 1, background: '#3b82f6', color: '#fff', border: 'none',
              borderRadius: 10, padding: '10px', fontSize: 14, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit', opacity: exporting ? 0.6 : 1,
            }}>{/iPad|iPhone|iPod/.test(navigator.userAgent) ? '🖼️ حفظ في الصور' : '⬇️ تحميل PNG'}</button>
            <button onClick={handleDownloadPDF} disabled={exporting} style={{
              flex: 1, background: '#7c3aed', color: '#fff', border: 'none',
              borderRadius: 10, padding: '10px', fontSize: 14, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit', opacity: exporting ? 0.6 : 1,
            }}>📄 تحميل PDF</button>
            <button onClick={handleShare} disabled={exporting} style={{
              flex: 1, background: '#10b981', color: '#fff', border: 'none',
              borderRadius: 10, padding: '10px', fontSize: 14, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit', opacity: exporting ? 0.6 : 1,
            }}>📤 مشاركة</button>
            <button onClick={() => setSummary(null)} style={{
              background: 'rgba(255,255,255,0.08)', color: '#9090a8', border: 'none',
              borderRadius: 10, padding: '10px 14px', fontSize: 14,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>🔄</button>
          </div>
          {error && <div style={{ marginBottom: 12, color: '#ef4444', fontSize: 13, textAlign: 'center' }}>{error}</div>}

          {/* ════════════════════════════════
              THE INFOGRAPHIC (html-to-image)
              ════════════════════════════════ */}
          <div ref={cardRef} style={{
            width: 390, maxWidth: '100%',
            background: D.bg,
            borderRadius: 20,
            fontFamily: "'IBM Plex Sans Arabic', 'Segoe UI', system-ui, sans-serif",
            direction: 'rtl',
            overflow: 'hidden',
            boxShadow: '0 4px 24px rgba(0,108,53,0.14)',
            border: `1px solid ${D.border}`,
          }}>

            {/* ── HEADER ── */}
            <div style={{
              background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 60%, #0f172a 100%)',
              borderBottom: '1px solid rgba(139,92,246,0.25)',
              padding: '18px 20px 14px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={{ color: D.text, fontSize: 16, fontWeight: 900, lineHeight: 1.2, marginBottom: 3 }}>
                    {summary.title || 'الملخص التنفيذي'}
                  </div>
                  <div style={{ color: D.text2, fontSize: 10 }}>مكتب إدارة المشاريع • مركز عمليات المختبرات</div>
                </div>
                {/* Decorative UI chips */}
                <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                  <div style={{
                    background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.35)',
                    borderRadius: 6, padding: '3px 8px', fontSize: 9, color: D.blue,
                  }}>API</div>
                  <div style={{
                    background: 'rgba(148,163,184,0.08)', border: '1px solid rgba(148,163,184,0.2)',
                    borderRadius: 6, padding: '3px 8px', fontSize: 9, color: D.text2,
                  }}>☰</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{
                  width: 6, height: 6, borderRadius: '50%', background: D.green,
                  boxShadow: `0 0 6px ${D.green}`,
                }} />
                <span style={{ color: D.text3, fontSize: 10 }}>آخر تحديث: {formatArabicDate()}</span>
              </div>
            </div>

            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* ── KPI CARDS ── */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {kpis.map((kpi, i) => {
                  const col = KPI_PALETTE[kpi.color] || KPI_PALETTE.gray
                  return (
                    <div key={i} style={{
                      background: col.bg,
                      border: `1px solid ${col.color}30`,
                      borderRadius: 14, padding: '12px 13px',
                      boxShadow: `0 4px 16px ${col.glow}`,
                      display: 'flex', alignItems: 'center', gap: 10,
                    }}>
                      <div style={{
                        width: 38, height: 38, borderRadius: 10,
                        background: `${col.color}18`,
                        border: `1px solid ${col.color}30`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 18, flexShrink: 0,
                      }}>{kpi.icon}</div>
                      <div>
                        <div style={{ fontSize: 22, fontWeight: 900, color: col.color, lineHeight: 1 }}>
                          {kpi.value}
                        </div>
                        <div style={{ fontSize: 10, color: D.text2, marginTop: 2 }}>{kpi.label}</div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* ── PROGRESS BAR ── */}
              <div style={{
                background: CARD.background, borderRadius: CARD.borderRadius,
                border: `1px solid ${CARD.border}`, padding: CARD.padding,
                boxShadow: '0 2px 12px rgba(0,0,0,0.2)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <SectionLabel icon="📊" label="تقدم الإنجاز" color={D.blue} />
                  <span style={{
                    fontSize: 13, fontWeight: 800,
                    color: pct >= 70 ? D.green : pct >= 40 ? D.yellow : D.red,
                  }}>{pct}%</span>
                </div>
                <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${pct}%`, borderRadius: 99,
                    background: pct >= 70
                      ? 'linear-gradient(90deg,#10b981,#34d399)'
                      : pct >= 40
                      ? 'linear-gradient(90deg,#f59e0b,#fbbf24)'
                      : 'linear-gradient(90deg,#ef4444,#f87171)',
                    boxShadow: pct >= 70 ? '0 0 8px rgba(16,185,129,0.45)' : undefined,
                  }} />
                </div>
              </div>

              {/* ── EISENHOWER MATRIX ── */}
              <div>
                <SectionLabel icon="⊞" label="مصفوفة تصنيف المهام (الأهمية × العجلة)" color={D.purple} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, position: 'relative' }}>
                  {MATRIX_CFG.map(q => {
                    const data = summary.matrix?.[q.key] || { count: 0, items: [] }
                    return (
                      <div key={q.key} style={{
                        background: q.bg,
                        border: `1px solid ${q.color}28`,
                        borderRadius: 12, padding: '10px 12px', minHeight: 85,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontSize: 12 }}>{q.icon}</span>
                            <span style={{ fontSize: 10, fontWeight: 700, color: q.color }}>{q.label}</span>
                          </div>
                          <div style={{
                            background: `${q.color}20`, border: `1px solid ${q.color}40`,
                            borderRadius: 20, padding: '1px 7px',
                            fontSize: 12, fontWeight: 900, color: q.color,
                          }}>{data.count}</div>
                        </div>
                        {(data.items || []).slice(0, 3).map((item, i) => (
                          <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 2, alignItems: 'flex-start' }}>
                            <span style={{ color: q.color, fontSize: 10, flexShrink: 0, lineHeight: 1.4 }}>›</span>
                            <span style={{ fontSize: 9, color: D.text2, lineHeight: 1.4 }}>{item}</span>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                  {/* Center crosshair */}
                  <div style={{
                    position: 'absolute', top: '50%', left: '50%',
                    transform: 'translate(-50%,-50%)',
                    width: 22, height: 22, borderRadius: '50%',
                    background: D.bg3, border: `2px solid ${D.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 9, color: D.text3,
                  }}>+</div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, padding: '0 2px' }}>
                  <span style={{ fontSize: 8, color: D.text3 }}>← غير عاجل</span>
                  <span style={{ fontSize: 8, color: D.text3 }}>عاجل →</span>
                </div>
              </div>

              {/* ── OVERVIEW ── */}
              {summary.overview?.length > 0 && (
                <div style={{
                  background: CARD.background, borderRadius: CARD.borderRadius,
                  border: `1px solid ${D.border}`, padding: CARD.padding,
                }}>
                  <SectionLabel icon="🎯" label="الملخص التنفيذي" color={D.blue} />
                  {summary.overview.map((item, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 5, alignItems: 'flex-start' }}>
                      <div style={{
                        width: 5, height: 5, borderRadius: '50%', background: D.blue,
                        flexShrink: 0, marginTop: 6,
                      }} />
                      <span style={{ fontSize: 11, color: D.text, lineHeight: 1.6 }}>{item}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* ── PEOPLE STATUS ── */}
              {summary.peopleStatus?.length > 0 && (
                <div style={{
                  background: 'rgba(239,68,68,0.05)',
                  border: `1px solid ${D.red}20`,
                  borderRadius: 14, padding: '14px 16px',
                }}>
                  <SectionLabel icon="👥" label="حالة الفريق — المهام المعلقة" color={D.red} />
                  {summary.peopleStatus.map((person, i) => (
                    <div key={i} style={{ marginBottom: i < summary.peopleStatus.length - 1 ? 10 : 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{
                            width: 22, height: 22, borderRadius: '50%',
                            background: D.redBg, border: `1px solid ${D.red}40`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, flexShrink: 0,
                          }}>👤</div>
                          <span style={{ fontSize: 12, fontWeight: 700, color: D.text }}>{person.name}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <span style={{ fontSize: 9, color: D.text2, background: 'rgba(255,255,255,0.06)', borderRadius: 4, padding: '2px 7px' }}>
                            {person.pending?.length || 0} معلقة
                          </span>
                          {person.overdueCount > 0 && (
                            <span style={{ fontSize: 9, color: D.red, background: D.redBg, borderRadius: 4, padding: '2px 7px', border: `1px solid ${D.red}30` }}>
                              {person.overdueCount} متأخرة
                            </span>
                          )}
                        </div>
                      </div>
                      {(person.pending || []).map((t, j) => (
                        <div key={j} style={{ display: 'flex', gap: 5, marginBottom: 2, alignItems: 'center', paddingRight: 28 }}>
                          <span style={{ color: D.red, fontSize: 10, flexShrink: 0 }}>○</span>
                          <span style={{ fontSize: 9, color: D.text2, lineHeight: 1.4 }}>{t}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}

              {/* ── PROJECT BREAKDOWN ── */}
              {summary.projectBreakdown?.length > 0 && (
                <div>
                  <SectionLabel icon="📁" label="حالة الفئات والمشاريع" color={D.blue} />
                  {summary.projectBreakdown.map((proj, i) => {
                    const projPct = proj.total ? Math.round((proj.done / proj.total) * 100) : 0
                    const barColor = projPct === 100 ? D.green : projPct >= 50 ? D.yellow : D.red
                    return (
                      <div key={i} style={{
                        background: CARD.background, borderRadius: 12,
                        border: `1px solid ${D.border}`, padding: '10px 12px',
                        marginBottom: i < summary.projectBreakdown.length - 1 ? 8 : 0,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: D.text }}>{proj.category}</span>
                          <span style={{ fontSize: 12, fontWeight: 900, color: barColor }}>{proj.done}/{proj.total}</span>
                        </div>
                        <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden', marginBottom: 6 }}>
                          <div style={{ height: '100%', width: `${projPct}%`, borderRadius: 99, background: barColor }} />
                        </div>
                        {proj.completed?.slice(0, 3).map((t, j) => (
                          <div key={j} style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 1 }}>
                            <span style={{ color: D.green, fontSize: 9, flexShrink: 0 }}>✓</span>
                            <span style={{ fontSize: 9, color: D.text3 }}>{t}</span>
                          </div>
                        ))}
                        {proj.pending?.slice(0, 3).map((t, j) => (
                          <div key={j} style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 1 }}>
                            <span style={{ color: D.yellow, fontSize: 9, flexShrink: 0 }}>○</span>
                            <span style={{ fontSize: 9, color: D.text2 }}>{t}</span>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* ── ACTION ITEMS ── */}
              {summary.actionItems?.length > 0 && (
                <div style={{
                  background: CARD.background, borderRadius: CARD.borderRadius,
                  border: `1px solid ${D.border}`, padding: CARD.padding,
                }}>
                  <SectionLabel icon="⚡" label="مهام بحاجة إلى قرار" color={D.yellow} />
                  {summary.actionItems.map((item, i) => {
                    const hi = item.priority === 'high'
                    const label = item.task || item.text || ''
                    return (
                      <div key={i} style={{
                        marginBottom: i < summary.actionItems.length - 1 ? 7 : 0,
                        padding: '8px 10px', borderRadius: 9,
                        background: hi ? 'rgba(239,68,68,0.07)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${hi ? D.red + '22' : D.border}`,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: item.reason ? 3 : 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 10 }}>{hi ? '🔴' : '🔵'}</span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: hi ? D.red : D.text }}>{label}</span>
                          </div>
                          {item.owner && (
                            <span style={{ fontSize: 9, color: D.text2, background: 'rgba(255,255,255,0.06)', borderRadius: 4, padding: '2px 7px', flexShrink: 0 }}>{item.owner}</span>
                          )}
                        </div>
                        {item.reason && (
                          <span style={{ fontSize: 9, color: D.text2, paddingRight: 16, display: 'block', lineHeight: 1.4 }}>{item.reason}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* ── RECOMMENDATIONS ── */}
              {summary.recommendations?.length > 0 && (
                <div style={{
                  background: 'linear-gradient(135deg, rgba(59,130,246,0.07), rgba(167,139,250,0.07))',
                  border: `1px solid rgba(167,139,250,0.2)`,
                  borderRadius: 14, padding: '14px 16px',
                }}>
                  <SectionLabel icon="💡" label="التوصيات الاستراتيجية" color={D.purple} />
                  {summary.recommendations.map((item, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'flex-start' }}>
                      <div style={{
                        width: 19, height: 19, borderRadius: 6, flexShrink: 0,
                        background: D.purpleBg, border: `1px solid rgba(167,139,250,0.3)`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 9, color: D.purple, fontWeight: 800,
                      }}>{i + 1}</div>
                      <span style={{ fontSize: 11, color: D.text, lineHeight: 1.6 }}>{item}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* ── TASK TABLE ── */}
              {tasks.length > 0 && (() => {
                const today = new Date()
                const fmtDate = (d) => {
                  if (!d) return '—'
                  const dt = new Date(d)
                  return `${dt.getDate()}/${dt.getMonth() + 1}`
                }
                const trunc = (s, n) => s && s.length > n ? s.slice(0, n) + '…' : (s || '—')
                const getStatus = (t) => {
                  if (t.done) return { label: 'منجزة', color: D.green }
                  if (t.dueDate && new Date(t.dueDate) < today) return { label: 'متأخرة', color: D.red }
                  if (t.priority === 'urgent') return { label: 'عاجل', color: '#f97316' }
                  return { label: 'معلق', color: D.text3 }
                }
                // Sort: urgent → overdue → high → medium → done last; take top 7
                const PRI = { urgent: 0, high: 1, medium: 2, normal: 3, low: 4 }
                const top7 = [...tasks].sort((a, b) => {
                  if (a.done !== b.done) return a.done ? 1 : -1
                  const aOvd = !a.done && a.dueDate && new Date(a.dueDate) < today
                  const bOvd = !b.done && b.dueDate && new Date(b.dueDate) < today
                  if (aOvd !== bOvd) return aOvd ? -1 : 1
                  return (PRI[a.priority] ?? 3) - (PRI[b.priority] ?? 3)
                }).slice(0, 7)

                // RTL flex row: first item (المهمة) renders on the RIGHT
                const COL = ['45%', '16%', '21%', '18%']
                const SEP = `1px solid rgba(255,255,255,0.06)`
                const ROW = (cells) => (
                  <div style={{ display: 'flex', flexDirection: 'row' }}>
                    {cells.map((cell, ci) => (
                      <div key={ci} style={{
                        width: COL[ci], padding: '6px 7px', boxSizing: 'border-box',
                        textAlign: ci === 0 ? 'right' : 'center',
                        borderLeft: ci < cells.length - 1 ? SEP : 'none',
                      }}>
                        {cell}
                      </div>
                    ))}
                  </div>
                )
                return (
                  <div>
                    <SectionLabel icon="📋" label="أبرز 7 مهام" color={D.text2} />
                    <div style={{ borderRadius: 12, border: `1px solid ${D.border}`, overflow: 'hidden' }}>
                      {/* Header */}
                      <div style={{ background: 'rgba(255,255,255,0.06)', borderBottom: `1px solid ${D.border}` }}>
                        {ROW(['المهمة', 'الموعد', 'المالك', 'الحالة'].map(h => (
                          <span style={{ fontSize: 8, fontWeight: 700, color: D.text3 }}>{h}</span>
                        )))}
                      </div>
                      {/* Rows */}
                      {top7.map((t, i) => {
                        const st = getStatus(t)
                        return (
                          <div key={i} style={{
                            borderBottom: i < top7.length - 1 ? `1px solid rgba(255,255,255,0.04)` : 'none',
                            background: i % 2 === 1 ? 'rgba(255,255,255,0.02)' : 'transparent',
                          }}>
                            {ROW([
                              <span style={{ fontSize: 9, color: t.done ? D.text3 : D.text, lineHeight: 1.3, display: 'block' }}>{t.title}</span>,
                              <span style={{ fontSize: 8, color: D.text3, lineHeight: 1.3 }}>{fmtDate(t.dueDate)}</span>,
                              <span style={{ fontSize: 8, color: D.text2, lineHeight: 1.3 }}>{trunc(t.person, 9) || '—'}</span>,
                              <span style={{ fontSize: 8, color: st.color, fontWeight: 700, lineHeight: 1.3 }}>{st.label}</span>,
                            ])}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}

            </div>{/* end main content */}

            {/* ── FOOTER ── */}
            <div style={{
              background: D.bg3,
              borderTop: `1px solid ${D.border}`,
              padding: '9px 18px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontSize: 9, color: D.text3 }}>تقرير مكتب إدارة المشاريع • مركز عمليات المختبرات</span>
            </div>

          </div>

          {/* ══════════════════════════════════
              HIDDEN PDF SLIDES (off-screen)
              ══════════════════════════════════ */}
          <div style={{ position: 'fixed', left: -9999, top: 0, zIndex: -1, pointerEvents: 'none' }}>

            {/* ── PDF SLIDE 1: KPIs + Progress + Matrix ── */}
            <div ref={slide1Ref} style={{
              width: 1280, height: 720,
              background: MN.bg,
              fontFamily: "'IBM Plex Sans Arabic', 'Segoe UI', system-ui, sans-serif",
              direction: 'rtl', overflow: 'hidden', position: 'relative',
              boxSizing: 'border-box',
            }}>
              {/* Top gradient bar */}
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 6, background: `linear-gradient(90deg, ${MN.green}, ${MN.gold})` }} />
              {/* Decorative circles */}
              <div style={{ position: 'absolute', top: -80, left: -80, width: 280, height: 280, borderRadius: '50%', background: `radial-gradient(circle, rgba(201,168,76,0.07) 0%, transparent 70%)`, pointerEvents: 'none' }} />
              <div style={{ position: 'absolute', bottom: -60, right: -60, width: 220, height: 220, borderRadius: '50%', background: `radial-gradient(circle, rgba(0,108,53,0.08) 0%, transparent 70%)`, pointerEvents: 'none' }} />

              {/* Header */}
              <div style={{
                marginTop: 6, padding: '18px 56px 14px',
                background: `linear-gradient(180deg, ${MN.bg2} 0%, transparent 100%)`,
                borderBottom: `1px solid ${MN.border}`,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: MN.white }}>{summary.title || 'الملخص التنفيذي'}</div>
                  <div style={{ fontSize: 12, color: MN.gold, marginTop: 3 }}>مكتب إدارة المشاريع • مركز عمليات المختبرات</div>
                </div>
                <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <div style={{ fontSize: 11, color: MN.gray }}>{formatArabicDate()}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: MN.green2, boxShadow: `0 0 6px ${MN.green2}` }} />
                    <span style={{ fontSize: 10, color: MN.off }}>الشريحة 1 من 2</span>
                  </div>
                </div>
              </div>

              {/* Body */}
              <div style={{ padding: '20px 56px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* KPI row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
                  {kpis.map((kpi, i) => {
                    const col = KPI_PALETTE[kpi.color] || KPI_PALETTE.gray
                    return (
                      <div key={i} style={{
                        background: MN.bg3, border: `1px solid ${col.color}40`,
                        borderRadius: 14, padding: '16px 18px',
                        display: 'flex', alignItems: 'center', gap: 14,
                        boxShadow: `0 4px 20px ${col.glow}`,
                      }}>
                        <div style={{
                          width: 48, height: 48, borderRadius: 12, flexShrink: 0,
                          background: `${col.color}20`, border: `1px solid ${col.color}35`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
                        }}>{kpi.icon}</div>
                        <div>
                          <div style={{ fontSize: 30, fontWeight: 900, color: col.color, lineHeight: 1 }}>{kpi.value}</div>
                          <div style={{ fontSize: 12, color: MN.off, marginTop: 3 }}>{kpi.label}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Progress + Matrix */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 16 }}>

                  {/* Progress card */}
                  <div style={{ background: MN.bg3, borderRadius: 14, border: `1px solid ${MN.border}`, padding: '20px 24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: MN.gold }}>📊 تقدم الإنجاز الكلي</span>
                      <span style={{ fontSize: 28, fontWeight: 900, color: pct >= 70 ? MN.green2 : pct >= 40 ? '#F59E0B' : MN.red2 }}>{pct}%</span>
                    </div>
                    <div style={{ height: 12, background: 'rgba(255,255,255,0.08)', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', width: `${pct}%`, borderRadius: 99,
                        background: pct >= 70
                          ? `linear-gradient(90deg,${MN.green},${MN.green2})`
                          : pct >= 40
                          ? 'linear-gradient(90deg,#D97706,#F59E0B)'
                          : `linear-gradient(90deg,${MN.red},${MN.red2})`,
                        boxShadow: pct >= 70 ? `0 0 12px rgba(0,108,53,0.5)` : undefined,
                      }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14 }}>
                      {[
                        { label: 'الإجمالي', value: total, color: MN.off },
                        { label: 'منجزة', value: doneCnt, color: MN.green2 },
                        { label: 'عاجلة', value: urgentCnt, color: '#F97316' },
                        { label: 'متأخرة', value: overdue, color: MN.red2 },
                      ].map((s, i) => (
                        <div key={i} style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 22, fontWeight: 900, color: s.color }}>{s.value}</div>
                          <div style={{ fontSize: 10, color: MN.gray }}>{s.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Eisenhower matrix */}
                  <div style={{ background: MN.bg3, borderRadius: 14, border: `1px solid ${MN.border}`, padding: '20px 24px' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: MN.gold, marginBottom: 14 }}>⊞ مصفوفة أيزنهاور للأولويات</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, position: 'relative' }}>
                      {MATRIX_CFG.map(q => {
                        const data = summary.matrix?.[q.key] || { count: 0, items: [] }
                        return (
                          <div key={q.key} style={{
                            background: `${q.color}10`, border: `1px solid ${q.color}35`,
                            borderRadius: 10, padding: '12px 14px',
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: q.color }}>{q.icon} {q.label}</span>
                              <span style={{ fontSize: 22, fontWeight: 900, color: q.color }}>{data.count}</span>
                            </div>
                            {(data.items || []).slice(0, 2).map((item, j) => (
                              <div key={j} style={{ display: 'flex', gap: 5, alignItems: 'flex-start', marginBottom: 2 }}>
                                <span style={{ color: q.color, fontSize: 11, flexShrink: 0 }}>›</span>
                                <span style={{ fontSize: 10, color: MN.off, lineHeight: 1.4 }}>{item}</span>
                              </div>
                            ))}
                          </div>
                        )
                      })}
                      <div style={{
                        position: 'absolute', top: '50%', left: '50%',
                        transform: 'translate(-50%,-50%)',
                        width: 26, height: 26, borderRadius: '50%',
                        background: MN.bg2, border: `2px solid ${MN.border}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, color: MN.gray,
                      }}>+</div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                      <span style={{ fontSize: 9, color: MN.gray }}>← غير عاجل</span>
                      <span style={{ fontSize: 9, color: MN.gray }}>عاجل →</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                background: MN.bg2, borderTop: `1px solid ${MN.border}`,
                padding: '9px 56px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ fontSize: 10, color: MN.gray }}>سري — للاستخدام الداخلي فقط</span>
                <div style={{ display: 'flex', gap: 5 }}>
                  <div style={{ width: 28, height: 3, borderRadius: 2, background: MN.gold }} />
                  <div style={{ width: 28, height: 3, borderRadius: 2, background: `${MN.gray}50` }} />
                </div>
                <span style={{ fontSize: 10, color: MN.gray }}>مكتب إدارة المشاريع — مركز عمليات المختبرات</span>
              </div>
            </div>

            {/* ── PDF SLIDE 2: Overview + People + Actions + Recommendations ── */}
            <div ref={slide2Ref} style={{
              width: 1280, height: 720,
              background: MN.bg,
              fontFamily: "'IBM Plex Sans Arabic', 'Segoe UI', system-ui, sans-serif",
              direction: 'rtl', overflow: 'hidden', position: 'relative',
              boxSizing: 'border-box',
            }}>
              {/* Top gradient bar */}
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 6, background: `linear-gradient(90deg, ${MN.gold}, ${MN.green})` }} />
              <div style={{ position: 'absolute', top: -80, right: -80, width: 260, height: 260, borderRadius: '50%', background: `radial-gradient(circle, rgba(201,168,76,0.06) 0%, transparent 70%)`, pointerEvents: 'none' }} />
              <div style={{ position: 'absolute', bottom: -60, left: -60, width: 200, height: 200, borderRadius: '50%', background: `radial-gradient(circle, rgba(0,108,53,0.07) 0%, transparent 70%)`, pointerEvents: 'none' }} />

              {/* Header */}
              <div style={{
                marginTop: 6, padding: '18px 56px 14px',
                background: `linear-gradient(180deg, ${MN.bg2} 0%, transparent 100%)`,
                borderBottom: `1px solid ${MN.border}`,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: MN.white }}>التحليل التفصيلي والتوصيات</div>
                  <div style={{ fontSize: 12, color: MN.gold, marginTop: 3 }}>مكتب إدارة المشاريع • مركز عمليات المختبرات</div>
                </div>
                <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <div style={{ fontSize: 11, color: MN.gray }}>{formatArabicDate()}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: MN.gold, boxShadow: `0 0 6px ${MN.gold}` }} />
                    <span style={{ fontSize: 10, color: MN.off }}>الشريحة 2 من 2</span>
                  </div>
                </div>
              </div>

              {/* Body — 2 columns */}
              <div style={{ padding: '18px 56px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, height: 570 }}>

                {/* Right column */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* Overview */}
                  {summary.overview?.length > 0 && (
                    <div style={{
                      background: MN.bg3, borderRadius: 14, border: `1px solid ${MN.border}`,
                      padding: '16px 20px', flex: summary.actionItems?.length > 0 ? 1 : 'unset',
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: MN.gold, marginBottom: 12 }}>🎯 الملخص التنفيذي</div>
                      {summary.overview.slice(0, 4).map((item, i) => (
                        <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'flex-start' }}>
                          <div style={{ width: 7, height: 7, borderRadius: '50%', background: MN.gold, flexShrink: 0, marginTop: 6 }} />
                          <span style={{ fontSize: 12, color: MN.off, lineHeight: 1.6 }}>{item}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Action Items */}
                  {summary.actionItems?.length > 0 && (
                    <div style={{
                      background: `rgba(192,57,43,0.06)`, borderRadius: 14,
                      border: `1px solid rgba(192,57,43,0.25)`, padding: '16px 20px', flex: 1,
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: MN.red2, marginBottom: 12 }}>⚡ مهام تحتاج قراراً</div>
                      {summary.actionItems.slice(0, 4).map((item, i) => {
                        const hi = item.priority === 'high'
                        return (
                          <div key={i} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            marginBottom: 7, padding: '6px 10px', borderRadius: 8,
                            background: hi ? 'rgba(239,68,68,0.09)' : 'rgba(255,255,255,0.03)',
                            border: `1px solid ${hi ? 'rgba(239,68,68,0.2)' : 'transparent'}`,
                          }}>
                            <span style={{ fontSize: 11, color: hi ? MN.red2 : MN.off }}>{hi ? '🔴' : '🔵'} {item.task || item.text}</span>
                            {item.owner && <span style={{ fontSize: 10, color: MN.gray, flexShrink: 0, paddingRight: 8 }}>{item.owner}</span>}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Left column */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* People Status */}
                  {summary.peopleStatus?.length > 0 && (
                    <div style={{
                      background: MN.bg3, borderRadius: 14, border: `1px solid ${MN.border}`,
                      padding: '16px 20px', flex: 1,
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: MN.gold, marginBottom: 12 }}>👥 حالة الفريق</div>
                      {summary.peopleStatus.slice(0, 5).map((person, i) => (
                        <div key={i} style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          marginBottom: 8, padding: '7px 10px', borderRadius: 8,
                          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{
                              width: 26, height: 26, borderRadius: '50%',
                              background: `rgba(201,168,76,0.15)`, border: `1px solid ${MN.border}`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12,
                            }}>👤</div>
                            <span style={{ fontSize: 12, fontWeight: 700, color: MN.white }}>{person.name}</span>
                          </div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <span style={{ fontSize: 10, color: MN.gray, background: 'rgba(255,255,255,0.07)', borderRadius: 5, padding: '2px 9px' }}>{person.pending?.length || 0} معلقة</span>
                            {person.overdueCount > 0 && (
                              <span style={{ fontSize: 10, color: MN.red2, background: 'rgba(192,57,43,0.15)', borderRadius: 5, padding: '2px 9px' }}>{person.overdueCount} متأخرة</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Recommendations */}
                  {summary.recommendations?.length > 0 && (
                    <div style={{
                      background: `linear-gradient(135deg, rgba(0,108,53,0.1), rgba(201,168,76,0.07))`,
                      borderRadius: 14, border: `1px solid rgba(201,168,76,0.22)`,
                      padding: '16px 20px', flex: summary.peopleStatus?.length > 0 ? 'unset' : 1,
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: MN.gold, marginBottom: 12 }}>💡 التوصيات الاستراتيجية</div>
                      {summary.recommendations.slice(0, 3).map((item, i) => (
                        <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'flex-start' }}>
                          <div style={{
                            width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                            background: 'rgba(201,168,76,0.18)', border: `1px solid rgba(201,168,76,0.4)`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 10, color: MN.gold, fontWeight: 900,
                          }}>{i + 1}</div>
                          <span style={{ fontSize: 11, color: MN.off, lineHeight: 1.6 }}>{item}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                background: MN.bg2, borderTop: `1px solid ${MN.border}`,
                padding: '9px 56px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ fontSize: 10, color: MN.gray }}>سري — للاستخدام الداخلي فقط</span>
                <div style={{ display: 'flex', gap: 5 }}>
                  <div style={{ width: 28, height: 3, borderRadius: 2, background: `${MN.gray}50` }} />
                  <div style={{ width: 28, height: 3, borderRadius: 2, background: MN.gold }} />
                </div>
                <span style={{ fontSize: 10, color: MN.gray }}>مكتب إدارة المشاريع — مركز عمليات المختبرات</span>
              </div>
            </div>

          </div>{/* end hidden slides */}

        </>
      )}
    </div>
  )
}
