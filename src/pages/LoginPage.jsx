import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { getFirestore, doc, setDoc, serverTimestamp, collection, getDocs } from 'firebase/firestore'

// قائمة أسماء وأدوار فريق الأداء والتحليلات P&A
// إدارة: علي + فيصل | منسق: حمادي + محمد | عضو: البقية
const INITIAL_TEAM_MAP = [
  { name: 'م. علي الزهراني', role: 'admin' },
  { name: 'أ. فيصل الرحيمي', role: 'admin' },
  { name: 'م. حمادي الشعائره', role: 'superuser' },
  { name: 'أ. محمد القحطاني', role: 'superuser' },
  { name: 'أ. صفا الشهري', role: 'user' },
  { name: 'أ. صالحة المالكي', role: 'user' },
  { name: 'أ. نورة التركي', role: 'user' },
  { name: 'أ. رهف جباري', role: 'user' },
  { name: 'أ. تركي السلمان', role: 'user' },
  { name: 'أ. ريما الفهيد', role: 'user' },
]

export default function LoginPage() {
  const { 
    loginWithGoogle, loginWithEmail, authError, setAuthError, 
    firebaseUser, userProfile, logout 
  } = useAuth()
  
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showEmail, setShowEmail] = useState(false)
  const [availableNames, setAvailableNames] = useState([])
  const [selectedName, setSelectedName] = useState('')

  useEffect(() => {
    if (firebaseUser && !userProfile) {
      const fetchAvailable = async () => {
        try {
          const db = getFirestore()
          const querySnapshot = await getDocs(collection(db, 'users'))
          const takenNames = querySnapshot.docs.map(doc => doc.data().name)
          
          const ADMIN_EMAILS = ['alalz22019@gmail.com']
          let available
          if (ADMIN_EMAILS.includes(firebaseUser.email)) {
            // Admin can pick any name
            available = INITIAL_TEAM_MAP
          } else {
            const takenNames = querySnapshot.docs.map(doc => doc.data().name)
            available = INITIAL_TEAM_MAP.filter(item => !takenNames.includes(item.name))
          }
          setAvailableNames(available)
        } catch (error) {
          console.error("Error fetching users:", error)
        }
      }
      fetchAvailable()
    }
  }, [firebaseUser, userProfile])

  async function handleEmailLogin(e) {
    e.preventDefault()
    if (!email.trim() || !password) return
    setLoading(true)
    await loginWithEmail(email.trim(), password)
    setLoading(false)
  }

  async function handleClaimProfile(e) {
    e.preventDefault()
    if (!selectedName) return
    setLoading(true)
    
    try {
      const db = getFirestore()
      const selectedInfo = INITIAL_TEAM_MAP.find(item => item.name === selectedName)

      const profileData = {
        name: selectedInfo.name,
        role: selectedInfo.role,
        email: firebaseUser.email || '',
        uid: firebaseUser.uid,
        createdAt: serverTimestamp(),
        photoURL: firebaseUser.photoURL || ''
      }

      await setDoc(doc(db, 'users', firebaseUser.uid), profileData)
      
      // 🔴 الحل هنا: إجبار التطبيق على التحديث بعد الحفظ ليدخلك مباشرة
      window.location.reload()
      
    } catch (error) {
      setAuthError('عذراً، تعذر ربط الحساب. تأكد من اتصالك أو صلاحيات قاعدة البيانات.')
      setLoading(false)
    }
  }

  if (firebaseUser && !userProfile) {
    return (
      <div style={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--bg)' }}>
        <div style={{ width: '100%', maxWidth: 360, background: 'var(--card)', borderRadius: 20, padding: 28, textAlign: 'center', border: '1px solid var(--border)', boxShadow: '0 4px 24px rgba(0,0,0,0.4)' }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>مرحباً بك في My Day</div>
          <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 20 }}>الرجاء اختيار اسمك من القائمة لمرة واحدة فقط لربط حسابك:</div>
          
          {authError && (
            <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '12px 16px', marginBottom: 18, fontSize: 13, color: '#ef4444', lineHeight: 1.6 }}>
              🚫 {authError}
            </div>
          )}

          <form onSubmit={handleClaimProfile}>
            <select 
              value={selectedName} 
              onChange={e => setSelectedName(e.target.value)}
              style={{ width: '100%', padding: '12px 14px', borderRadius: 12, background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border)', marginBottom: 20, fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}
            >
              <option value="" disabled>-- اختر اسمك من هنا --</option>
              {availableNames.map(item => (
                <option key={item.name} value={item.name}>{item.name} ({item.role === 'admin' ? 'مدير' : item.role === 'superuser' ? 'مشرف' : 'موظف'})</option>
              ))}
            </select>

            <button 
              type="submit" 
              disabled={!selectedName || loading}
              style={{ width: '100%', padding: 14, borderRadius: 12, background: (!selectedName || loading) ? 'var(--bg3)' : 'linear-gradient(135deg,#3b82f6,#8b5cf6)', color: (!selectedName || loading) ? 'var(--text3)' : '#fff', fontWeight: 700, border: 'none', cursor: (!selectedName || loading) ? 'default' : 'pointer', fontFamily: 'inherit' }}
            >
              {loading ? 'جاري الربط...' : 'تأكيد الهوية والدخول'}
            </button>
          </form>
          
          <button onClick={() => { setAuthError(''); logout(); }} style={{ marginTop: 20, background: 'none', border: 'none', color: 'var(--text3)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit' }}>
            تسجيل الخروج
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px', background: 'var(--bg)' }}>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{ width: 80, height: 80, borderRadius: 24, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, margin: '0 auto 20px', boxShadow: '0 8px 32px rgba(59,130,246,0.35)' }}>✓</div>
        <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--text)', marginBottom: 6 }}>My Day</div>
        <div style={{ fontSize: 14, color: 'var(--text2)' }}>نظام إدارة المهام — PMO وزارة الصحة</div>
      </div>

      <div style={{ width: '100%', maxWidth: 360, background: 'var(--card)', borderRadius: 20, border: '1px solid var(--border)', padding: '28px 24px', boxShadow: '0 4px 24px rgba(0,0,0,0.4)' }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 6, textAlign: 'center' }}>تسجيل الدخول</div>
        <div style={{ fontSize: 13, color: 'var(--text2)', textAlign: 'center', marginBottom: 24 }}>استخدم حسابك المعتمد للدخول إلى النظام</div>

        {authError && (
          <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '12px 16px', marginBottom: 18, fontSize: 13, color: '#ef4444', textAlign: 'center', lineHeight: 1.6 }}>
            🚫 {authError}
          </div>
        )}

        {/* Google Sign-In */}
        <button
          onClick={async () => { setLoading(true); await loginWithGoogle(); setLoading(false); }}
          disabled={loading}
          style={{
            width: '100%', padding: '13px', borderRadius: 12,
            border: '1px solid var(--border)', background: 'var(--bg3)',
            color: 'var(--text)', fontSize: 14, fontWeight: 600,
            cursor: loading ? 'default' : 'pointer', fontFamily: 'var(--font)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            marginBottom: 16,
          }}
        >
          <GoogleIcon /> الدخول بحساب Google
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>أو</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>

        <form onSubmit={handleEmailLogin} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input type="email" placeholder="البريد الإلكتروني" value={email} onChange={e => setEmail(e.target.value)} dir="ltr" autoComplete="email" style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 14, fontFamily: 'var(--font)', outline: 'none', width: '100%', boxSizing: 'border-box', textAlign: 'left' }} />
          <input type="password" placeholder="كلمة المرور" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 14, fontFamily: 'var(--font)', outline: 'none', width: '100%', boxSizing: 'border-box' }} />
          <button type="submit" disabled={loading || !email.trim() || !password} style={{ padding: '13px', borderRadius: 12, border: 'none', background: loading ? 'var(--bg3)' : 'linear-gradient(135deg,#3b82f6,#8b5cf6)', color: loading ? 'var(--text3)' : '#fff', fontSize: 15, fontWeight: 700, cursor: loading ? 'default' : 'pointer', fontFamily: 'var(--font)' }}>
            {loading ? 'جارٍ الدخول...' : 'دخول'}
          </button>
        </form>

        <div style={{ marginTop: 20, padding: '10px 14px', background: 'var(--bg3)', borderRadius: 10, fontSize: 12, color: 'var(--text3)', textAlign: 'center', lineHeight: 1.7 }}>
          الدخول متاح للمستخدمين المعتمدين فقط<br />تواصل مع مسؤول النظام لإضافة حسابك
        </div>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}
