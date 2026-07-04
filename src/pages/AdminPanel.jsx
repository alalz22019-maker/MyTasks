import { useState, useEffect } from 'react'
import { ARCHIVE_CUTOFF } from '../constants'
import { getAuth } from 'firebase/auth'
import {
  getAllUsers, createUser, updateUserRole, deleteUser,
  subscribeToPendingRequests, approveRequest, rejectRequest,
} from '../utils/db'
import PullToRefresh from '../components/PullToRefresh'

const ROLES = [
  { value: 'admin',     label: 'مدير',    color: '#a78bfa' },
  { value: 'superuser', label: 'مشرف',    color: '#60a5fa' },
  { value: 'user',      label: 'مستخدم',  color: '#34d399' },
]

const REQUEST_TYPE_LABEL = {
  add:        '➕ إضافة مهمة',
  edit_title: '✏️ تعديل عنوان',
  edit_date:  '📅 تعديل تاريخ',
  close:      '✅ إغلاق مهمة',
}

export default function AdminPanel({ showToast, canManageUsers = false }) {
  const [tab, setTab] = useState('requests')
  const [users, setUsers]     = useState([])
  const [requests, setRequests] = useState([])
  const [loadingUsers, setLoadingUsers]   = useState(false)
  const [actionLoading, setActionLoading] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null) // {uid, name}

  // Add user form
  const [addForm, setAddForm] = useState({ email: '', name: '', role: 'user' })
  const [addingUser, setAddingUser] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)

  /* ── Load users ── */
  useEffect(() => {
    if (tab !== 'users') return
    setLoadingUsers(true)
    getAllUsers()
      .then(setUsers)
      .catch(() => showToast('❌ خطأ في تحميل المستخدمين'))
      .finally(() => setLoadingUsers(false))
  }, [tab])

  /* ── Subscribe to requests ── */
  useEffect(() => {
    const unsub = subscribeToPendingRequests(list => {
      /* إخفاء طلبات عهد المختبرات (قبل فاصل الأرشيف) */
      const cutoff = new Date(ARCHIVE_CUTOFF); cutoff.setHours(0, 0, 0, 0)
      setRequests(list.filter(r => {
        try {
          const created = r.createdAt?.toDate ? r.createdAt.toDate() : (r.createdAt ? new Date(r.createdAt) : null)
          return !created || created >= cutoff
        } catch { return true }
      }))
    })
    return unsub
  }, [])

  const pendingReqs = requests.filter(r => r.status === 'pending')
  const historyReqs = requests.filter(r => r.status !== 'pending')

  /* ── User actions ── */
  async function handleAddUser() {
    if (!addForm.email.trim() || !addForm.name.trim()) {
      showToast('⚠️ أدخل الاسم والإيميل')
      return
    }
    setAddingUser(true)
    try {
      // Use email as UID seed — admin needs to know user's Firebase UID.
      // In practice the user must sign in first; we store their profile by UID.
      // Here we create a placeholder by email that gets matched on first sign-in
      // via AuthContext. For a real setup this would use Admin SDK / Cloud Function.
      // We use the email hash as a stub UID for pre-registration.
      const stubUid = btoa(addForm.email.trim().toLowerCase()).replace(/[^a-z0-9]/gi, '').slice(0, 28)
      await createUser({
        uid: stubUid,
        email: addForm.email.trim().toLowerCase(),
        name: addForm.name.trim(),
        role: addForm.role,
      })
      showToast(`✅ تم إضافة ${addForm.name}`)
      setAddForm({ email: '', name: '', role: 'user' })
      setShowAddForm(false)
      const updated = await getAllUsers()
      setUsers(updated)
    } catch (e) {
      showToast('❌ خطأ في إضافة المستخدم')
    } finally {
      setAddingUser(false)
    }
  }

  async function handleRoleChange(uid, role) {
    setActionLoading(uid)
    try {
      await updateUserRole(uid, role)
      setUsers(prev => prev.map(u => u.uid === uid ? { ...u, role } : u))
      showToast('✅ تم تحديث الصلاحية')
    } catch {
      showToast('❌ خطأ في التحديث')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleDeleteUser(uid, name) {
    if (!deleteConfirm || deleteConfirm.uid !== uid) {
      setDeleteConfirm({ uid, name })
      return
    }
    setDeleteConfirm(null)
    setActionLoading(uid)
    try {
      await deleteUser(uid)
      setUsers(prev => prev.filter(u => u.uid !== uid))
      showToast('🗑 تم حذف المستخدم')
    } catch {
      showToast('❌ خطأ في الحذف')
    } finally {
      setActionLoading(null)
    }
  }

  /* ── Request actions ── */
  async function handleApprove(req) {
    setActionLoading(req.id)
    try {
      await approveRequest(req.id, req)
      showToast('✅ تم قبول الطلب وتطبيقه')
    } catch {
      showToast('❌ خطأ في قبول الطلب')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleReject(req) {
    setActionLoading(req.id)
    try {
      await rejectRequest(req.id)
      showToast('🚫 تم رفض الطلب')
    } catch {
      showToast('❌ خطأ في الرفض')
    } finally {
      setActionLoading(null)
    }
  }

  function formatTs(ts) {
    if (!ts) return ''
    const d = ts.toDate ? ts.toDate() : new Date(ts)
    return d.toLocaleDateString('ar-SA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <PullToRefresh onRefresh={() => showToast?.('✓ محدّث')}>
      <div className="header">
        <div className="header-title">⚙️ لوحة الإدارة</div>
        <div className="header-sub">إدارة المستخدمين والطلبات</div>
      </div>

      {/* Tab bar */}
      <div className="report-tab-bar">
        <button
          className={`report-tab${tab === 'requests' ? ' active' : ''}`}
          onClick={() => setTab('requests')}
          style={{ position: 'relative' }}
        >
          الطلبات
          {pendingReqs.length > 0 && (
            <span style={{
              position: 'absolute', top: 4, right: 4,
              background: '#ef4444', color: '#fff',
              borderRadius: '50%', width: 16, height: 16,
              fontSize: 10, fontWeight: 700,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>{pendingReqs.length}</span>
          )}
        </button>
        {canManageUsers && (
        <button
          className={`report-tab${tab === 'users' ? ' active' : ''}`}
          onClick={() => setTab('users')}
        >المستخدمون</button>
        )}
        <button
          className={`report-tab${tab === 'history' ? ' active' : ''}`}
          onClick={() => setTab('history')}
        >السجل</button>
      </div>

      {/* ── Requests tab ── */}
      {tab === 'requests' && (
        <div style={{ padding: '12px 16px' }}>
          {pendingReqs.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">✉️</div>
              <div className="empty-text">لا توجد طلبات معلقة</div>
              <div className="empty-sub">ستظهر هنا طلبات المستخدمين</div>
            </div>
          ) : (
            pendingReqs.map(req => (
              <RequestCard
                key={req.id}
                req={req}
                loading={actionLoading === req.id}
                onApprove={() => handleApprove(req)}
                onReject={() => handleReject(req)}
                formatTs={formatTs}
              />
            ))
          )}
        </div>
      )}

      {/* ── Users tab ── */}
      {tab === 'users' && (
        <div style={{ padding: '12px 16px' }}>
          <button
            onClick={() => setShowAddForm(s => !s)}
            style={{
              width: '100%', padding: '12px', borderRadius: 12, marginBottom: 12,
              background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
              color: '#fff', fontSize: 14, fontWeight: 700, border: 'none',
              cursor: 'pointer', fontFamily: 'var(--font)',
            }}
          >
            {showAddForm ? '✕ إلغاء' : '+ إضافة مستخدم'}
          </button>

          {showAddForm && (
            <div style={{
              background: 'var(--card)', borderRadius: 14, padding: 16,
              border: '1px solid var(--border)', marginBottom: 14,
            }}>
              <div className="form-group">
                <label className="form-label">الاسم الكامل</label>
                <input className="form-input"
                  value={addForm.name}
                  onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="محمد الأحمد..."
                />
              </div>
              <div className="form-group">
                <label className="form-label">البريد الإلكتروني (Google)</label>
                <input className="form-input" type="email" dir="ltr"
                  value={addForm.email}
                  onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="user@gmail.com"
                />
              </div>
              <div className="form-group">
                <label className="form-label">الصلاحية</label>
                <select className="form-input"
                  value={addForm.role}
                  onChange={e => setAddForm(f => ({ ...f, role: e.target.value }))}>
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <button className="submit-btn" onClick={handleAddUser} disabled={addingUser}>
                {addingUser ? 'جارٍ الإضافة...' : 'إضافة المستخدم'}
              </button>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8, textAlign: 'center' }}>
                يجب على المستخدم تسجيل الدخول بنفس الإيميل ليتمكن من الوصول
              </div>
            </div>
          )}

          {loadingUsers ? (
            <div style={{ textAlign: 'center', padding: 32 }}>
              <span className="spinner" style={{ width: 24, height: 24 }} />
            </div>
          ) : users.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">👥</div>
              <div className="empty-text">لا يوجد مستخدمون</div>
            </div>
          ) : (
            users.map(u => (
              <div key={u.uid} style={{
                background: 'var(--card)', borderRadius: 14, padding: '14px 16px',
                border: '1px solid var(--border)', marginBottom: 10,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{u.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2, direction: 'ltr', textAlign: 'right' }}>{u.email}</div>
                  </div>
                  {deleteConfirm?.uid === u.uid ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => handleDeleteUser(u.uid, u.name)}
                        style={{
                          background: '#ef4444', color: '#fff',
                          border: 'none', borderRadius: 8,
                          padding: '4px 10px', fontSize: 12, fontFamily: 'var(--font)', cursor: 'pointer',
                        }}
                      >تأكيد</button>
                      <button
                        onClick={() => setDeleteConfirm(null)}
                        style={{
                          background: 'var(--bg3)', color: 'var(--text2)',
                          border: '1px solid var(--border)', borderRadius: 8,
                          padding: '4px 10px', fontSize: 12, fontFamily: 'var(--font)', cursor: 'pointer',
                        }}
                      >إلغاء</button>
                    </div>
                  ) : (
                  <button
                    onClick={() => handleDeleteUser(u.uid, u.name)}
                    disabled={actionLoading === u.uid}
                    style={{
                      background: 'rgba(239,68,68,0.12)', color: '#ef4444',
                      border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8,
                      padding: '4px 10px', fontSize: 12, fontFamily: 'var(--font)', cursor: 'pointer',
                    }}
                  >🗑</button>
                  )}
                </div>
                <div style={{ marginTop: 10 }}>
                  <div className="seg-control">
                    {ROLES.map(r => (
                      <button
                        key={r.value}
                        className={`seg-btn${u.role === r.value ? ' active' : ''}`}
                        onClick={() => handleRoleChange(u.uid, r.value)}
                        disabled={actionLoading === u.uid}
                        style={u.role === r.value ? { background: r.color + '25', color: r.color, borderColor: r.color + '50' } : {}}
                      >{r.label}</button>
                    ))}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── History tab ── */}
      {tab === 'history' && (
        <div style={{ padding: '12px 16px' }}>
          {historyReqs.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📜</div>
              <div className="empty-text">لا يوجد سجل</div>
            </div>
          ) : (
            historyReqs.map(req => (
              <div key={req.id} style={{
                background: 'var(--card)', borderRadius: 12, padding: '12px 14px',
                border: `1px solid ${req.status === 'approved' ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.2)'}`,
                marginBottom: 8,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                      {REQUEST_TYPE_LABEL[req.type] || req.type}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                      {req.requestedByName} • {formatTs(req.createdAt)}
                    </div>
                    {req.payload?.note && (
                      <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>
                        ملاحظة: {req.payload.note}
                      </div>
                    )}
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 8,
                    background: req.status === 'approved' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.12)',
                    color: req.status === 'approved' ? '#10b981' : '#ef4444',
                  }}>
                    {req.status === 'approved' ? 'مقبول' : 'مرفوض'}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </PullToRefresh>
  )
}

function RequestCard({ req, loading, onApprove, onReject, formatTs }) {
  const payload = req.payload || {}

  function renderPayloadDetails() {
    if (req.type === 'add') {
      return (
        <div>
          <span>عنوان: <b>{payload.title}</b></span>
          {payload.subTaskTitles && payload.subTaskTitles.length > 0 && (
            <div style={{ marginTop: 6, padding: '6px 10px', background: 'rgba(99,102,241,0.08)', borderRadius: 8, borderRight: '3px solid #6366f1' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#6366f1', marginBottom: 4 }}>📋 مهام فرعية ({payload.subTaskTitles.length})</div>
              {payload.subTaskTitles.map((st, i) => (
                <div key={i} style={{ fontSize: 11, color: 'var(--text2)', paddingRight: 8, marginBottom: 2 }}>• {st}</div>
              ))}
            </div>
          )}
        </div>
      )
    }
    if (req.type === 'edit_title') return <span>من: <b>{payload.originalTitle}</b> → إلى: <b>{payload.title}</b></span>
    if (req.type === 'edit_date')  return <span>من: <b>{payload.originalDate || '—'}</b> → إلى: <b>{payload.dueDate}</b></span>
    if (req.type === 'close')      return <span>إغلاق: <b>{payload.taskTitle}</b></span>
    return null
  }

  return (
    <div style={{
      background: 'var(--card)', borderRadius: 14, padding: '14px 16px',
      border: '1px solid rgba(245,158,11,0.25)', marginBottom: 12,
      boxShadow: '0 2px 12px rgba(245,158,11,0.08)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
          {REQUEST_TYPE_LABEL[req.type] || req.type}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text3)' }}>{formatTs(req.createdAt)}</div>
      </div>

      <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 4 }}>
        👤 {req.requestedByName}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: payload.note ? 8 : 12 }}>
        {renderPayloadDetails()}
      </div>
      {payload.note && (
        <div style={{
          fontSize: 12, color: 'var(--text2)', padding: '8px 10px',
          background: 'var(--bg3)', borderRadius: 8, marginBottom: 12,
        }}>
          💬 {payload.note}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={onApprove}
          disabled={loading}
          style={{
            flex: 1, padding: '10px', borderRadius: 10,
            background: loading ? 'var(--bg3)' : 'rgba(16,185,129,0.15)',
            color: '#10b981', fontSize: 13, fontWeight: 700,
            cursor: loading ? 'default' : 'pointer', fontFamily: 'var(--font)',
            border: '1px solid rgba(16,185,129,0.3)',
          }}
        >
          {loading ? '...' : '✅ قبول وتطبيق'}
        </button>
        <button
          onClick={onReject}
          disabled={loading}
          style={{
            flex: 1, padding: '10px', borderRadius: 10,
            background: loading ? 'var(--bg3)' : 'rgba(239,68,68,0.1)',
            color: '#ef4444', fontSize: 13, fontWeight: 700,
            cursor: loading ? 'default' : 'pointer', fontFamily: 'var(--font)',
            border: '1px solid rgba(239,68,68,0.25)',
          }}
        >
          {loading ? '...' : '🚫 رفض'}
        </button>
      </div>
    </div>
  )
}
