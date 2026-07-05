import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../contexts/AuthContext'
import {
  subscribeToDeptReports, addDeptReport, updateDeptReport, deleteDeptReport,
  subscribeToReportTypes, addReportType, deleteReportType,
} from '../utils/db'
import { DEFAULT_REPORT_TYPES, TEAM_MEMBERS, STATUS_OPTIONS } from '../constants'
import ReportsPage from './ReportsPage'

export default function ReportTypesPage({ tasks = [], apiKey, showToast }) {
  const { firebaseUser, userProfile } = useAuth()
  const [showSummary, setShowSummary] = useState(false)
  const [reports, setReports] = useState([])
  const [customTypes, setCustomTypes] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [showAddType, setShowAddType] = useState(false)
  const [editingType, setEditingType] = useState(null)
  const [newTypeName, setNewTypeName] = useState('')
  const [filter, setFilter] = useState('all')
  const [editingId, setEditingId] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [confirmDeleteType, setConfirmDeleteType] = useState(null)
  const [form, setForm] = useState({
    reportType: 'periodic',
    person: '',
    notes: '',
    status: 'not_started',
  })

  useEffect(() => {
    const unsub1 = subscribeToDeptReports(setReports)
    const unsub2 = subscribeToReportTypes(setCustomTypes)
    return () => { unsub1(); unsub2() }
  }, [])

  const allTypes = [
    ...DEFAULT_REPORT_TYPES,
    ...customTypes.map(t => ({ value: t.id, label: t.name })),
  ]

  const getTypeName = (val) => {
    const found = allTypes.find(t => t.value === val)
    return found ? found.label : val
  }

  // الترقيم التسلسلي لكل نوع
  const getNextSeqNum = (reportType) => {
    const sameType = reports.filter(r => r.reportType === reportType)
    return sameType.length + 1
  }

  const filtered = filter === 'all' ? reports : reports.filter(r => r.reportType === filter)

  const resetForm = () => {
    setForm({ reportType: 'periodic', person: '', notes: '', status: 'not_started' })
    setEditingId(null)
    setShowForm(false)
  }

  // إضافة سريعة — زر واحد
  const handleQuickAdd = async (reportType) => {
    const seqNum = getNextSeqNum(reportType)
    const typeName = getTypeName(reportType)
    const userName = userProfile?.name || firebaseUser?.displayName || ''
    await addDeptReport({
      reportType,
      title: `${typeName} #${seqNum}`,
      seqNum,
      person: userName,
      notes: '',
      status: 'not_started',
    })
  }

  const handleSave = async () => {
    if (!form.reportType) return
    const userName = userProfile?.name || firebaseUser?.displayName || ''
    if (editingId) {
      await updateDeptReport(editingId, { ...form, updatedBy: userName })
    } else {
      const seqNum = getNextSeqNum(form.reportType)
      const typeName = getTypeName(form.reportType)
      await addDeptReport({
        ...form,
        title: `${typeName} #${seqNum}`,
        seqNum,
        createdBy: userName,
      })
    }
    resetForm()
  }

  const handleEdit = (r) => {
    setForm({
      reportType: r.reportType || 'periodic',
      person: r.person || '',
      notes: r.notes || '',
      status: r.status || 'not_started',
    })
    setEditingId(r.id)
    setShowForm(true)
  }

  const handleDelete = async (id) => {
    await deleteDeptReport(id)
    setConfirmDelete(null)
  }

  const handleToggleDone = async (r) => {
    const newStatus = r.status === 'completed' ? 'not_started' : 'completed'
    await updateDeptReport(r.id, {
      status: newStatus,
      ...(newStatus === 'completed' ? { completedAt: new Date().toISOString() } : { completedAt: '' }),
    })
  }

  const handleAddType = async () => {
    if (!newTypeName.trim()) return
    if (editingType) {
      // Firestore doesn't support update on report_types easily, so delete & re-add
      await deleteReportType(editingType.id)
      await addReportType({ name: newTypeName.trim() })
      setEditingType(null)
    } else {
      await addReportType({ name: newTypeName.trim() })
    }
    setNewTypeName('')
    setShowAddType(false)
  }

  const handleDeleteType = async (id) => {
    await deleteReportType(id)
    setConfirmDeleteType(null)
  }

  const statusColor = (status) => {
    const s = STATUS_OPTIONS.find(o => o.value === status)
    return s ? s.color : '#6b7280'
  }

  const formatDate = (d) => {
    if (!d) return ''
    try {
      const date = d.toDate ? d.toDate() : new Date(d)
      return date.toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    } catch { return '' }
  }

  const S = {
    container: { padding: '16px', maxWidth: 600, margin: '0 auto', fontFamily: 'system-ui, -apple-system, sans-serif', direction: 'rtl' },
    card: { background: 'var(--card)', borderRadius: 12, padding: 14, marginBottom: 10, border: '1px solid var(--border)' },
    btn: (bg) => ({ background: bg, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 14, fontWeight: 600, fontFamily: 'inherit' }),
    input: { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 14, boxSizing: 'border-box', marginBottom: 10, fontFamily: 'inherit' },
  }

  return (
    <div className="page" style={{ paddingBottom: 90 }}>
      {showSummary && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'var(--bg)', overflowY: 'auto' }}>
          <div style={{ position: 'sticky', top: 0, zIndex: 1001, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--text)', fontWeight: 800, fontSize: 15 }}>📊 تقرير حالة المهام</span>
            <button onClick={() => setShowSummary(false)} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 14px', color: 'var(--text)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>✕ إغلاق</button>
          </div>
          <ReportsPage tasks={tasks} apiKey={apiKey} showToast={showToast} userProfile={userProfile} />
        </div>
      )}
      <div style={S.container}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ color: 'var(--text)', margin: 0, fontSize: 20 }}>📋 التقارير</h2>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button onClick={() => setShowSummary(true)} style={S.btn('#f59e0b')}>📊 تقرير حالة المهام</button>
            <button onClick={() => { setShowAddType(true); setEditingType(null); setNewTypeName('') }} style={S.btn('#6366f1')}>+ نوع</button>
            <button onClick={() => { resetForm(); setShowForm(true) }} style={S.btn('#10b981')}>+ تقرير</button>
          </div>
        </div>

        {/* أزرار إضافة سريعة */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          {allTypes.map(t => (
            <button key={t.value} onClick={() => handleQuickAdd(t.value)} style={{
              ...S.btn('#1e40af'), fontSize: 12, padding: '6px 12px',
              background: 'rgba(59,130,246,0.12)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.25)',
            }}>⚡ {t.label}</button>
          ))}
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
          <button onClick={() => setFilter('all')} style={{
            ...S.btn(filter === 'all' ? '#3b82f6' : 'var(--bg3)'),
            fontSize: 12, padding: '6px 12px', color: filter === 'all' ? '#fff' : 'var(--text2)',
          }}>الكل ({reports.length})</button>
          {allTypes.map(t => {
            const count = reports.filter(r => r.reportType === t.value).length
            const isCustom = customTypes.some(ct => ct.id === t.value)
            return (
              <div key={t.value} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                <button onClick={() => setFilter(t.value)} style={{
                  ...S.btn(filter === t.value ? '#3b82f6' : 'var(--bg3)'),
                  fontSize: 12, padding: '6px 12px', color: filter === t.value ? '#fff' : 'var(--text2)',
                  borderTopLeftRadius: 0, borderBottomLeftRadius: 0,
                }}>{t.label} ({count})</button>
                {isCustom && (
                  confirmDeleteType === t.value ? (
                    <div style={{ display: 'flex', gap: 2 }}>
                      <button onClick={() => handleDeleteType(t.value)} style={{ ...S.btn('#ef4444'), padding: '4px 6px', fontSize: 10, borderRadius: '8px 0 0 8px' }}>حذف</button>
                      <button onClick={() => setConfirmDeleteType(null)} style={{ ...S.btn('var(--bg3)'), padding: '4px 6px', fontSize: 10 }}>لا</button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmDeleteType(t.value)} style={{
                      background: 'var(--bg3)', border: 'none', borderRadius: '8px 0 0 8px',
                      padding: '6px 6px', color: '#ef4444', cursor: 'pointer', fontSize: 11,
                    }}>✕</button>
                  )
                )}
              </div>
            )
          })}
        </div>

        {/* إضافة/تعديل نوع */}
        {showAddType && (
          <div style={{ ...S.card, background: 'var(--bg2)', marginBottom: 14 }}>
            <h4 style={{ color: 'var(--text)', margin: '0 0 10px' }}>{editingType ? 'تعديل نوع التقرير' : 'إضافة نوع تقرير جديد'}</h4>
            <input placeholder="اسم نوع التقرير..." value={newTypeName} onChange={e => setNewTypeName(e.target.value)} style={S.input} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleAddType} style={S.btn('#10b981')}>حفظ</button>
              <button onClick={() => { setShowAddType(false); setEditingType(null); setNewTypeName('') }} style={S.btn('var(--bg3)')}>إلغاء</button>
            </div>
            {customTypes.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <p style={{ color: 'var(--text2)', fontSize: 12, margin: '0 0 6px' }}>الأنواع المضافة:</p>
                {customTypes.map(t => (
                  <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--text)', fontSize: 13 }}>{t.name}</span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => { setEditingType(t); setNewTypeName(t.name) }} style={{ background: 'none', border: 'none', color: '#f59e0b', cursor: 'pointer', fontSize: 14 }}>✏️</button>
                      {confirmDeleteType === t.id ? (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => handleDeleteType(t.id)} style={{ ...S.btn('#ef4444'), padding: '2px 8px', fontSize: 11 }}>تأكيد</button>
                          <button onClick={() => setConfirmDeleteType(null)} style={{ ...S.btn('var(--bg3)'), padding: '2px 8px', fontSize: 11 }}>لا</button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmDeleteType(t.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14 }}>🗑</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Form */}
        {showForm && (
          <div style={{ ...S.card, border: '1px solid #3b82f6', marginBottom: 14 }}>
            <h4 style={{ color: 'var(--text)', margin: '0 0 12px' }}>{editingId ? 'تعديل تقرير' : 'إضافة تقرير'}</h4>
            <label style={{ color: 'var(--text2)', fontSize: 12 }}>نوع التقرير</label>
            <select value={form.reportType} onChange={e => setForm({ ...form, reportType: e.target.value })} style={S.input}>
              {allTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <label style={{ color: 'var(--text2)', fontSize: 12 }}>المسؤول</label>
            <select value={form.person} onChange={e => setForm({ ...form, person: e.target.value })} style={S.input}>
              <option value="">— اختر —</option>
              {TEAM_MEMBERS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <label style={{ color: 'var(--text2)', fontSize: 12 }}>الحالة</label>
            <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} style={S.input}>
              {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <label style={{ color: 'var(--text2)', fontSize: 12 }}>ملاحظات</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="ملاحظات اختيارية..." style={{ ...S.input, resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleSave} style={S.btn('#10b981')}>💾 حفظ</button>
              <button onClick={resetForm} style={S.btn('var(--bg3)')}>إلغاء</button>
            </div>
          </div>
        )}

        {/* Reports list */}
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text3)', padding: 40 }}>
            لا توجد تقارير {filter !== 'all' ? `من نوع "${getTypeName(filter)}"` : ''}
          </div>
        ) : (
          filtered.map(r => (
            <div key={r.id} style={S.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                    <span style={{
                      background: statusColor(r.status), color: '#fff', borderRadius: 6,
                      padding: '2px 8px', fontSize: 11, fontWeight: 600,
                    }}>{STATUS_OPTIONS.find(s => s.value === r.status)?.label || 'لم يبدأ'}</span>
                    <span style={{
                      background: 'rgba(99,102,241,0.2)', color: '#a5b4fc',
                      borderRadius: 6, padding: '2px 8px', fontSize: 11,
                    }}>{getTypeName(r.reportType)}</span>
                    {r.seqNum && (
                      <span style={{
                        background: 'rgba(245,158,11,0.15)', color: '#f59e0b',
                        borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700,
                      }}>#{r.seqNum}</span>
                    )}
                  </div>
                  {r.title && <p style={{ color: 'var(--text)', fontSize: 14, fontWeight: 700, margin: '4px 0' }}>{r.title}</p>}
                  {r.person && <p style={{ color: 'var(--text2)', fontSize: 13, margin: '4px 0' }}>👤 {r.person}</p>}
                  {r.createdAt && <p style={{ color: 'var(--text3)', fontSize: 12, margin: '2px 0' }}>🕐 {formatDate(r.createdAt)}</p>}
                  {r.notes && <p style={{ color: 'var(--text2)', fontSize: 13, margin: '6px 0 0', lineHeight: 1.5 }}>{r.notes}</p>}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => handleToggleDone(r)} style={{
                    background: r.status === 'completed' ? '#10b981' : 'var(--bg3)',
                    border: 'none', borderRadius: 8, width: 32, height: 32,
                    color: '#fff', cursor: 'pointer', fontSize: 16,
                  }}>✓</button>
                  <button onClick={() => handleEdit(r)} style={{
                    background: 'var(--bg3)', border: 'none', borderRadius: 8,
                    width: 32, height: 32, color: '#f59e0b', cursor: 'pointer', fontSize: 14,
                  }}>✏️</button>
                  {confirmDelete === r.id ? (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => handleDelete(r.id)} style={{ ...S.btn('#ef4444'), padding: '4px 8px', fontSize: 12 }}>تأكيد</button>
                      <button onClick={() => setConfirmDelete(null)} style={{ ...S.btn('var(--bg3)'), padding: '4px 8px', fontSize: 12 }}>لا</button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmDelete(r.id)} style={{
                      background: 'var(--bg3)', border: 'none', borderRadius: 8,
                      width: 32, height: 32, color: '#ef4444', cursor: 'pointer', fontSize: 14,
                    }}>🗑</button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}

        {/* Stats */}
        <div style={{
          background: 'var(--bg2)', borderRadius: 12, padding: 14, marginTop: 16,
          border: '1px solid var(--border)',
        }}>
          <p style={{ color: 'var(--text2)', fontSize: 13, margin: 0, textAlign: 'center' }}>
            📊 إجمالي: {reports.length} | مكتمل: {reports.filter(r => r.status === 'completed').length} | متبقي: {reports.filter(r => r.status !== 'completed').length}
          </p>
        </div>
      </div>
    </div>
  )
}
