import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import {
  subscribeToInitiatives, subscribeToRasedReports, subscribeToRasedMeetings,
  addInitiative, addRasedReport, addRasedMeeting,
  updateRegistryItem, deleteRegistryItem,
} from '../utils/db'
import {
  TEAM_MEMBERS, RASED_DEPARTMENTS, RASED_FREQUENCIES,
  RASED_REPORT_STATUS, RASED_MEETING_TYPES, RASED_PRIORITIES,
} from '../constants'

/**
 * 🗂 سجل راصد — إدارة المبادرات والتقارير الدورية والاجتماعات
 * (تُستورد من ملف راصد وتُصدَّر إليه حرفياً)
 */

const TYPES = {
  initiatives: {
    label: 'المبادرات', icon: '🚀', coll: 'rased_initiatives', add: addInitiative,
    fields: [
      { key: 'name', label: 'اسم المبادرة', type: 'text', required: true },
      { key: 'description', label: 'الوصف', type: 'textarea' },
      { key: 'department', label: 'القسم', type: 'select', options: RASED_DEPARTMENTS },
      { key: 'startDate', label: 'تاريخ البداية', type: 'date' },
      { key: 'dueDate', label: 'تاريخ الاستحقاق', type: 'date' },
      { key: 'completion', label: 'نسبة الإنجاز %', type: 'select', options: ['0', '10', '20', '30', '40', '50', '60', '70', '80', '90', '100'] },
      { key: 'priority', label: 'الأولوية', type: 'select', options: RASED_PRIORITIES },
      { key: 'owner', label: 'المسؤول', type: 'select', options: TEAM_MEMBERS },
      { key: 'secondaryOwner', label: 'الاحتياط', type: 'select', options: TEAM_MEMBERS },
      { key: 'comments', label: 'ملاحظات', type: 'textarea' },
    ],
  },
  reports: {
    label: 'التقارير', icon: '📄', coll: 'rased_reports', add: addRasedReport,
    fields: [
      { key: 'name', label: 'اسم التقرير', type: 'text', required: true },
      { key: 'purpose', label: 'الغرض', type: 'textarea' },
      { key: 'frequency', label: 'التكرار', type: 'select', options: RASED_FREQUENCIES },
      { key: 'department', label: 'القسم', type: 'select', options: RASED_DEPARTMENTS },
      { key: 'startDate', label: 'تاريخ البداية', type: 'date' },
      { key: 'dueDate', label: 'تاريخ الاستحقاق', type: 'date' },
      { key: 'status', label: 'الحالة', type: 'select', options: RASED_REPORT_STATUS },
      { key: 'priority', label: 'الأولوية', type: 'select', options: RASED_PRIORITIES },
      { key: 'owner', label: 'المسؤول', type: 'select', options: TEAM_MEMBERS },
      { key: 'secondaryOwner', label: 'الاحتياط', type: 'select', options: TEAM_MEMBERS },
      { key: 'comments', label: 'ملاحظات', type: 'textarea' },
    ],
  },
  meetings: {
    label: 'الاجتماعات', icon: '🤝', coll: 'rased_meetings', add: addRasedMeeting,
    fields: [
      { key: 'name', label: 'اسم الاجتماع', type: 'text', required: true },
      { key: 'purpose', label: 'الغرض', type: 'textarea' },
      { key: 'meetingType', label: 'نوع الاجتماع', type: 'select', options: RASED_MEETING_TYPES },
      { key: 'department', label: 'القسم', type: 'select', options: RASED_DEPARTMENTS },
      { key: 'frequency', label: 'التكرار', type: 'select', options: RASED_FREQUENCIES },
      { key: 'schedule', label: 'الموعد (نصي)', type: 'text' },
      { key: 'statusWeek', label: 'حالة الأسبوع الحالي', type: 'select', options: ['Not Done', 'Done'] },
      { key: 'organizer', label: 'المنظم', type: 'select', options: TEAM_MEMBERS },
      { key: 'comments', label: 'ملاحظات', type: 'textarea' },
    ],
  },
}

