import { useState, useMemo } from 'react'
import * as XLSX from 'xlsx'
import TaskCard from '../components/TaskCard'
import TaskForm, { STATUS_OPTIONS } from '../components/TaskForm'
import SmartChat from '../components/SmartChat'
import MeetingMinutesParser from '../components/MeetingMinutesParser'
import QuickAddMenu from '../components/QuickAddMenu'
import { callClaude, EXTRACT_SYSTEM } from '../utils/claude'
import { useAuth } from '../contexts/AuthContext'
import {
  addTask as dbAddTask,
  updateTask as dbUpdateTask,
  deleteTask as dbDeleteTask,
  createRequest,
  addUpdateToTask,
} from '../utils/db'

// --- دوال منع التكرار ---
function normalizeAr(s) {
  return (s || '').trim().replace(/\s+/g, ' ').toLowerCase()
    .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه')
    .replace(/[\u064B-\u065F\u0670]/g, '').replace(/\u0640/g, '')
    .replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
}
function isDuplicateTask(newTitle, existingTasks) {
  const n = normalizeAr(newTitle);
  if (!n) return false;
  return existingTasks.some(t => {
    const e = normalizeAr(t.title);
    if (!e) return false;
    return e === n || (n.length >= 15 && e.includes(n)) || (e.length >= 15 && n.includes(e));
  });
}
function deduplicateTasks(newTasks, existingTasks) {
  const unique = [];
  const currentTitles = existingTasks.map(t => normalizeAr(t.title));
  newTasks.forEach(task => {
    const normTitle = normalizeAr(task.title);
    if (!currentTitles.includes(normTitle)) {
      unique.push(task);
      currentTitles.push(normTitle);
    }
  });
  return unique;
}

const FILTERS = [
  { id: 'all',      label: 'الكل' },
  { id: 'active',   label: 'نشطة' },
  { id: 'done',     label: 'مكتملة' },
  { id: 'urgent',   label: 'عاجل' },
  { id: 'mine',     label: 'مهامي' },
  { id: 'meetings', label: 'اجتماعات' },
  { id: 'reports',  label: 'تقارير' },
  { id: 'waiting',  label: 'بانتظار' },
  { id: 'review',   label: 'مراجعة' },
]

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

function calcNextDue(dateStr, recurrence) {
  const d = dateStr ? new Date(dateStr) : new Date()
  switch (recurrence) {
    case 'daily': d.setDate(d.getDate() + 1); break
    case 'weekly': d.setDate(d.getDate() + 7); break
    case 'biweekly': d.setDate(d.getDate() + 14); break
    case 'monthly': d.setMonth(d.getMonth() + 1); break
    case 'quarterly': d.setMonth(d.getMonth() + 3); break
    default: d.setDate(d.getDate() + 1)
  }
  return d.toISOString().split('T')[0]
}

const REQUEST_LABELS = {
  add:        'إضافة مهمة جديدة',
  edit_title: 'تعديل عنوان المهمة',
  edit_date:  'تعديل تاريخ الاستحقاق',
  close:      'إغلاق / إتمام المهمة',
}

