import { useState, useEffect, useMemo } from 'react'
import { analyzeTaskWithAI } from '../utils/claude'
import { useAuth } from '../contexts/AuthContext'

const PRIORITIES = [
  { value: 'urgent', label: 'عاجل' },
  { value: 'medium', label: 'متوسطة' },
  { value: 'low', label: 'منخفضة' },
]

const RECURRENCES = [
  { value: '', label: 'لا تكرار' },
  { value: 'daily', label: 'يومي' },
  { value: 'weekly', label: 'أسبوعي' },
  { value: 'biweekly', label: 'كل أسبوعين' },
  { value: 'monthly', label: 'شهري' },
  { value: 'quarterly', label: 'ربع سنوي' },
]

const TASK_TYPES = [
  { value: 'task', label: 'مهمة' },
  { value: 'meeting', label: 'اجتماع' },
]

const SOURCE_TYPES = [
  { value: '', label: '— اختياري —' },
  { value: 'minutes', label: 'محضر' },
  { value: 'directive', label: 'توجيه مباشر' },
  { value: 'email', label: 'إيميل' },
  { value: 'routine', label: 'مهمة روتينية' },
]

export const STATUS_OPTIONS = [
  { value: 'new',         label: 'جديدة',              color: '#6b7280' },
  { value: 'studying',    label: 'قيد الدراسة',        color: '#8b5cf6' },
  { value: 'in_progress', label: 'قيد التنفيذ',        color: '#3b82f6' },
  { value: 'waiting',     label: 'بانتظار جهة خارجية', color: '#f59e0b' },
  { value: 'review',      label: 'قيد المراجعة',       color: '#06b6d4' },
  { value: 'done',        label: 'مكتملة',             color: '#10b981' },
]

const TEAM_MEMBERS = [
  'م. علي الزهراني', 'د. منار سمان', 'د. وليد الحسن', 'أ. عبير الشدوخي',
  'د. حامد الزهراني', 'أ. حماد المظيبري', 'أ. محمد القرشي', 'أ. محمد الحجيلي',
  'أ. سعد القرشي', 'أ. أميرة التميمي', 'د. مرام الشهراني',
  'أ. وفاء آل إسماعيل', 'د. سمية الغريب', 'أ. مشاعل المطيري', 'أ. صفاء الشهري',
  'أ. أمجاد المطيري', 'أ. مي الأسمري', 'أ. شادي نبيل',
  'أ. راما القحطاني', 'أ. مها القحطاني', 'د. نجلاء خوجة',
  'أ. مشاعل الغزولي', 'أ. فدوى النفيسي', 'م. حمادي الشعائره',
]

export const PROJECT_FILES = [
  'إدارة المشاريع',
  'المؤشرات',
  '937 والبلاغات',
  'السموم والمضادات',
  'جاهزية المختبرات',
  'التموين والإمداد',
  'عينتي',
  'التوطين',
  'فحص الزواج',
  'السلامة الحيوية',
  'السياسات والتنظيم',
  'الاتفاقيات والفعاليات',
  'أعمال الحج',
]

const DEFAULT_TASK = {
  title: '', priority: 'medium', person: '', dueDate: '', recurrence: '',
  reminderTime: '', projectName: '', projectNames: [], sourceType: '', sourceTitle: '', done: false,
  taskType: 'task', status: 'new', closeNote: '', parentId: '',
}

