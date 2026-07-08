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

/* ═══ سجل راصد — التقارير والاجتماعات (صفحة التقارير) + المبادرات (صفحة مستقلة) ═══
   تعكس بيانات ملف راصد مباشرة: ما يُعدّل هنا يطلع في التصدير القادم */

const FREQ_AR = { Weekly: 'أسبوعي', Monthly: 'شهري', Quarterly: 'ربعي', Annual: 'سنوي' }
const STATUS_AR = {
  'Completed': { label: 'مكتمل', color: '#10b981' },
  'In Progress': { label: 'جاري', color: '#3b82f6' },
  'Delayed': { label: 'متأخر', color: '#ef4444' },
  'Not Started': { label: 'لم يبدأ', color: '#6b7280' },
  'Done': { label: 'انعقد ✓', color: '#10b981' },
  'Not Done': { label: 'لم ينعقد', color: '#d97706' },
}

const FIELDS = {
  initiatives: [
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
  reports: [
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
  meetings: [
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
}
const COLLS = { initiatives: 'rased_initiatives', reports: 'rased_reports', meetings: 'rased_meetings' }
const ADDERS = { initiatives: addInitiative, reports: addRasedReport, meetings: addRasedMeeting }

const inputStyle = {
  width: '100%', boxSizing: 'border-box', background: 'var(--bg2)', color: 'var(--text)',
  border: '1px solid var(--border)', borderRadius: 10, padding: '9px 10px',
  fontSize: 13, fontFamily: 'inherit', marginBottom: 10,
}

/* ── النموذج المشترك (إضافة/تعديل) ── */
function RegistryForm({ typeKey, item, onClose, showToast }) {
  const [form, setForm] = useState(item ? { ...item } : {})
  const fields = FIELDS[typeKey]
  async function save() {
    const req = fields.find(f => f.required && !(form[f.key] || '').trim())
    if (req) { showToast(`❌ ${req.label} مطلوب`); return }
    const data = {}
    fields.forEach(f => { data[f.key] = form[f.key] || '' })
    try {
      if (item) { await updateRegistryItem(COLLS[typeKey], item.id, data); showToast('✏️ تم التحديث') }
      else { await ADDERS[typeKey](data); showToast('✅ تمت الإضافة') }
      onClose()
    } catch { showToast('❌ خطأ في الحفظ') }
  }
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg)', borderRadius: '18px 18px 0 0', padding: '18px 16px 30px',
        width: '100%', maxWidth: 560, maxHeight: '85vh', overflowY: 'auto', direction: 'rtl',
      }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', marginBottom: 14 }}>
          {item ? '✏️ تعديل' : '➕ إضافة'}
        </div>
        {fields.map(f => (
          <div key={f.key}>
            <div style={{ fontSize: 11.5, color: 'var(--text2)', marginBottom: 4 }}>{f.label}{f.required ? ' *' : ''}</div>
            {f.type === 'textarea' ? (
              <textarea value={form[f.key] || ''} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} rows={2} style={inputStyle} />
            ) : f.type === 'select' ? (
              <select value={form[f.key] || ''} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} style={inputStyle}>
                <option value="">— اختر —</option>
                {f.options.map(o => <option key={o} value={o}>{FREQ_AR[o] || o}</option>)}
              </select>
            ) : (
              <input type={f.type} value={form[f.key] || ''} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} style={inputStyle} />
            )}
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <button onClick={save} style={{ flex: 1, padding: '11px', borderRadius: 10, border: 'none', background: '#10b981', color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>حفظ</button>
          <button onClick={onClose} style={{ flex: 1, padding: '11px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>إلغاء</button>
        </div>
      </div>
    </div>
  )
}

/* ── بطاقة سجل ── */
function RegistryCard({ item, canEdit, onEdit, onDelete }) {
  const st = STATUS_AR[item.status || item.statusWeek] || null
  const comp = item.completion !== undefined && item.completion !== '' ? Number(item.completion) : null
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 13, marginBottom: 9 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', flex: 1, lineHeight: 1.5 }}>{item.name}</div>
        {canEdit && (
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button onClick={onEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>✏️</button>
            <button onClick={onDelete} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>🗑</button>
          </div>
        )}
      </div>
      {(item.purpose || item.description) && (
        <div style={{ fontSize: 11.5, color: 'var(--text2)', margin: '4px 0', lineHeight: 1.6 }}>{item.purpose || item.description}</div>
      )}
      {comp !== null && !isNaN(comp) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '7px 0 3px' }}>
          <div style={{ flex: 1, height: 6, background: 'var(--bg3)', borderRadius: 5, overflow: 'hidden' }}>
            <div style={{ width: `${comp}%`, height: '100%', background: comp >= 100 ? '#10b981' : 'linear-gradient(90deg, #f59e0b, #f43f5e)', borderRadius: 5 }} />
          </div>
          <span style={{ fontSize: 11, fontWeight: 800, color: comp >= 100 ? '#10b981' : 'var(--text2)' }}>{comp}%</span>
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
        {st && <span style={{ background: `${st.color}20`, color: st.color, borderRadius: 6, padding: '2px 8px', fontSize: 10.5, fontWeight: 700 }}>{st.label}</span>}
        {item.frequency && <span style={{ background: 'var(--bg3)', color: 'var(--text2)', borderRadius: 6, padding: '2px 8px', fontSize: 10.5 }}>🔁 {FREQ_AR[item.frequency] || item.frequency}</span>}
        {item.schedule && <span style={{ background: 'var(--bg3)', color: 'var(--text2)', borderRadius: 6, padding: '2px 8px', fontSize: 10.5 }}>🕐 {item.schedule}</span>}
        {(item.owner || item.organizer) && <span style={{ background: 'var(--bg3)', color: 'var(--text2)', borderRadius: 6, padding: '2px 8px', fontSize: 10.5 }}>👤 {item.owner || item.organizer}</span>}
        {item.dueDate && <span style={{ background: 'var(--bg3)', color: 'var(--text2)', borderRadius: 6, padding: '2px 8px', fontSize: 10.5 }}>📅 {item.dueDate}</span>}
      </div>
    </div>
  )
}

function DeleteConfirm({ item, coll, onClose, showToast }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg)', borderRadius: 16, padding: 18, width: '100%', maxWidth: 360, direction: 'rtl' }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>حذف "{item.name}"؟</div>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 14 }}>سيُحذف من السجل ومن ملف راصد في التصدير القادم.</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={async () => {
            try { await deleteRegistryItem(coll, item.id); showToast('🗑 تم الحذف') } catch { showToast('❌ خطأ') }
            onClose()
          }} style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', background: '#ef4444', color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>حذف</button>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>إلغاء</button>
        </div>
      </div>
    </div>
  )
}