export default function TasksPage({ tasks, apiKey, setApiKey, showToast, userProfile, onRequestUpdate, onNavigate }) {
  const envApiKey = import.meta.env.VITE_GEMINI_API_KEY;
  const currentApiKey = apiKey || envApiKey || '';

  const { isAdmin, isSuperUser, isUser } = useAuth()
  const canWrite = isAdmin || isSuperUser   
  const [filter, setFilter]       = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showForm, setShowForm]   = useState(false)
  const [editTask, setEditTask]   = useState(null)
  const [showSmartChat, setShowSmartChat] = useState(false)
  const [showQuickMenu, setShowQuickMenu] = useState(false)
  const [defaultTaskType, setDefaultTaskType] = useState('task')
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [viewMode, setViewMode]   = useState('list')
  const [collapsedGroups, setCollapsedGroups] = useState(new Set())
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [subtaskParent, setSubtaskParent] = useState(null)
  const [voiceText, setVoiceText] = useState('')
  const [showMinutesParser, setShowMinutesParser] = useState(false)
  const [calendarToast, setCalendarToast] = useState(null)
  const [quickText, setQuickText] = useState('')
  const [quickLoading, setQuickLoading] = useState(false)

  const [pendingRequest, setPendingRequest] = useState(null)
  const [requestNote, setRequestNote] = useState('')
  const [submittingReq, setSubmittingReq] = useState(false)

  const VIEW_MODES = [
    { id: 'list',    icon: '▤', label: 'قائمة' },
    { id: 'compact', icon: '☰', label: 'مضغوط' },
    { id: 'grouped', icon: '👥', label: 'حسب الشخص' },
    { id: 'kanban',  icon: '⬛', label: 'كانبان' },
  ]
  
  function cycleView() {
    setViewMode(cur => {
      const idx = VIEW_MODES.findIndex(v => v.id === cur)
      return VIEW_MODES[(idx + 1) % VIEW_MODES.length].id
    })
  }

  function toggleCollapse(id) {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // المحادثة الذكية والمحضر والصوتي محصورة على: علي، منار، وليد
  const canUseAI = true // متاح للجميع

  // Handle QuickAddMenu option
  function handleQuickOption(option, data) {
    if (option === 'chat') {
      if (!canUseAI) { showToast('⚠️ المحادثة الذكية متاحة للمدراء فقط'); return }
      setVoiceText('')
      setShowSmartChat(true)
    } else if (option === 'task') {
      setDefaultTaskType('task')
      setShowForm(true)
    } else if (option === 'meeting') {
      setDefaultTaskType('meeting')
      setShowForm(true)
    } else if (option === 'report') {
      setDefaultTaskType('report')
      setShowForm(true)
    } else if (option === 'voice_result') {
      if (!canUseAI) { showToast('⚠️ الإدخال الصوتي متاح للمدراء فقط'); return }
      setVoiceText(data || '')
      setShowSmartChat(true)
    } else if (option === 'voice_fallback') {
      showToast('⚠️ المتصفح لا يدعم الإدخال الصوتي')
    } else if (option === 'minutes') {
      if (!canUseAI) { showToast('⚠️ محضر الاجتماع متاح للمدراء فقط'); return }
      setShowMinutesParser(true)
    }
  }

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return tasks.filter(t => {
      if (filter === 'all') {}
      else if (filter === 'active'   && t.done) return false
      else if (filter === 'done'     && !t.done) return false
      else if (filter === 'urgent'   && t.priority !== 'urgent') return false
      else if (filter === 'mine'     && (!t.person || t.person.trim() !== userProfile?.name)) return false
      else if (filter === 'meetings' && t.taskType !== 'meeting') return false
      else if (filter === 'reports'  && t.taskType !== 'report') return false
      else if (filter === 'waiting'  && t.status !== 'waiting') return false
      else if (filter === 'review'   && t.status !== 'review') return false
      
      if (!q) return true
      return (t.title || '').toLowerCase().includes(q)
          || (t.person || '').toLowerCase().includes(q)
          || (t.projectName || '').toLowerCase().includes(q)
    })
  }, [tasks, filter, searchQuery, userProfile])

  const childrenMap = useMemo(() => {
    const map = {}
    tasks.forEach(t => {
      if (t.parentId) {
        if (!map[t.parentId]) map[t.parentId] = []
        map[t.parentId].push(t)
      }
    })
    return map
  }, [tasks])

  // Calculate child progress for each parent
  const childProgressMap = useMemo(() => {
    const map = {}
    Object.entries(childrenMap).forEach(([parentId, children]) => {
      if (children.length === 0) { map[parentId] = 0; return }
      const done = children.filter(c => c.done).length
      map[parentId] = Math.round((done / children.length) * 100)
    })
    return map
  }, [childrenMap])

  const taskGroups = useMemo(() => (
    filtered.filter(t => !t.parentId).map(t => ({ task: t, children: childrenMap[t.id] || [] }))
  ), [filtered, childrenMap])

  const kanbanColumns = useMemo(() => [
    { id: 'urgent', label: 'عاجل 🔴', tasks: filtered.filter(t => t.priority === 'urgent' && !t.done) },
    { id: 'active', label: 'قيد التنفيذ 🔵', tasks: filtered.filter(t => t.priority !== 'urgent' && !t.done) },
    { id: 'done',   label: 'مكتملة ✅', tasks: filtered.filter(t => t.done) },
  ], [filtered])

  const groupedByPerson = useMemo(() => {
    const map = {}
    filtered.forEach(t => {
      const key = t.person?.trim() || 'بدون مسؤول'
      if (!map[key]) map[key] = []
      map[key].push(t)
    })
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0], 'ar'))
  }, [filtered])

  const stats = useMemo(() => {
    const total  = tasks.length
    const done   = tasks.filter(t => t.done).length
    const urgent = tasks.filter(t => t.priority === 'urgent' && !t.done).length
    const pct    = total ? Math.round((done / total) * 100) : 0
    return { total, done, urgent, pending: total - done, pct }
  }, [tasks])

  function submitRequest(type, payload) {
    setPendingRequest({ type, payload, label: REQUEST_LABELS[type] })
    setRequestNote('')
  }

  async function confirmRequest() {
    if (!pendingRequest) return
    setSubmittingReq(true)
    try {
      await createRequest({
        type: pendingRequest.type,
        payload: { ...pendingRequest.payload, note: requestNote },
        requestedBy: userProfile.uid,
        requestedByName: userProfile.name,
      })
      showToast('📨 تم إرسال الطلب — بانتظار موافقة المدير')
    } catch (e) {
      showToast('❌ خطأ في إرسال الطلب')
    } finally {
      setSubmittingReq(false)
      setPendingRequest(null)
      setShowForm(false)
      setEditTask(null)
    }
  }

  async function addTask(form, subTaskTitles = []) {
    if (isDuplicateTask(form.title, tasks)) {
      showToast('⚠️ المهمة موجودة مسبقاً')
      setShowForm(false)
      return
    }
    if (!canWrite) {
      submitRequest('add', { ...form, subTaskTitles: subTaskTitles.length > 0 ? subTaskTitles : undefined })
      setShowForm(false)
      return
    }
    try {
      const taskData = { ...form, done: form.status === 'done', status: form.status || 'new' }
      // parentId comes from form (dropdown) or from subtaskParent (button)
      if (subtaskParent && !taskData.parentId) {
        taskData.parentId = subtaskParent.id
      }
      const newId = await dbAddTask(taskData)
      if (subTaskTitles.length > 0) {
        for (const title of subTaskTitles) {
          await dbAddTask({
            title, priority: form.priority, person: form.person,
            dueDate: '', recurrence: '', reminderTime: '',
            projectName: form.projectName || '',
            sourceType: form.sourceType, sourceTitle: form.sourceTitle, done: false,
            status: 'new', parentId: newId || '',
          })
        }
        showToast(`✅ أضيفت المهمة و${subTaskTitles.length} فرعية`)
      } else if (form.taskType === 'meeting' && form.dueDate) {
        // Show calendar toast for meetings
        setCalendarToast({
          title: form.title,
          date: form.dueDate,
          time: form.meetingTime || '',
          location: form.meetingLocation || '',
          person: form.person || '',
        })
        showToast('📅 تم حفظ الاجتماع')
      } else {
        showToast('✅ تمت إضافة المهمة')
      }
    } catch (e) { showToast('❌ خطأ في إضافة المهمة') }
    setShowForm(false)
    setSubtaskParent(null)
  }

  async function updateTaskHandler(form) {
    if (!canWrite) {
      const original = tasks.find(t => t.id === form.id)
      if (original) {
        // الموظف يقدر يعدّل: ملاحظات الإنجاز + الحالة + closeNote مباشرة بدون موافقة
        const directUpdates = {}
        let hasDirect = false
        if ((form.closeNote || '') !== (original.closeNote || '')) {
          directUpdates.closeNote = form.closeNote || ''
          hasDirect = true
        }
        if ((form.status || 'new') !== (original.status || 'new')) {
          directUpdates.status = form.status
          directUpdates.done = form.status === 'done'
          if (form.status === 'done') directUpdates.completedAt = new Date().toISOString()
          hasDirect = true
        }
        // تسجيل التحديث في لوق المهمة
        if (hasDirect) {
          try {
            // أضف التحديث المباشر
            await dbUpdateTask(form.id, directUpdates)
            // سجّل في لوق المهمة
            await addUpdateToTask(form.id, {
              from: userProfile?.name || '',
              message: directUpdates.closeNote || `تغيير الحالة إلى: ${STATUS_OPTIONS.find(s => s.value === form.status)?.label || form.status}`,
              type: 'employee_update',
            })
            showToast('✅ تم حفظ التحديث')
          } catch (e) {
            showToast('❌ خطأ في حفظ التحديث')
          }
        }
        // تعديلات تحتاج موافقة (عنوان، تاريخ، إلخ)
        let hasRequest = false
        if (original.title !== form.title) {
          submitRequest('edit_title', { taskId: form.id, title: form.title, originalTitle: original.title })
          hasRequest = true
        } else if (original.dueDate !== form.dueDate) {
          submitRequest('edit_date', { taskId: form.id, dueDate: form.dueDate, originalDate: original.dueDate })
          hasRequest = true
        }
        if (!hasDirect && !hasRequest) {
          showToast('⚠️ هذا التعديل يحتاج موافقة المدير')
        }
      }
      setEditTask(null)
      return
    }
    try {
      const { id, ...data } = form
      const original = tasks.find(t => t.id === id)
      data.done = data.status === 'done'
      if (data.done && !data.completedAt) data.completedAt = new Date().toISOString()
      if (!data.done) data.completedAt = null
      await dbUpdateTask(id, data)
      // سجّل التغيير في لوق المهمة
      const changes = []
      if (original && original.status !== data.status) changes.push(`الحالة → ${STATUS_OPTIONS.find(s => s.value === data.status)?.label || data.status}`)
      if (original && (original.closeNote || '') !== (data.closeNote || '') && data.closeNote) changes.push(`ملاحظة: ${data.closeNote}`)
      if (changes.length > 0) {
        await addUpdateToTask(id, {
          from: userProfile?.name || '',
          message: changes.join(' | '),
          type: 'admin_update',
        })
      }
      showToast('✏️ تم تعديل المهمة')
    } catch (e) { showToast('❌ خطأ في التعديل') }
    setEditTask(null)
  }

  async function toggleTask(id) {
    const task = tasks.find(t => t.id === id)
    if (!task) return
    if (!canWrite && !task.done) {
      submitRequest('close', { taskId: id, taskTitle: task.title })
      return
    }
    const done = !task.done
    const updates = { done, status: done ? 'done' : 'new' }
    if (done && task.recurrence) {
      const newDue = calcNextDue(task.dueDate, task.recurrence)
      Object.assign(updates, { done: false, status: 'new', dueDate: newDue, completedAt: null })
      showToast('🔄 تجددت المهمة المتكررة')
    } else if (done) {
      updates.completedAt = new Date().toISOString()
      showToast('🎉 أحسنت! تم إنجاز المهمة')
    } else { updates.completedAt = null }

    try { await dbUpdateTask(id, updates) } catch (e) { showToast('❌ خطأ في تحديث الحالة') }
  }

  async function deleteTask(id) {
    if (!canWrite) { showToast('⚠️ ليس لديك صلاحية الحذف'); return }
    try { await dbDeleteTask(id); showToast('🗑 تم حذف المهمة') } catch (e) { showToast('❌ خطأ في الحذف') }
    setDeleteConfirm(null)
  }

  async function handleSmartChatAdd(newTasks) {
    if (!canWrite) { showToast('⚠️ ليس لديك صلاحية الإضافة المباشرة'); return }
    const deduped = deduplicateTasks(newTasks, tasks)
    const skipped = newTasks.length - deduped.length
    for (const t of deduped) await dbAddTask({ ...t, done: false, status: 'new' })
    if (deduped.length === 0) showToast('⚠️ جميع المهام موجودة مسبقاً')
    else showToast(`✅ تمت إضافة ${deduped.length} مهمة${skipped ? ` (تجاهل ${skipped} مكررة)` : ''}`)
  }

  // Subtask branching
  function handleAddSubtask(parentTask) {
    setSubtaskParent(parentTask)
    setDefaultTaskType('task')
    setShowForm(true)
  }

  // ③ الإضافة السريعة بجملة وحدة
  async function handleQuickAdd() {
    if (!quickText.trim() || quickLoading) return
    if (!canWrite) { showToast('⚠️ ليس لديك صلاحية الإضافة المباشرة'); return }
    setQuickLoading(true)
    try {
      const system = `أنت مساعد لتحويل نص عربي (عامي أو فصيح) إلى مهمة منظمة.
حلل النص واستخرج: العنوان، الأولوية، الشخص المسؤول، التاريخ، المشروع، نوع المهمة (task/meeting/report).
أعضاء الفريق: م. علي الزهراني، د. منار سمان، د. وليد الحسن، أ. عبير الشدوخي، د. حامد الزهراني، أ. حماد المظيبري، أ. محمد القرشي، أ. محمد الحجيلي، أ. سعد القرشي، أ. أميرة التميمي، د. مرام الشهراني، أ. وفاء آل إسماعيل، د. سمية الغريب، أ. مشاعل المطيري، أ. صفاء الشهري، أ. أمجاد المطيري، أ. مي الأسمري، أ. شادي نبيل
لو ذكر اسم مختصر (سعد، حماد، وفاء) طابقه مع الاسم الكامل.
أرجع JSON فقط بدون أي نص:
{"title":"","priority":"medium","person":"","dueDate":"","projectName":"","taskType":"task","meetingTime":"","meetingLocation":""}`

      const raw = await callClaude(null, system, quickText.trim())
      const clean = raw.replace(/```json/g, '').replace(/```/g, '').trim()
      const parsed = JSON.parse(clean)
      
      if (!parsed.title) { showToast('❌ لم أستطع فهم المهمة'); return }
      
      // Check duplicate
      if (isDuplicateTask(parsed.title, tasks)) {
        showToast('⚠️ مهمة مشابهة موجودة: ' + parsed.title)
        setQuickLoading(false)
        return
      }

      await dbAddTask({
        ...parsed,
        done: false,
        status: 'new',
        sourceType: '',
        sourceTitle: '',
        recurrence: '',
        reminderTime: '',
        closeNote: '',
      })
      
      showToast('✅ ' + parsed.title)
      setQuickText('')
      
      // Show calendar toast for meetings
      if (parsed.taskType === 'meeting' && parsed.dueDate) {
        setCalendarToast({
          title: parsed.title,
          date: parsed.dueDate,
          time: parsed.meetingTime || '',
          location: parsed.meetingLocation || '',
          person: parsed.person || '',
        })
      }
    } catch (e) {
      console.error('Quick add error:', e)
      showToast('❌ خطأ في الإضافة السريعة')
    } finally {
      setQuickLoading(false)
    }
  }

  function exportJSON() {
    if (!isAdmin) { showToast('⚠️ متاح للمدير فقط'); return }
    const data = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), tasks }, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `مهامي-${new Date().toISOString().slice(0,10)}.json`
    a.click(); URL.revokeObjectURL(url)
    setShowExportMenu(false)
    showToast('✅ تم تنزيل النسخة الاحتياطية')
  }

  function exportCSV() {
    const headers = ['العنوان','الأولوية','الحالة','الشخص','تاريخ الاستحقاق','الإنجاز','المشروع']
    const rows = tasks.map(t => [
      `"${(t.title||'').replace(/"/g,'""')}"`, t.priority||'', t.status||'new',
      `"${(t.person||'').replace(/"/g,'""')}"`, t.dueDate||'',
      t.done ? 'مكتملة' : 'معلقة',
      `"${(t.projectName||'').replace(/"/g,'""')}"`,
    ])
    const csv  = '\uFEFF' + [headers,...rows].map(r=>r.join(',')).join('\n')
    const blob = new Blob([csv],{type:'text/csv;charset=utf-8'})
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `مهامي-${new Date().toISOString().slice(0,10)}.csv`
    a.click(); URL.revokeObjectURL(url)
    setShowExportMenu(false)
    showToast('✅ تم تنزيل ملف CSV')
  }

  function exportExcel() {
    try {
      const CHANNEL_MAP = { minutes: 'محضر', directive: 'توجيه مباشر', email: 'إيميل' }
      const STATUS_MAP = { new: 'New', studying: 'In Progress', in_progress: 'In Progress', executing: 'In Progress', waiting: 'Delayed', review: 'In Progress', done: 'Completed' }
      // Completion % based on status
      const COMPLETION_MAP = { new: 0, studying: 0.25, in_progress: 0.5, executing: 0.5, waiting: 0.5, review: 0.75, done: 1 }
      // App status (Arabic) for the extra column
      const APP_STATUS_MAP = { new: 'جديدة', studying: 'قيد الدراسة', in_progress: 'قيد التنفيذ', waiting: 'بانتظار جهة خارجية', review: 'قيد المراجعة', done: 'مكتملة' }
      const today = new Date(); today.setHours(0,0,0,0)

      const EXCEL_COLUMNS = ['S No.','Source','Sub_Source','Task Title','Task Description','What\'s Done','Type','Start Date','Due Date','Completion %','Status','First Owner','Secondary Owner','Channel','App Status','All Types','Task ID']

      const dataToExport = tasks.map((t, i) => {
        const sno = t.excelSNo || `T-${String(i + 1).padStart(4, '0')}`

        // Start Date from createdAt → real Date object for Excel
        let startDate = null
        try {
          const ca = t.createdAt?.toDate ? t.createdAt.toDate() : (t.createdAt ? new Date(t.createdAt) : null)
          if (ca && !isNaN(ca.getTime())) startDate = ca
        } catch {}

        // Due Date → real Date object
        let finalDueDate = null
        if (t.dueDate) {
          try {
            const d = new Date(t.dueDate)
            if (!isNaN(d.getTime())) finalDueDate = d
          } catch {}
        }
        if (!finalDueDate && startDate) {
          try {
            const d = new Date(startDate)
            let addedDays = 0
            while (addedDays < 5) { d.setDate(d.getDate() + 1); if (d.getDay() !== 5 && d.getDay() !== 6) addedDays++ }
            finalDueDate = d
          } catch {}
        }

        // Completion % — real percentage based on status
        const completion = COMPLETION_MAP[t.status] ?? (t.done ? 1 : 0)

        // Excel Status — auto Delayed if overdue
        let status = STATUS_MAP[t.status] || 'New'
        if (!t.done && finalDueDate) {
          const due = new Date(finalDueDate); due.setHours(0,0,0,0)
          if (due < today) status = 'Delayed'
        }

        // Channel (3 values only: محضر، توجيه مباشر، إيميل)
        const channel = CHANNEL_MAP[t.sourceType] || ''

        // First Owner / Secondary Owner
        const firstOwner = (t.person || '').trim()
        const secondOwner = t.secondaryOwner || ''

        // Type (projectNames joined with comma, or projectName)
        const type = (t.projectNames && t.projectNames.length > 0) ? t.projectNames.join(', ') : (t.projectName || '')

        return {
          [EXCEL_COLUMNS[0]]: sno,
          [EXCEL_COLUMNS[1]]: t.excelSource || '',
          [EXCEL_COLUMNS[2]]: t.excelSubSource || t.sourceTitle || '',
          [EXCEL_COLUMNS[3]]: t.sourceTitle || '',
          [EXCEL_COLUMNS[4]]: t.title || '',
          [EXCEL_COLUMNS[5]]: t.closeNote || '',
          [EXCEL_COLUMNS[6]]: type,
          [EXCEL_COLUMNS[7]]: startDate,
          [EXCEL_COLUMNS[8]]: finalDueDate,
          [EXCEL_COLUMNS[9]]: completion,
          [EXCEL_COLUMNS[10]]: status,
          [EXCEL_COLUMNS[11]]: firstOwner,
          [EXCEL_COLUMNS[12]]: secondOwner,
          [EXCEL_COLUMNS[13]]: channel,
          [EXCEL_COLUMNS[14]]: APP_STATUS_MAP[t.status] || 'جديدة',
          [EXCEL_COLUMNS[15]]: type,
          [EXCEL_COLUMNS[16]]: t.id || '',
        }
      })

      const worksheet = XLSX.utils.json_to_sheet(dataToExport, { dateNF: 'yyyy-mm-dd' });

      // Format date columns (H=Start Date col 8, I=Due Date col 9) and Completion % (J col 10)
      const range = XLSX.utils.decode_range(worksheet['!ref'])
      for (let R = range.s.r + 1; R <= range.e.r; R++) {
        // Start Date (col 7, 0-indexed)
        const sdCell = worksheet[XLSX.utils.encode_cell({ r: R, c: 7 })]
        if (sdCell && sdCell.v instanceof Date) { sdCell.t = 'd'; sdCell.z = 'yyyy-mm-dd' }
        // Due Date (col 8)
        const ddCell = worksheet[XLSX.utils.encode_cell({ r: R, c: 8 })]
        if (ddCell && ddCell.v instanceof Date) { ddCell.t = 'd'; ddCell.z = 'yyyy-mm-dd' }
        // Completion % (col 9) — format as percentage
        const cpCell = worksheet[XLSX.utils.encode_cell({ r: R, c: 9 })]
        if (cpCell && typeof cpCell.v === 'number') { cpCell.t = 'n'; cpCell.z = '0%' }
      }

      // Set column widths
      worksheet['!cols'] = [
        { wch: 8 },  // S No.
        { wch: 16 }, // Source
        { wch: 16 }, // Sub_Source
        { wch: 30 }, // Task Title
        { wch: 50 }, // Task Description
        { wch: 40 }, // What's Done
        { wch: 22 }, // Type
        { wch: 12 }, // Start Date
        { wch: 12 }, // Due Date
        { wch: 12 }, // Completion %
        { wch: 12 }, // Status
        { wch: 22 }, // First Owner
        { wch: 22 }, // Secondary Owner
        { wch: 14 }, // Channel
        { wch: 16 }, // App Status
        { wch: 22 }, // All Types
        { wch: 24 }, // Task ID
      ]

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Tasks Tracker");
      
      const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `LOC_Tasks_${new Date().toISOString().split('T')[0]}.xlsx`;
      
      document.body.appendChild(a); 
      a.click();
      document.body.removeChild(a);
      
      URL.revokeObjectURL(url);
      setShowExportMenu(false);
      showToast('✅ تم تنزيل ملف Excel');
    } catch (error) {
      console.error("Excel export error:", error);
      showToast('❌ خطأ: ' + error.message);
    }
  }

  function parseExcelDate(raw) {
    if (!raw) return ''
    if (raw instanceof Date) {
      if (isNaN(raw.getTime())) return ''
      return raw.toISOString().split('T')[0]
    }
    if (typeof raw === 'number') {
      const jsDate = new Date(Math.round((raw - 25569) * 86400 * 1000))
      if (isNaN(jsDate.getTime())) return ''
      return jsDate.toISOString().split('T')[0]
    }
    if (typeof raw === 'string') {
      const d = new Date(raw)
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]
      return raw.substring(0, 10)
    }
    return ''
  }

  async function handleImportExcel(e) {
    const file = e.target.files[0]
    if (!file) return

    try {
      showToast('⏳ جاري قراءة الملف...')
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })

      let targetRows = []
      let targetSheetName = workbook.SheetNames.find(n => n.trim() === 'Tasks Tracker')
      
      if (targetSheetName) {
        targetRows = XLSX.utils.sheet_to_json(workbook.Sheets[targetSheetName], { defval: '' })
      } else {
        for (const name of workbook.SheetNames) {
          const tempRows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { defval: '' })
          if (tempRows.length > 0) {
            targetRows = tempRows
            break
          }
        }
      }

      if (targetRows.length === 0) {
        showToast('❌ لم يتم العثور على بيانات المهام في الشيتات')
        return
      }

      let added = 0, updated = 0

      for (const rawRow of targetRows) {
        const row = {};
        for (const key in rawRow) {
          if (Object.prototype.hasOwnProperty.call(rawRow, key)) {
            row[key.trim().toLowerCase()] = rawRow[key];
          }
        }

        const title = (row['task description'] || row['عنوان المهمة'] || '').toString().trim()
        if (!title) continue

        const completion = row['completion %'] || row['نسبة الإنجاز']
        const statusRaw = (row['status'] || row['الحالة'] || '').toString().toLowerCase()
        const done = (typeof completion === 'number' && completion >= 1) ||
                     (typeof completion === 'string' && completion.includes('100')) ||
                     (statusRaw === 'completed' || statusRaw === 'مكتملة');

        const sourceTitle = (row['task title'] || row['عنوان المصدر'] || '').toString().trim();
        const sourceType  = (row['channel'] || row['مصدر المهمة'] || '').toString().trim();
        const person      = (row['first owner'] || row['owner'] || row['الشخص المسؤول'] || '').toString().trim();
        const projectName = (row['type'] || row['نوع المهمة'] || row['المشروع'] || '').toString().trim();
        const closeNote   = (row["what's done"] || row['ملاحظات الإنجاز'] || '').toString().trim();
        
        let dueDate = '';
        if (row['due date']) dueDate = parseExcelDate(row['due date']);
        else if (row['تاريخ الاستحقاق']) dueDate = parseExcelDate(row['تاريخ الاستحقاق']);

        const updateData = { 
          done, sourceTitle, sourceType, person, projectName, closeNote, dueDate,
          status: done ? 'done' : 'new',
        };

        const existingTask = tasks.find(t => (t.title || '').trim().toLowerCase() === title.toLowerCase())

        if (existingTask) {
          await dbUpdateTask(existingTask.id, updateData)
          updated++
        } else {
          await dbAddTask({
            title, priority: 'medium', ...updateData
          })
          added++
        }
      }

      setShowExportMenu(false)
      showToast(`✅ تم تحديث ${updated} وإضافة ${added} مهمة`)
    } catch (err) {
      console.error('Excel import error:', err)
      showToast('❌ خطأ في الاستيراد: ' + err.message)
    } finally {
      e.target.value = ''
    }
  }

  function handleImportJSON(e) {
    if (!canWrite) { showToast('⚠️ ليس لديك صلاحية الاستيراد'); return }
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async ev => {
      try {
        const data = JSON.parse(ev.target.result)
        const imported = Array.isArray(data) ? data : (data.tasks || [])
        if (!imported.length) { showToast('❌ لا توجد مهام في الملف'); return }
        const existing = new Set(tasks.map(t => t.title.trim().toLowerCase()))
        const newOnes  = imported.filter(t => !existing.has((t.title||'').trim().toLowerCase()))
        for (const t of newOnes) await dbAddTask({ ...t, done: t.done || false, status: t.status || 'new' })
        showToast(`✅ استُعيد ${newOnes.length} مهمة جديدة`)
      } catch { showToast('❌ ملف JSON غير صحيح') }
    }
    reader.readAsText(file)
    e.target.value = ''
    setShowExportMenu(false)
  }

  const circumference = 2 * Math.PI * 40

  const menuBtnStyle = {
    display: 'flex', alignItems: 'center', width: '100%', padding: '8px 12px',
    background: 'none', border: 'none', color: 'var(--text)',
    fontSize: 14, fontFamily: 'var(--font)', cursor: 'pointer', textAlign: 'right', borderRadius: 8
  };

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div className="header" style={{ paddingBottom: '10px' }}>
        <div className="header-row">
          <div>
            <div className="header-title">مهامي Pro</div>
            <div className="header-sub">{userProfile?.name} • PMO مركز عمليات المختبرات</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', position: 'relative' }}>
            
            {!isUser && (
              <button onClick={() => setShowExportMenu(s => !s)} style={{
                  background: 'rgba(99,102,241,0.12)', color: '#818cf8',
                  border: '1px solid rgba(99,102,241,0.25)', borderRadius: 8,
                  padding: '6px 10px', fontSize: 13, fontFamily: 'var(--font)', cursor: 'pointer',
                }}>⬇️</button>
            )}

            {showExportMenu && !isUser && (
              <div style={{
                position: 'absolute', top: 38, right: 0, zIndex: 200,
                background: 'var(--card)', border: '1px solid var(--border)',
                borderRadius: 12, padding: 8, minWidth: 170,
                boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
                display: 'flex', flexDirection: 'column', gap: 4,
              }}>
                <button onClick={exportExcel} style={menuBtnStyle}><span>📗</span> تنزيل Excel</button>
                {isAdmin && <button onClick={exportJSON} style={menuBtnStyle}><span>💾</span> تنزيل JSON</button>}
                <button onClick={exportCSV} style={menuBtnStyle}><span>📊</span> تنزيل CSV</button>
                <label style={{ ...menuBtnStyle, cursor: 'pointer' }}>
                  <span style={{ marginRight: 8 }}>📥</span> استيراد Excel
                  <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleImportExcel} />
                </label>
                {canWrite && (
                  <>
                    <div style={{ height: 1, background: 'var(--border)', margin: '2px 8px' }} />
                    <label style={{ ...menuBtnStyle, cursor: 'pointer' }}>
                      <span>📂</span> استيراد JSON
                      <input type="file" accept=".json" style={{ display: 'none' }} onChange={handleImportJSON} />
                    </label>
                  </>
                )}
              </div>
            )}
            {showExportMenu && <div onClick={() => setShowExportMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 199 }} />}
            
            <button onClick={cycleView} title={VIEW_MODES.find(v => v.id === viewMode)?.label} style={{
              background: 'rgba(59,130,246,0.12)', color: 'var(--blue-light)',
              border: '1px solid rgba(59,130,246,0.25)', borderRadius: 8,
              padding: '6px 10px', fontSize: 13, fontFamily: 'var(--font)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <span>{VIEW_MODES.find(v => v.id === viewMode)?.icon}</span>
              <span style={{ fontSize: 11 }}>{VIEW_MODES.find(v => v.id === viewMode)?.label}</span>
            </button>
            
          </div>
        </div>
      </div>

      <div className="page" style={{ paddingBottom: '90px' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', gap: 12 }}>
          <div className="ring-container" style={{ width: 80, height: 80 }}>
            <svg viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="40" fill="none" stroke="var(--bg3)" strokeWidth="10" />
              <circle cx="50" cy="50" r="40" fill="none" stroke="url(#grad)" strokeWidth="10"
                strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - stats.pct / 100)} />
              <defs>
                <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#3b82f6" />
                  <stop offset="100%" stopColor="#8b5cf6" />
                </linearGradient>
              </defs>
            </svg>
            <div className="ring-center">
              <span className="ring-pct">{stats.pct}%</span><span className="ring-text">إنجاز</span>
            </div>
          </div>
          <div className="stats-bar" style={{ flex: 1, padding: 0 }}>
            <div className="stat-card"><div className="stat-num" style={{ color: 'var(--text2)' }}>{stats.pending}</div><div className="stat-label">معلقة</div></div>
            <div className="stat-card"><div className="stat-num" style={{ color: 'var(--red)' }}>{stats.urgent}</div><div className="stat-label">عاجل</div></div>
            <div className="stat-card"><div className="stat-num" style={{ color: 'var(--green)' }}>{stats.done}</div><div className="stat-label">مكتملة</div></div>
          </div>
        </div>

        {isUser && (
          <div style={{
            margin: '0 16px 8px', padding: '10px 14px', borderRadius: 12,
            background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)',
            fontSize: 12, color: 'var(--orange)', display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span>ℹ️</span><span>صلاحيتك: الإضافة / التعديل / الإغلاق تحتاج موافقة المدير</span>
          </div>
        )}

        {/* ③ الإضافة السريعة بجملة وحدة */}
        {canWrite && (
          <div style={{ padding: '0 16px 8px' }}>
            <div style={{
              display: 'flex', gap: 6, alignItems: 'center',
              background: 'var(--card)', border: '1px solid var(--border)',
              borderRadius: 12, padding: '4px 4px 4px 12px',
            }}>
              <input
                type="text"
                value={quickText}
                onChange={e => setQuickText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleQuickAdd() }}
                placeholder="⚡ أضف بجملة: اجتماع مع سعد يوم الأربعاء..."
                style={{
                  flex: 1, background: 'none', border: 'none', color: 'var(--text)',
                  fontSize: 13, outline: 'none', fontFamily: 'inherit',
                }}
                disabled={quickLoading}
              />
              <button
                onClick={handleQuickAdd}
                disabled={!quickText.trim() || quickLoading}
                style={{
                  width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                  background: quickText.trim() && !quickLoading ? 'linear-gradient(135deg, #3b82f6, #8b5cf6)' : 'var(--bg3)',
                  border: 'none', color: '#fff', fontSize: 16,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: quickText.trim() && !quickLoading ? 'pointer' : 'default',
                }}
              >
                {quickLoading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : '↑'}
              </button>
            </div>
          </div>
        )}

        <div style={{ padding: '0 16px 8px', position: 'relative' }}>
          <span style={{ position: 'absolute', right: 28, top: '50%', transform: 'translateY(-50%)', fontSize: 15, opacity: 0.45 }}>🔍</span>
          <input type="search" placeholder="ابحث في المهام..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            style={{
              width: '100%', boxSizing: 'border-box', padding: '9px 38px 9px 12px', borderRadius: 12,
              border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: 14, outline: 'none',
            }}
          />
          {searchQuery && <button onClick={() => setSearchQuery('')} style={{ position: 'absolute', left: 28, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', fontSize: 13, opacity: 0.5, color: 'var(--text)', padding: 2 }}>✕</button>}
        </div>

        <div className="filters" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: '5px' }}>
          {FILTERS.map(f => (
            <button key={f.id} className={`filter-btn${filter === f.id ? ' active' : ''}`} onClick={() => setFilter(f.id)}>{f.label}</button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state"><div className="empty-icon">📋</div><div className="empty-text">لا توجد مهام</div></div>
        ) : viewMode === 'list' ? (
          <div className="task-list">
            {taskGroups.map(({ task, children }) => (
              <div key={task.id} className="task-group">
                <TaskCard task={task} onToggle={toggleTask} onEdit={setEditTask} onDelete={canWrite ? id => setDeleteConfirm(id) : null} showToast={showToast} childCount={children.length} isCollapsed={collapsedGroups.has(task.id)} onToggleCollapse={() => toggleCollapse(task.id)} onAddSubtask={canWrite ? handleAddSubtask : null} childProgress={childProgressMap[task.id]} onRequestUpdate={onRequestUpdate} />
                {children.length > 0 && !collapsedGroups.has(task.id) && (
                  <div className="subtask-group">
                    {children.map(c => <TaskCard key={c.id} task={c} onToggle={toggleTask} onEdit={setEditTask} onDelete={canWrite ? id => setDeleteConfirm(id) : null} showToast={showToast} isSubtask />)}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : viewMode === 'compact' ? (
          <div className="compact-list">
            {filtered.map(task => (
              <div key={task.id} className={`compact-row${task.done ? ' done' : ''}${task.parentId ? ' is-subtask' : ''}`}>
                <button className={`task-check${task.done ? ' done' : ''}`} style={{ flexShrink: 0, width: 18, height: 18, fontSize: 10 }} onClick={() => toggleTask(task.id)}>{task.done && <span style={{ color: '#fff', fontSize: 10 }}>✓</span>}</button>
                <div className="compact-title" onClick={() => setEditTask(task)}>{task.title}</div>
                <span className={`compact-dot priority-dot-${task.priority}`} />
              </div>
            ))}
          </div>
        ) : viewMode === 'grouped' ? (
          <div className="grouped-list">
            {groupedByPerson.map(([person, personTasks]) => (
              <div key={person} className="person-group">
                <div className="person-group-header"><span className="person-group-icon">👤</span><span className="person-group-name">{person}</span><span className="person-group-count">{personTasks.length}</span></div>
                <div className="person-group-tasks">
                  {personTasks.map(task => (
                    <div key={task.id} className={`compact-row${task.done ? ' done' : ''}`}>
                      <button className={`task-check${task.done ? ' done' : ''}`} style={{ flexShrink: 0, width: 18, height: 18, fontSize: 10 }} onClick={() => toggleTask(task.id)}>{task.done && <span style={{ color: '#fff', fontSize: 10 }}>✓</span>}</button>
                      <div className="compact-title" onClick={() => setEditTask(task)}>{task.title}</div>
                      <span className={`compact-dot priority-dot-${task.priority}`} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : viewMode === 'kanban' ? (
          <div className="kanban-board">
            {kanbanColumns.map(col => (
              <div key={col.id} className={`kanban-col kanban-col-${col.id}`}>
                <div className="kanban-col-header"><span className="kanban-col-label">{col.label}</span><span className="kanban-col-count">{col.tasks.length}</span></div>
                <div className="kanban-cards">
                  {col.tasks.map(task => (
                    <div key={task.id} className="kanban-card" onClick={() => setEditTask(task)}><div className="kanban-card-title">{task.title}</div>{task.person && <div className="kanban-card-person">👤 {task.person}</div>}{task.dueDate && <div className="kanban-card-date">📅 {task.dueDate}</div>}</div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {/* زر (+) الذكي — يفتح QuickAddMenu */}
        <button className="fab" onClick={() => setShowQuickMenu(true)} aria-label="إضافة" style={{ bottom: 90, zIndex: 100 }}>
          +
        </button>

      </div>

      {showQuickMenu && (
        <QuickAddMenu
          onOption={handleQuickOption}
          onClose={() => setShowQuickMenu(false)}
          isUser={isUser}
        />
      )}

      {showForm && (
        <TaskForm 
          onClose={() => { setShowForm(false); setSubtaskParent(null) }} 
          onSave={addTask}
          defaultTaskType={defaultTaskType}
          apiKey={currentApiKey}
          parentTask={subtaskParent}
          allTasks={tasks}
        />
      )}

      {editTask && (
        <TaskForm 
          task={editTask} 
          onClose={() => setEditTask(null)} 
          onSave={updateTaskHandler}
          apiKey={currentApiKey}
          allTasks={tasks}
        />
      )}

      {showSmartChat && (
        <SmartChat 
          tasks={tasks}
          apiKey={currentApiKey} 
          onClose={() => { setShowSmartChat(false); setVoiceText('') }} 
          onAddTasks={handleSmartChatAdd} 
          showToast={showToast}
          initialText={voiceText}
          userName={userProfile?.name || ''}
        />
      )}

      {showMinutesParser && (
        <MeetingMinutesParser
          apiKey={currentApiKey}
          onAddTasks={handleSmartChatAdd}
          onClose={() => setShowMinutesParser(false)}
          showToast={showToast}
        />
      )}

      {deleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--card)', padding: 20, borderRadius: 12, width: '90%', maxWidth: 320, textAlign: 'center' }}>
            <h3 style={{ margin: '0 0 10px', color: 'var(--text)' }}>تأكيد الحذف</h3>
            <p style={{ margin: '0 0 20px', color: 'var(--text2)', fontSize: 14 }}>هل أنت متأكد من حذف هذه المهمة نهائياً؟</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => deleteTask(deleteConfirm)} style={{ flex: 1, padding: '10px', background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}>حذف</button>
              <button onClick={() => setDeleteConfirm(null)} style={{ flex: 1, padding: '10px', background: 'var(--bg3)', color: 'var(--text)', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {pendingRequest && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--card)', padding: 20, borderRadius: 12, width: '90%', maxWidth: 350 }}>
            <h3 style={{ margin: '0 0 10px', color: 'var(--text)', textAlign: 'center' }}>{pendingRequest.label}</h3>
            <p style={{ margin: '0 0 15px', color: 'var(--text2)', fontSize: 13, textAlign: 'center' }}>هذا الإجراء يحتاج موافقة. يمكنك كتابة ملاحظة للمدير (اختياري).</p>
            <textarea
              value={requestNote}
              onChange={e => setRequestNote(e.target.value)}
              placeholder="اكتب مبرر أو ملاحظة..."
              style={{ width: '100%', minHeight: 80, padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', marginBottom: 15, boxSizing: 'border-box', fontFamily: 'inherit' }}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={confirmRequest} disabled={submittingReq} style={{ flex: 1, padding: '10px', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 8, cursor: submittingReq ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                {submittingReq ? 'جاري الإرسال...' : 'إرسال الطلب'}
              </button>
              <button onClick={() => setPendingRequest(null)} style={{ flex: 1, padding: '10px', background: 'var(--bg3)', color: 'var(--text)', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* Calendar Toast for meetings */}
      {calendarToast && (
        <div style={{
          position: 'fixed', bottom: 100, left: 16, right: 16, zIndex: 1001,
          background: 'var(--card)', border: '1px solid rgba(59,130,246,0.3)',
          borderRadius: 14, padding: '14px 16px',
          boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>📅 {calendarToast.title}</div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
              {calendarToast.date} {calendarToast.time ? `• ${calendarToast.time}` : ''}
            </div>
          </div>
          <button onClick={() => {
            const t = calendarToast
            const title = encodeURIComponent(t.title)
            const details = encodeURIComponent(t.person ? `المسؤول: ${t.person}` : '')
            const location = encodeURIComponent(t.location || '')
            let dates = ''
            if (t.date) {
              const d = t.date.replace(/-/g, '')
              const time = t.time ? t.time.replace(':', '') + '00' : ''
              dates = time ? `&dates=${d}T${time}/${d}T${time}` : `&dates=${d}/${d}`
            }
            window.open(`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}&location=${location}${dates}`, '_blank')
            setCalendarToast(null)
          }} style={{
            padding: '8px 14px', borderRadius: 8,
            background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)',
            color: 'var(--blue-light)', fontSize: 12, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
          }}>📅 أضف للتقويم</button>
          <button onClick={() => setCalendarToast(null)} style={{
            background: 'none', border: 'none', color: 'var(--text3)',
            fontSize: 16, cursor: 'pointer', padding: 2,
          }}>✕</button>
        </div>
      )}
    </div>
  )
}