export default function TaskForm({ task, onSave, onClose, apiKey, defaultTaskType, parentTask, allTasks = [] }) {
  const { isUser, userProfile } = useAuth()
  const envApiKey = import.meta.env.VITE_GEMINI_API_KEY
  const currentApiKey = apiKey || envApiKey || ''
  
  const [form, setForm] = useState(() => {
    if (task) {
      const pNames = task.projectNames || (task.projectName ? task.projectName.split(',').map(s => s.trim()).filter(Boolean) : [])
      return { ...task, projectNames: pNames, projectName: task.projectName || pNames.join(', '), status: task.status || (task.done ? 'done' : 'new') }
    }
    const base = { ...DEFAULT_TASK, person: isUser ? userProfile?.name : '', taskType: defaultTaskType || 'task' }
    if (parentTask) {
      base.parentId = parentTask.id
      base.projectName = parentTask.projectName || ''
      base.projectNames = parentTask.projectNames || (parentTask.projectName ? parentTask.projectName.split(',').map(s => s.trim()).filter(Boolean) : [])
      base.sourceType = parentTask.sourceType || ''
      base.sourceTitle = parentTask.sourceTitle || ''
      base.person = parentTask.person || base.person
    }
    return base
  })
  
  const [saving, setSaving] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [aiReason, setAiReason] = useState('')
  const [subTasks, setSubTasks] = useState([])
  const [selectedSubTasks, setSelectedSubTasks] = useState([])
  const [duplicateWarning, setDuplicateWarning] = useState(null)

  // Parent task candidates for merge/reparent
  const parentCandidates = useMemo(() => {
    return allTasks.filter(t => !t.parentId && t.id !== task?.id).slice(0, 50)
  }, [allTasks, task])

  // Check for duplicates when title changes
  useEffect(() => {
    if (!form.title.trim() || task) { setDuplicateWarning(null); return }
    const norm = form.title.trim().toLowerCase()
    const dup = allTasks.find(t => {
      const e = (t.title || '').trim().toLowerCase()
      return e === norm || (norm.length >= 10 && e.includes(norm)) || (e.length >= 10 && norm.includes(e))
    })
    setDuplicateWarning(dup || null)
  }, [form.title, allTasks, task])

  function set(field, value) {
    setForm(f => {
      const updated = { ...f, [field]: value }
      if (field === 'status') updated.done = value === 'done'
      return updated
    })
  }

  async function analyzeTask() {
    if (!form.title.trim() || !currentApiKey) return
    setAnalyzing(true); setAiReason(''); setSubTasks([]); setSelectedSubTasks([])
    try {
      const result = await analyzeTaskWithAI(currentApiKey, form.title)
      if (result) {
        setForm(f => ({
          ...f, priority: result.priority || f.priority,
          person: isUser ? f.person : (result.person || f.person),
          projectName: result.projectName || f.projectName || '',
        }))
        if (result.reason) setAiReason(result.reason)
        if (Array.isArray(result.subTasks) && result.subTasks.length > 0) {
          setSubTasks(result.subTasks)
          setSelectedSubTasks(result.subTasks)
        }
      }
    } catch (e) { console.error('AI analyze error:', e) } 
    finally { setAnalyzing(false) }
  }

  function toggleSubTask(st) {
    setSelectedSubTasks(prev => prev.includes(st) ? prev.filter(s => s !== st) : [...prev, st])
  }

  function handleSubmit() {
    if (!form.title.trim() || saving) return
    setSaving(true)
    const finalForm = { ...form }
    if (isUser) finalForm.person = userProfile?.name || ''
    finalForm.done = finalForm.status === 'done'
    // Sync projectNames → projectName string
    finalForm.projectName = (finalForm.projectNames || []).join(', ')
    
    // اجتماع + محضر → إضافة مهمة فرعية "إرسال محضر" تلقائياً
    let finalSubTasks = [...selectedSubTasks]
    if (finalForm.taskType === 'meeting' && finalForm.meetingRole === 'minutes') {
      const minutesTitle = `إرسال محضر: ${finalForm.title}`
      if (!finalSubTasks.includes(minutesTitle)) {
        finalSubTasks.push(minutesTitle)
      }
    }
    
    onSave(finalForm, finalSubTasks)
  }

  const typeIcons = { task: '📝', meeting: '📅', report: '📊' }
  const typeLabels = { task: 'مهمة جديدة', meeting: 'اجتماع جديد', report: 'تقرير جديد' }
  const formTitle = task ? 'تعديل المهمة' : parentTask ? `🔀 فرعية لـ: ${parentTask.title.substring(0, 30)}` : `${typeIcons[form.taskType] || '📝'} ${typeLabels[form.taskType] || 'مهمة جديدة'}`

  return (
    <div 
      className="modal-overlay" 
      onClick={onClose}
      style={{ 
        alignItems: 'flex-start', 
        paddingTop: 'env(safe-area-inset-top, 60px)',
        paddingBottom: 'env(safe-area-inset-bottom, 20px)'
      }} 
    >
      <div 
        className="modal" 
        onClick={e => e.stopPropagation()}
        style={{ 
          width: '100%', maxWidth: '450px', margin: '0 auto',
          maxHeight: '85vh', overflowY: 'auto', boxSizing: 'border-box'
        }}
      >
        <div className="modal-handle" />
        <h2 className="modal-title">{formTitle}</h2>

        {/* عنوان المهمة + تحليل ذكي */}
        <div className="form-group">
          <label className="form-label">{form.taskType === 'meeting' ? 'عنوان الاجتماع *' : form.taskType === 'report' ? 'عنوان التقرير *' : 'عنوان المهمة *'}</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="form-input" style={{ flex: 1 }} value={form.title} onChange={e => set('title', e.target.value)} placeholder={form.taskType === 'meeting' ? 'اكتب عنوان الاجتماع...' : form.taskType === 'report' ? 'اكتب عنوان التقرير...' : 'اكتب المهمة...'} />
            <button className="ai-analyze-btn" onClick={analyzeTask} disabled={!form.title.trim() || analyzing || !currentApiKey} title="تحليل ذكي">
              {analyzing ? <span className="spinner" style={{ width: 14, height: 14 }} /> : '✨'}
            </button>
          </div>
        </div>

        {/* تحذير تكرار */}
        {duplicateWarning && (
          <div style={{
            margin: '0 0 12px', padding: '8px 12px', borderRadius: 10,
            background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)',
            fontSize: 12, color: 'var(--orange)', lineHeight: 1.6,
          }}>
            ⚠️ مهمة مشابهة موجودة: "{duplicateWarning.title}"
            <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
              <button onClick={() => setDuplicateWarning(null)} style={{
                padding: '3px 10px', borderRadius: 6, fontSize: 11, fontFamily: 'inherit',
                background: 'rgba(245,158,11,0.15)', border: '1px solid var(--orange)', color: 'var(--orange)', cursor: 'pointer',
              }}>إضافة كجديدة</button>
              <button onClick={onClose} style={{
                padding: '3px 10px', borderRadius: 6, fontSize: 11, fontFamily: 'inherit',
                background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text2)', cursor: 'pointer',
              }}>تجاهل</button>
            </div>
          </div>
        )}

        {aiReason && (
          <div className="ai-reason-box"><span style={{ fontSize: 13 }}>🤖</span><span>{aiReason}</span></div>
        )}

        {/* الأولوية */}
        <div className="form-group">
          <label className="form-label">الأولوية</label>
          <div className="seg-control">
            {PRIORITIES.map(p => (
              <button key={p.value} className={`seg-btn${form.priority === p.value ? ' active' : ''}`} onClick={() => set('priority', p.value)}>{p.label}</button>
            ))}
          </div>
        </div>

        {/* نوع المهمة */}
        <div className="form-group">
          <label className="form-label">نوع المهمة</label>
          <div className="seg-control">
            {TASK_TYPES.map(t => (
              <button key={t.value} className={`seg-btn${form.taskType === t.value ? ' active' : ''}`} onClick={() => set('taskType', t.value)}>{t.label}</button>
            ))}
          </div>
        </div>

        {/* حالة المهمة */}
        <div className="form-group">
          <label className="form-label">حالة المهمة</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {STATUS_OPTIONS.map(s => (
              <button key={s.value} onClick={() => set('status', s.value)} style={{
                padding: '5px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                fontFamily: 'inherit', cursor: 'pointer',
                border: form.status === s.value ? `2px solid ${s.color}` : '1px solid var(--border)',
                background: form.status === s.value ? `${s.color}20` : 'var(--bg)',
                color: form.status === s.value ? s.color : 'var(--text2)',
              }}>{s.label}</button>
            ))}
          </div>
        </div>

        {/* مصدر المهمة + عنوان المصدر */}
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">مصدر المهمة</label>
            <select className="form-input" value={form.sourceType} onChange={e => set('sourceType', e.target.value)}>
              {SOURCE_TYPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">عنوان المصدر</label>
            <input className="form-input" value={form.sourceTitle} onChange={e => set('sourceTitle', e.target.value)} placeholder="رقم المحضر..." />
          </div>
        </div>

        {/* المشروع / المبادرة — multi-select */}
        <div className="form-group">
          <label className="form-label">الملف / المبادرة</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {PROJECT_FILES.map(p => {
              const selected = (form.projectNames || []).includes(p)
              return (
                <button key={p} type="button" onClick={() => {
                  const cur = form.projectNames || []
                  const next = selected ? cur.filter(x => x !== p) : [...cur, p]
                  setForm(f => ({ ...f, projectNames: next, projectName: next.join(', ') }))
                }} style={{
                  padding: '5px 10px', borderRadius: 8, fontSize: 11, fontFamily: 'inherit',
                  background: selected ? 'rgba(59,130,246,0.15)' : 'var(--bg3)',
                  border: `1px solid ${selected ? 'rgba(59,130,246,0.4)' : 'var(--border)'}`,
                  color: selected ? 'var(--blue-light)' : 'var(--text2)', cursor: 'pointer',
                  fontWeight: selected ? 700 : 400,
                }}>{selected ? '✓ ' : ''}{p}</button>
              )
            })}
          </div>
        </div>

        {/* المسؤول */}
        <div className="form-group">
          <label className="form-label">{form.taskType === 'meeting' ? 'رئيس الاجتماع' : 'الشخص المسؤول'}</label>
          {isUser ? (
            <input className="form-input" value={userProfile?.name || ''} disabled style={{ background: 'var(--bg3)', opacity: 0.7, color: 'var(--text)' }} />
          ) : (
            <select className="form-input" value={form.person} onChange={e => set('person', e.target.value)}>
              <option value="">— اختر —</option>
              {TEAM_MEMBERS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          )}
        </div>

        {/* ── حقول خاصة بالاجتماع ── */}
        {form.taskType === 'meeting' && (
          <>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">📅 تاريخ الاجتماع</label>
                <input className="form-input" type="date" value={form.dueDate} onChange={e => set('dueDate', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">⏰ وقت الاجتماع</label>
                <input className="form-input" type="time" value={form.meetingTime || ''} onChange={e => set('meetingTime', e.target.value)} />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">📍 المكان / رابط الاجتماع</label>
              <input className="form-input" value={form.meetingLocation || ''} onChange={e => set('meetingLocation', e.target.value)} placeholder="قاعة الاجتماعات / رابط Teams..." />
            </div>

            <div className="form-group">
              <label className="form-label">نوع الحضور</label>
              <div className="seg-control">
                <button className={`seg-btn${(form.meetingRole || 'attend') === 'attend' ? ' active' : ''}`} onClick={() => set('meetingRole', 'attend')}>✋ حضور فقط</button>
                <button className={`seg-btn${form.meetingRole === 'minutes' ? ' active' : ''}`} onClick={() => set('meetingRole', 'minutes')}>📝 حضور + محضر</button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">👥 الحضور (اختياري)</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {TEAM_MEMBERS.filter(m => m !== form.person).map(m => {
                  const selected = (form.attendees || []).includes(m)
                  return (
                    <button key={m} onClick={() => {
                      const cur = form.attendees || []
                      set('attendees', selected ? cur.filter(a => a !== m) : [...cur, m])
                    }} style={{
                      padding: '4px 8px', borderRadius: 6, fontSize: 10, fontFamily: 'inherit',
                      background: selected ? 'rgba(59,130,246,0.15)' : 'var(--bg3)',
                      border: `1px solid ${selected ? 'rgba(59,130,246,0.4)' : 'var(--border)'}`,
                      color: selected ? 'var(--blue-light)' : 'var(--text2)', cursor: 'pointer',
                    }}>{selected ? '✓ ' : ''}{m.split(' ').pop()}</button>
                  )
                })}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">الدورية</label>
              <div className="seg-control">
                {RECURRENCES.map(r => (
                  <button key={r.value} className={`seg-btn${form.recurrence === r.value ? ' active' : ''}`} onClick={() => set('recurrence', r.value)}>{r.label}</button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── حقول المهمة/التقرير العادية ── */}
        {form.taskType !== 'meeting' && (
          <>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">تاريخ الاستحقاق</label>
                <input className="form-input" type="date" value={form.dueDate} onChange={e => set('dueDate', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">وقت التنبيه</label>
                <input className="form-input" type="time" value={form.reminderTime} onChange={e => set('reminderTime', e.target.value)} />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">التكرار</label>
              <div className="seg-control">
                {RECURRENCES.map(r => (
                  <button key={r.value} className={`seg-btn${form.recurrence === r.value ? ' active' : ''}`} onClick={() => set('recurrence', r.value)}>{r.label}</button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ربط كفرعية */}
        {!parentTask && !task?.parentId && parentCandidates.length > 0 && (
          <div className="form-group">
            <label className="form-label">ربط كفرعية لمهمة (اختياري)</label>
            <select className="form-input" value={form.parentId || ''} onChange={e => set('parentId', e.target.value)}>
              <option value="">— مهمة مستقلة —</option>
              {parentCandidates.map(t => (
                <option key={t.id} value={t.id}>{t.title.substring(0, 50)}</option>
              ))}
            </select>
          </div>
        )}

        {/* المهام الفرعية المقترحة من AI */}
        {subTasks.length > 0 && (
          <div className="subtasks-panel">
            <div className="subtasks-title">📋 المهام الفرعية المقترحة<span className="subtasks-hint">اختر ما تريد إضافته</span></div>
            {subTasks.map(st => (
              <label key={st} className="subtask-item">
                <input type="checkbox" checked={selectedSubTasks.includes(st)} onChange={() => toggleSubTask(st)} className="subtask-checkbox" />
                <span>{st}</span>
              </label>
            ))}
          </div>
        )}

        {/* ملاحظات */}
        <div className="form-group">
          <label className="form-label">{form.taskType === 'meeting' && form.meetingRole === 'minutes' ? 'المحضر / الملاحظات' : 'ملاحظات الإنجاز'}</label>
          <textarea className="form-input" value={form.closeNote || ''} onChange={e => set('closeNote', e.target.value)} 
            placeholder={form.taskType === 'meeting' ? 'محضر الاجتماع أو ملاحظات...' : 'ماذا تم إنجازه...'}
            style={{ minHeight: 60, resize: 'vertical' }} />
        </div>

        <button className="submit-btn" onClick={handleSubmit} disabled={!form.title.trim() || saving}>
          {task ? 'حفظ التغييرات' : form.taskType === 'meeting' ? '📅 حفظ الاجتماع' : form.taskType === 'report' ? '📊 حفظ التقرير' : selectedSubTasks.length > 0 ? `إضافة المهمة + ${selectedSubTasks.length} فرعية` : 'إضافة المهمة'}
        </button>
        <button className="cancel-btn" onClick={onClose} style={{ marginBottom: '10px' }}>إلغاء</button>
      </div>
    </div>
  )
}