const chipStyle = (active) => ({
  padding: '7px 14px', borderRadius: 20, border: 'none', whiteSpace: 'nowrap',
  background: active ? '#3b82f6' : 'var(--bg3)', color: active ? '#fff' : 'var(--text2)',
  fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
})

/* ═══ صفحة التقارير (بالتصميم القديم — تعكس راصد مباشرة) + الاجتماعات ═══ */
export function RasedReportsPage({ showToast }) {
  const { isAdmin, isSuperUser } = useAuth()
  const canEdit = isAdmin || isSuperUser
  const [view, setView] = useState('reports')
  const [reports, setReports] = useState([])
  const [meetings, setMeetings] = useState([])
  const [freqFilter, setFreqFilter] = useState('all')
  const [editing, setEditing] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)

  useEffect(() => {
    const u1 = subscribeToRasedReports(setReports)
    const u2 = subscribeToRasedMeetings(setMeetings)
    return () => { u1(); u2() }
  }, [])

  const isReports = view === 'reports'
  const typeKey = isReports ? 'reports' : 'meetings'
  const listAll = isReports ? reports : meetings
  const list = isReports && freqFilter !== 'all' ? reports.filter(r => r.frequency === freqFilter) : listAll
  const doneCount = isReports
    ? listAll.filter(r => r.status === 'Completed').length
    : listAll.filter(m => m.statusWeek === 'Done').length

  return (
    <div className="page" style={{ paddingBottom: 90 }}>
      <div style={{ padding: 16, maxWidth: 600, margin: '0 auto', direction: 'rtl' }}>
        {/* الهيدر بالتصميم القديم */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <h2 style={{ color: 'var(--text)', margin: 0, fontSize: 20 }}>📋 التقارير</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            {canEdit && (
              <button onClick={() => setEditing({ typeKey, item: null })} style={{
                padding: '9px 16px', borderRadius: 10, border: 'none', background: '#10b981',
                color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
              }}>+ {isReports ? 'تقرير' : 'اجتماع'}</button>
            )}
          </div>
        </div>

        {/* تبديل تقارير | اجتماعات */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <button onClick={() => setView('reports')} style={{ ...chipStyle(isReports), flex: 1, padding: '9px' }}>📄 التقارير ({reports.length})</button>
          <button onClick={() => setView('meetings')} style={{ ...chipStyle(!isReports), flex: 1, padding: '9px' }}>🤝 الاجتماعات ({meetings.length})</button>
        </div>

        {/* فلاتر التكرار (تقارير فقط) */}
        {isReports && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto', paddingBottom: 4 }}>
            <button onClick={() => setFreqFilter('all')} style={chipStyle(freqFilter === 'all')}>الكل ({reports.length})</button>
            {RASED_FREQUENCIES.map(f => (
              <button key={f} onClick={() => setFreqFilter(f)} style={chipStyle(freqFilter === f)}>
                {FREQ_AR[f]} ({reports.filter(r => r.frequency === f).length})
              </button>
            ))}
          </div>
        )}

        {/* شريط العدادات القديم */}
        <div style={{
          background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12,
          padding: '10px 14px', marginBottom: 14, fontSize: 12.5, color: 'var(--text2)', textAlign: 'center', fontWeight: 700,
        }}>
          📊 إجمالي: {listAll.length} | {isReports ? 'مكتمل' : 'انعقد'}: {doneCount} | متبقي: {listAll.length - doneCount}
        </div>

        {list.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text3)', padding: 36, fontSize: 13 }}>لا توجد سجلات</div>
        )}
        {list.map(item => (
          <RegistryCard key={item.id} item={item} canEdit={canEdit}
            onEdit={() => setEditing({ typeKey, item })}
            onDelete={() => setConfirmDel(item)} />
        ))}
      </div>

      {editing && <RegistryForm typeKey={editing.typeKey} item={editing.item} onClose={() => setEditing(null)} showToast={showToast} />}
      {confirmDel && <DeleteConfirm item={confirmDel} coll={COLLS[typeKey]} onClose={() => setConfirmDel(null)} showToast={showToast} />}
    </div>
  )
}