const STATUS_AR = {
  'Completed': { label: 'مكتمل', color: '#10b981' },
  'In Progress': { label: 'جاري', color: '#3b82f6' },
  'Delayed': { label: 'متأخر', color: '#ef4444' },
  'Not Started': { label: 'لم يبدأ', color: '#6b7280' },
  'Done': { label: 'انعقد ✓', color: '#10b981' },
  'Not Done': { label: 'لم ينعقد', color: '#d97706' },
}

export default function RasedRegistry({ showToast }) {
  const { isAdmin, isSuperUser } = useAuth()
  const canEdit = isAdmin || isSuperUser
  const [tab, setTab] = useState('initiatives')
  const [items, setItems] = useState({ initiatives: [], reports: [], meetings: [] })
  const [editing, setEditing] = useState(null) // {typeKey, item|null}
  const [form, setForm] = useState({})
  const [confirmDel, setConfirmDel] = useState(null)

  useEffect(() => {
    const u1 = subscribeToInitiatives(v => setItems(p => ({ ...p, initiatives: v })))
    const u2 = subscribeToRasedReports(v => setItems(p => ({ ...p, reports: v })))
    const u3 = subscribeToRasedMeetings(v => setItems(p => ({ ...p, meetings: v })))
    return () => { u1(); u2(); u3() }
  }, [])

  const T = TYPES[tab]
  const list = items[tab]

  function openForm(item) {
    setForm(item ? { ...item } : {})
    setEditing({ typeKey: tab, item })
  }

  async function save() {
    const req = T.fields.find(f => f.required && !(form[f.key] || '').trim())
    if (req) { showToast(`❌ ${req.label} مطلوب`); return }
    const data = {}
    T.fields.forEach(f => { data[f.key] = form[f.key] || '' })
    try {
      if (editing.item) {
        await updateRegistryItem(T.coll, editing.item.id, data)
        showToast('✏️ تم التحديث')
      } else {
        await TYPES[editing.typeKey].add(data)
        showToast('✅ تمت الإضافة')
      }
      setEditing(null)
    } catch (e) { showToast('❌ خطأ في الحفظ') }
  }

  const inputStyle = {
    width: '100%', boxSizing: 'border-box', background: 'var(--bg2)', color: 'var(--text)',
    border: '1px solid var(--border)', borderRadius: 10, padding: '9px 10px',
    fontSize: 13, fontFamily: 'inherit', marginBottom: 10,
  }

  return (
    <div style={{ direction: 'rtl' }}>
      {/* تبويبات السجل */}
      <div style={{ display: 'flex', gap: 6, margin: '4px 0 14px', flexWrap: 'wrap' }}>
        {Object.entries(TYPES).map(([k, t]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            flex: 1, minWidth: 90, padding: '9px 6px', borderRadius: 10, border: 'none',
            background: tab === k ? 'linear-gradient(135deg, #f59e0b, #f43f5e)' : 'var(--bg3)',
            color: tab === k ? '#fff' : 'var(--text2)',
            fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          }}>{t.icon} {t.label} ({items[k].length})</button>
        ))}
      </div>

      {canEdit && (
        <button onClick={() => openForm(null)} style={{
          width: '100%', padding: '10px', marginBottom: 14, borderRadius: 10,
          border: '1px dashed var(--border)', background: 'var(--bg2)',
          color: 'var(--text2)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
        }}>+ إضافة {T.label.slice(0, -2) === 'المبادر' ? 'مبادرة' : tab === 'reports' ? 'تقرير' : 'اجتماع'}</button>
      )}

      {list.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--text3)', padding: 30, fontSize: 13 }}>
          لا توجد سجلات — استوردها من ملف راصد (المهام → استيراد Excel) أو أضفها يدوياً
        </div>
      )}

      {list.map(item => {
        const st = STATUS_AR[item.status || item.statusWeek] || null
        const comp = item.completion !== undefined && item.completion !== '' ? Number(item.completion) : null
        return (
          <div key={item.id} style={{
            background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
            padding: 13, marginBottom: 9,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', flex: 1, lineHeight: 1.5 }}>{item.name}</div>
              {canEdit && (
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => openForm(item)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>✏️</button>
                  <button onClick={() => setConfirmDel(item)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>🗑</button>
                </div>
              )}
            </div>
            {item.purpose || item.description ? (
              <div style={{ fontSize: 11.5, color: 'var(--text2)', margin: '4px 0', lineHeight: 1.6 }}>{item.purpose || item.description}</div>
            ) : null}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              {st && <span style={{ background: `${st.color}20`, color: st.color, borderRadius: 6, padding: '2px 8px', fontSize: 10.5, fontWeight: 700 }}>{st.label}</span>}
              {comp !== null && !isNaN(comp) && <span style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981', borderRadius: 6, padding: '2px 8px', fontSize: 10.5, fontWeight: 700 }}>{comp}%</span>}
              {item.frequency && <span style={{ background: 'var(--bg3)', color: 'var(--text2)', borderRadius: 6, padding: '2px 8px', fontSize: 10.5 }}>🔁 {item.frequency}</span>}
              {item.schedule && <span style={{ background: 'var(--bg3)', color: 'var(--text2)', borderRadius: 6, padding: '2px 8px', fontSize: 10.5 }}>🕐 {item.schedule}</span>}
              {(item.owner || item.organizer) && <span style={{ background: 'var(--bg3)', color: 'var(--text2)', borderRadius: 6, padding: '2px 8px', fontSize: 10.5 }}>👤 {item.owner || item.organizer}</span>}
              {item.dueDate && <span style={{ background: 'var(--bg3)', color: 'var(--text2)', borderRadius: 6, padding: '2px 8px', fontSize: 10.5 }}>📅 {item.dueDate}</span>}
            </div>
          </div>
        )
      })}

      {/* نموذج الإضافة/التعديل */}
      {editing && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={() => setEditing(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg)', borderRadius: '18px 18px 0 0', padding: '18px 16px 30px',
            width: '100%', maxWidth: 560, maxHeight: '85vh', overflowY: 'auto', direction: 'rtl',
          }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', marginBottom: 14 }}>
              {editing.item ? '✏️ تعديل' : '➕ إضافة'} — {TYPES[editing.typeKey].label}
            </div>
            {TYPES[editing.typeKey].fields.map(f => (
              <div key={f.key}>
                <div style={{ fontSize: 11.5, color: 'var(--text2)', marginBottom: 4 }}>{f.label}{f.required ? ' *' : ''}</div>
                {f.type === 'textarea' ? (
                  <textarea value={form[f.key] || ''} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} rows={2} style={inputStyle} />
                ) : f.type === 'select' ? (
                  <select value={form[f.key] || ''} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} style={inputStyle}>
                    <option value="">— اختر —</option>
                    {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input type={f.type} value={form[f.key] || ''} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} style={inputStyle} />
                )}
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <button onClick={save} style={{ flex: 1, padding: '11px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #f59e0b, #f43f5e)', color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>حفظ</button>
              <button onClick={() => setEditing(null)} style={{ flex: 1, padding: '11px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* تأكيد الحذف */}
      {confirmDel && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setConfirmDel(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg)', borderRadius: 16, padding: 18, width: '100%', maxWidth: 360, direction: 'rtl' }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>حذف "{confirmDel.name}"؟</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 14 }}>سيُحذف من السجل ومن ملف راصد في التصدير القادم.</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={async () => {
                try { await deleteRegistryItem(T.coll, confirmDel.id); showToast('🗑 تم الحذف') } catch { showToast('❌ خطأ') }
                setConfirmDel(null)
              }} style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', background: '#ef4444', color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>حذف</button>
              <button onClick={() => setConfirmDel(null)} style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
