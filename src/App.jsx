import { useState, useEffect, useCallback, useMemo } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import LoginPage from './pages/LoginPage'
import TasksPage from './pages/TasksPage'
import MyDashboard from './pages/MyDashboard'
import NotesPage from './pages/NotesPage'
import UploadPage from './pages/UploadPage'
import ContactsPage from './pages/ContactsPage'
import ReportsPage from './pages/ReportsPage'
import BusinessReportsPage from './pages/BusinessReportsPage'
import AdminPanel from './pages/AdminPanel'
import Toast from './components/Toast'
import { HARDCODED_API_KEY } from './config'
import { loadData, saveData } from './utils/storage'
import {
  subscribeToTasks, importTasksFromArray, isTasksEmpty,
  subscribeToPendingRequests,
  subscribeToMyUpdateRequests, respondToUpdateRequest,
  requestTaskUpdate,
} from './utils/db'

function AppShell() {
  const { firebaseUser, userProfile, logout, isAdmin, isUser, loading } = useAuth()
  const [page, setPage]   = useState('dashboard')
  const [tasks, setTasks] = useState([])
  const [apiKey, setApiKey] = useState('')
  const [toast, setToast] = useState(null)
  const [pendingCount, setPendingCount] = useState(0)
  const [updateRequests, setUpdateRequests] = useState([])
  const [respondingTo, setRespondingTo] = useState(null)
  const [respondText, setRespondText] = useState('')
  const [respondLoading, setRespondLoading] = useState(false)
  const [migrationDone, setMigrationDone] = useState(false)
  
  // 🔴 1. حالة التعهد الأمني
  const [pledgeAccepted, setPledgeAccepted] = useState(true)

  /* ── API key ── */
  useEffect(() => {
    const storedKey = loadData('mytasks_apikey') || ''
    setApiKey(HARDCODED_API_KEY || storedKey)
  }, [])

  // 🔴 2. التحقق من موافقة المستخدم الحالي على التعهد
  useEffect(() => {
    if (userProfile && userProfile.name) {
      const isAccepted = loadData(`pledge_accepted_${userProfile.name}`)
      setPledgeAccepted(!!isAccepted)
    }
  }, [userProfile])

  /* ── Subscribe to Firestore tasks after login ── */
  useEffect(() => {
    if (!userProfile) return
    const unsub = subscribeToTasks(setTasks)
    return unsub
  }, [userProfile])

  /* ── Auto-migrate localStorage tasks on first run (admin only) ── */
  useEffect(() => {
    if (!isAdmin || migrationDone) return
    async function migrate() {
      try {
        const empty = await isTasksEmpty()
        if (empty) {
          const local = loadData('mytasks_tasks') || []
          if (local.length > 0) {
            await importTasksFromArray(local)
            showToast(`✓ تم استيراد ${local.length} مهمة من الجهاز`)
          }
        }
        setMigrationDone(true)
      } catch (e) {
        console.error('Migration error:', e)
        setMigrationDone(true)
      }
    }
    migrate()
  }, [isAdmin, migrationDone])

  /* ── Subscribe to pending requests (admin) ── */
  useEffect(() => {
    if (!isAdmin) return
    const unsub = subscribeToPendingRequests(reqs => {
      setPendingCount(reqs.filter(r => r.status === 'pending').length)
    })
    return unsub
  }, [isAdmin])

  /* ── Subscribe to task update requests (for current user) ── */
  useEffect(() => {
    if (!userProfile) return
    const unsub = subscribeToMyUpdateRequests(updates => {
      setUpdateRequests(updates)
    })
    return unsub
  }, [userProfile])

  const persistApiKey = useCallback((key) => {
    setApiKey(key)
    saveData('mytasks_apikey', key)
  }, [])

  const showToast = useCallback((msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2800)
  }, [])

  // 🔴 3. دالة الموافقة على التعهد وحفظه في الجهاز
  const handleAcceptPledge = () => {
    saveData(`pledge_accepted_${userProfile.name}`, true)
    setPledgeAccepted(true)
  }

  const contacts = deriveContacts(tasks)

  // Notifications: overdue tasks for THIS user only + pending requests
  const overdueTasks = useMemo(() => {
    const today = new Date(); today.setHours(0,0,0,0)
    return tasks.filter(t => {
      if (t.done || !t.dueDate) return false
      const d = new Date(t.dueDate); d.setHours(0,0,0,0)
      if (d >= today) return false
      // المدير يشوف كل المتأخرات، الموظف يشوف مهامه فقط
      if (isAdmin) return true
      return (t.person || '').trim() === (userProfile?.name || '').trim()
    })
  }, [tasks, isAdmin, userProfile])
  const [showNotifications, setShowNotifications] = useState(false)
  const myPendingUpdates = useMemo(() => {
    if (!userProfile?.name) return []
    return updateRequests.filter(u =>
      u.status === 'pending' && u.requestedFromName === userProfile.name
    )
  }, [updateRequests, userProfile])
  const respondedUpdates = useMemo(() => {
    if (!isAdmin) return []
    return updateRequests.filter(u => u.status === 'responded')
  }, [updateRequests, isAdmin])
  const notifCount = overdueTasks.length + pendingCount + myPendingUpdates.length + respondedUpdates.length

  /* ── Loading splash ── */
  if (loading) {
    return (
      <div style={{
        height: '100%', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 16,
        background: 'var(--bg)',
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: 20,
          background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 32,
        }}>✓</div>
        <span className="spinner" style={{ width: 28, height: 28 }} />
      </div>
    )
  }

  /* ── Login gate ── */
  if (!firebaseUser || !userProfile) {
    return <LoginPage />
  }

  // 🔴 4. شاشة التعهد الأمني الإلزامية (تظهر قبل الدخول للتطبيق)  // 🔴 4. شاشة التعهد الأمني الإلزامية (النسخة الرسمية التوجيهية المعتمدة)
  if (!pledgeAccepted) {
    return (
      <div style={{
        height: '100%', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: 24,
        background: 'var(--bg)', textAlign: 'center'
      }}>
        <div style={{
          background: 'var(--card)', padding: '32px 24px', borderRadius: 16,
          border: '1px solid var(--border)', maxWidth: 380, width: '100%',
          boxShadow: '0 8px 30px rgba(0,0,0,0.12)'
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ color: 'var(--text)', marginBottom: 16, fontSize: 18, fontWeight: 700 }}>
            تنبيه أمني
          </h2>
          <p style={{ color: 'var(--text2)', fontSize: 14, lineHeight: 1.8, marginBottom: 28, fontWeight: 500 }}>
            تحذير: هذا النظام مخصص لإدارة المهام الإدارية. تجنب إدخال أي بيانات طبية حساسة أو معلومات او بيانات سرية وكذلك بيانات مستفيدين او موظفين التزاماً بسياسات الخصوصية.
          </p>
          <button
            onClick={handleAcceptPledge}
            style={{
              background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
              color: '#fff', border: 'none', borderRadius: 10,
              padding: '12px 24px', fontSize: 15, fontWeight: 700,
              width: '100%', cursor: 'pointer', marginBottom: 12
            }}
          >
            أوافق وأتعهد
          </button>
          <button
            onClick={logout}
            style={{
              background: 'transparent', color: 'var(--text3)',
              border: 'none', borderRadius: 10,
              padding: '10px 24px', fontSize: 14, fontWeight: 600,
              width: '100%', cursor: 'pointer'
            }}
          >
            تراجع وتسجيل الخروج
          </button>
        </div>
      </div>
    )
  }


  // رفع الملفات محصور على: علي، منار، وليد فقط
  const UPLOAD_ALLOWED = ['م. علي الزهراني', 'د. منار سمان', 'د. وليد الحسن']
  const canUpload = userProfile && UPLOAD_ALLOWED.includes(userProfile.name)

  /* ── Build nav ── */
  const NAV = [
    { id: 'dashboard', label: 'لوحتي', icon: '🏠' },
    { id: 'tasks',   label: 'المهام',  icon: '✓'  },
    { id: 'bizreports', label: 'التقارير', icon: '📋' },
    ...(isAdmin ? [{ id: 'reports', label: 'إحصائيات', icon: '📊' }] : []),
    { id: 'contacts',label: 'جهات',   icon: '👥' },
    ...(canUpload ? [{ id: 'upload',  label: 'رفع ملف', icon: '📎' }] : []),
    ...(isAdmin ? [{ id: 'admin', label: 'إدارة', icon: '⚙️', badge: pendingCount }] : []),
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {toast && <Toast msg={toast} />}

      {/* User bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 16px 6px',
        paddingTop: `max(8px, env(safe-area-inset-top, 8px))`,
        background: 'var(--bg2)', borderBottom: '1px solid var(--border)',
        fontSize: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {userProfile.photoURL && (
            <img src={userProfile.photoURL} alt=""
              style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover' }} />
          )}
          <div>
            <span style={{ color: 'var(--text)', fontWeight: 600 }}>{userProfile.name}</span>
            <span style={{
              marginRight: 6, fontSize: 10, padding: '2px 7px', borderRadius: 8,
              background: ROLE_BG[userProfile.role] || 'var(--bg3)',
              color: ROLE_COLOR[userProfile.role] || 'var(--text2)',
              fontWeight: 700,
            }}>{ROLE_LABEL[userProfile.role]}</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* 🔔 Notification bell */}
          <button onClick={() => setShowNotifications(s => !s)} style={{
            background: 'var(--bg3)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '4px 8px', position: 'relative',
            color: 'var(--text2)', fontSize: 16, cursor: 'pointer',
          }}>
            🔔
            {notifCount > 0 && (
              <span style={{
                position: 'absolute', top: -4, right: -4,
                background: '#ef4444', color: '#fff',
                borderRadius: '50%', width: 16, height: 16,
                fontSize: 9, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{notifCount > 9 ? '9+' : notifCount}</span>
            )}
          </button>
          <button onClick={logout} style={{
            background: 'var(--bg3)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '4px 10px',
            color: 'var(--text2)', fontSize: 11, fontWeight: 600,
          }}>خروج</button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {page === 'dashboard' && (
          <MyDashboard
            tasks={tasks}
            showToast={showToast}
            onNavigate={setPage}
            updateRequests={updateRequests}
            pendingRequests={requests.filter(r => r.status === 'pending')}
          />
        )}
        {page === 'tasks' && (
          <TasksPage
            tasks={tasks}
            apiKey={apiKey}
            setApiKey={persistApiKey}
            showToast={showToast}
            userProfile={userProfile}
            onNavigate={setPage}
            onRequestUpdate={isAdmin ? async (task) => {
              try {
                await requestTaskUpdate({
                  taskId: task.id,
                  taskTitle: task.title,
                  requestedFrom: '',
                  requestedFromName: task.person || '',
                  requestedBy: userProfile.uid,
                  requestedByName: userProfile.name,
                  message: 'يرجى تقديم تحديث عن حالة هذه المهمة',
                })
                showToast(`📩 تم إرسال طلب تحديث إلى ${task.person}`)
              } catch (e) {
                showToast('❌ خطأ في إرسال الطلب')
              }
            } : null}
          />
        )}
        {page === 'notes' && (
          <NotesPage
            tasks={tasks}
            apiKey={apiKey}
            setApiKey={persistApiKey}
            showToast={showToast}
          />
        )}
        {/* حماية: رفع الملفات محصور على علي ومنار ووليد فقط */}
        {page === 'upload' && canUpload && (
          <UploadPage
            tasks={tasks}
            apiKey={apiKey}
            setApiKey={persistApiKey}
            showToast={showToast}
          />
        )}
        {page === 'contacts' && (
          <ContactsPage contacts={contacts} tasks={tasks} showToast={showToast} />
        )}
        {page === 'bizreports' && (
          <BusinessReportsPage
            tasks={tasks}
            showToast={showToast}
          />
        )}
        {page === 'reports' && (
          <ReportsPage tasks={tasks} showToast={showToast} apiKey={apiKey} userProfile={userProfile} />
        )}
        {page === 'admin' && isAdmin && (
          <AdminPanel showToast={showToast} />
        )}
      </div>

      <div className="nav-spacer" />
      <nav className="bottom-nav">
        {NAV.map(n => (
          <button
            key={n.id}
            className={`nav-item${page === n.id ? ' active' : ''}`}
            onClick={() => setPage(n.id)}
            style={{ position: 'relative' }}
          >
            <span style={{ fontSize: 20 }}>{n.icon}</span>
            <span>{n.label}</span>
            {n.badge > 0 && (
              <span style={{
                position: 'absolute', top: 4, right: 4,
                background: '#ef4444', color: '#fff',
                borderRadius: '50%', width: 16, height: 16,
                fontSize: 10, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{n.badge}</span>
            )}
          </button>
        ))}
      </nav>

      {/* Notifications Panel */}
      {showNotifications && (
        <>
          <div onClick={() => setShowNotifications(false)} style={{ position: 'fixed', inset: 0, zIndex: 998 }} />
          <div style={{
            position: 'fixed', top: 50, left: 16, right: 16, zIndex: 999,
            background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 16, padding: 16, maxHeight: '60vh', overflowY: 'auto',
            boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
          }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              🔔 التنبيهات
              {notifCount > 0 && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>{notifCount}</span>}
            </div>

            {overdueTasks.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--orange)', marginBottom: 6 }}>⚠️ مهام متأخرة ({overdueTasks.length})</div>
                {overdueTasks.slice(0, 5).map(t => (
                  <div key={t.id} style={{
                    padding: '8px 10px', borderRadius: 10, marginBottom: 4,
                    background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)',
                    fontSize: 12, color: 'var(--text)',
                  }}>
                    <div style={{ fontWeight: 600 }}>{t.title}</div>
                    <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
                      📅 {t.dueDate} {t.person ? `• 👤 ${t.person}` : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {isAdmin && pendingCount > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--blue)', marginBottom: 6 }}>📨 طلبات معلقة ({pendingCount})</div>
                <button onClick={() => { setPage('admin'); setShowNotifications(false) }} style={{
                  padding: '8px 14px', borderRadius: 10, width: '100%',
                  background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)',
                  color: 'var(--blue)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  عرض الطلبات في لوحة الإدارة →
                </button>
              </div>
            )}

            {/* طلبات التحديث الموجهة للموظف */}
            {myPendingUpdates.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#8b5cf6', marginBottom: 6 }}>📩 طلبات تحديث ({myPendingUpdates.length})</div>
                {myPendingUpdates.map(u => (
                  <div key={u.id} style={{
                    padding: '10px 12px', borderRadius: 10, marginBottom: 4,
                    background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)',
                    fontSize: 12, color: 'var(--text)',
                  }}>
                    <div style={{ fontWeight: 600, marginBottom: 3 }}>{u.taskTitle}</div>
                    <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 6 }}>
                      💬 {u.message}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 6 }}>
                      من: {u.requestedByName}
                    </div>
                    <button onClick={() => { setRespondingTo(u); setRespondText(''); setShowNotifications(false) }} style={{
                      padding: '6px 14px', borderRadius: 8, width: '100%',
                      background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.25)',
                      color: '#8b5cf6', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                    }}>
                      ✏️ رد بالتحديث
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* ردود التحديث الجديدة للمدير */}
            {isAdmin && respondedUpdates.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#10b981', marginBottom: 6 }}>✅ ردود تحديث جديدة ({respondedUpdates.length})</div>
                {respondedUpdates.slice(0, 5).map(u => (
                  <div key={u.id} style={{
                    padding: '10px 12px', borderRadius: 10, marginBottom: 4,
                    background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.15)',
                    fontSize: 12, color: 'var(--text)',
                  }}>
                    <div style={{ fontWeight: 600, marginBottom: 3 }}>{u.taskTitle}</div>
                    <div style={{ fontSize: 11, color: 'var(--text2)' }}>👤 {u.requestedFromName}</div>
                    <div style={{
                      fontSize: 12, color: 'var(--text)', marginTop: 6, padding: '8px 10px',
                      background: 'rgba(16,185,129,0.06)', borderRadius: 8,
                      borderRight: '3px solid #10b981', lineHeight: 1.6,
                    }}>
                      {u.response}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {notifCount === 0 && (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--text3)', fontSize: 13 }}>
                ✨ لا توجد تنبيهات
              </div>
            )}
          </div>
        </>
      )}
      {/* Respond to update request modal */}
      {respondingTo && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
          <div style={{ background: 'var(--card)', padding: 20, borderRadius: 14, width: '90%', maxWidth: 360 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 6, textAlign: 'center' }}>
              📩 طلب تحديث
            </div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 4, textAlign: 'center' }}>
              {respondingTo.taskTitle}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12, textAlign: 'center' }}>
              من: {respondingTo.requestedByName} — "{respondingTo.message}"
            </div>
            <textarea
              value={respondText}
              onChange={e => setRespondText(e.target.value)}
              placeholder="اكتب تحديث حالة المهمة..."
              style={{
                width: '100%', minHeight: 100, padding: 12, borderRadius: 10,
                border: '1px solid var(--border)', background: 'var(--bg)',
                color: 'var(--text)', fontSize: 14, lineHeight: 1.7,
                fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box',
              }}
              dir="rtl"
              autoFocus
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button
                onClick={async () => {
                  if (!respondText.trim()) return
                  setRespondLoading(true)
                  try {
                    await respondToUpdateRequest(respondingTo.id, respondText.trim())
                    showToast('✅ تم إرسال التحديث')
                  } catch (e) {
                    showToast('❌ خطأ في إرسال التحديث')
                  }
                  setRespondLoading(false)
                  setRespondingTo(null)
                }}
                disabled={respondLoading || !respondText.trim()}
                style={{
                  flex: 1, padding: '10px', borderRadius: 8,
                  background: respondLoading || !respondText.trim() ? 'var(--bg3)' : '#8b5cf6',
                  color: respondLoading || !respondText.trim() ? 'var(--text3)' : '#fff',
                  border: 'none', fontSize: 14, fontWeight: 700,
                  cursor: respondLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                }}
              >
                {respondLoading ? 'جاري الإرسال...' : '📩 إرسال'}
              </button>
              <button onClick={() => setRespondingTo(null)} style={{
                flex: 1, padding: '10px', background: 'var(--bg3)',
                color: 'var(--text)', border: 'none', borderRadius: 8,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Role display helpers ───────────────────────────────── */
const ROLE_LABEL = { admin: 'مدير', superuser: 'مشرف', user: 'موظف' }
const ROLE_BG    = { admin: 'rgba(139,92,246,0.15)', superuser: 'rgba(59,130,246,0.15)', user: 'rgba(16,185,129,0.12)' }
const ROLE_COLOR = { admin: '#a78bfa', superuser: '#60a5fa', user: '#34d399' }

function deriveContacts(tasks) {
  const map = {}
  tasks.forEach(t => {
    if (t.person && t.person.trim()) {
      const name = t.person.trim()
      if (!map[name]) map[name] = { name, tasks: [] }
      map[name].tasks.push(t)
    }
  })
  return Object.values(map)
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}