/* ═══ صفحة المبادرات (مستقلة) ═══ */
export function InitiativesPage({ showToast }) {
  const { isAdmin, isSuperUser } = useAuth()
  const canEdit = isAdmin || isSuperUser
  const [items, setItems] = useState([])
  const [editing, setEditing] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)

  useEffect(() => subscribeToInitiatives(setItems), [])

  const doneCount = items.filter(i => Number(i.completion) >= 100).length

  return (
    <div className="page" style={{ paddingBottom: 90 }}>
      <div style={{ padding: 16, maxWidth: 600, margin: '0 auto', direction: 'rtl' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ color: 'var(--text)', margin: 0, fontSize: 20 }}>🚀 المبادرات</h2>
          {canEdit && (
            <button onClick={() => setEditing({ item: null })} style={{
              padding: '9px 16px', borderRadius: 10, border: 'none', background: '#10b981',
              color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
            }}>+ مبادرة</button>
          )}
        </div>

        <div style={{
          background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12,
          padding: '10px 14px', marginBottom: 14, fontSize: 12.5, color: 'var(--text2)', textAlign: 'center', fontWeight: 700,
        }}>
          📊 إجمالي: {items.length} | مكتمل: {doneCount} | جاري: {items.length - doneCount}
        </div>

        {items.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text3)', padding: 36, fontSize: 13 }}>لا توجد مبادرات</div>
        )}
        {items.map(item => (
          <RegistryCard key={item.id} item={item} canEdit={canEdit}
            onEdit={() => setEditing({ item })}
            onDelete={() => setConfirmDel(item)} />
        ))}
      </div>

      {editing && <RegistryForm typeKey="initiatives" item={editing.item} onClose={() => setEditing(null)} showToast={showToast} />}
      {confirmDel && <DeleteConfirm item={confirmDel} coll="rased_initiatives" onClose={() => setConfirmDel(null)} showToast={showToast} />}
    </div>
  )
}
