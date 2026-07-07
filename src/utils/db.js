/**
 * Firestore helpers for tasks, users, and requests.
 * Collections:
 *   tasks/     – all tasks (previously localStorage)
 *   users/     – keyed by Firebase UID { email, name, role, createdAt }
 *   requests/  – pending user requests { type, payload, requestedBy, status, createdAt }
 */
import {
  collection, doc, getDocs, getDoc,
  addDoc, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, onSnapshot, serverTimestamp, writeBatch, arrayUnion,
} from 'firebase/firestore'
import { db } from '../firebase'

/* ─── TASKS ──────────────────────────────────────────────── */

export function subscribeToTasks(callback) {
  const q = query(collection(db, 'tasks'), orderBy('createdAt', 'asc'))
  return onSnapshot(q, snap => {
    const tasks = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    callback(tasks)
  })
}

export async function addTask(taskData) {
  const ref = await addDoc(collection(db, 'tasks'), {
    ...taskData,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateTask(id, data) {
  await updateDoc(doc(db, 'tasks', id), data)
}

export async function deleteTask(id) {
  /* اقرأ العنوان قبل الحذف لكشف النسخ المكررة */
  const snap = await getDoc(doc(db, 'tasks', id))
  const title = snap.exists() ? (snap.data().title || '').trim() : ''

  /* حذف متسلسل: المهمة + كل مهامها الفرعية */
  const batch = writeBatch(db)
  batch.delete(doc(db, 'tasks', id))
  const childrenSnap = await getDocs(query(collection(db, 'tasks'), where('parentId', '==', id)))
  childrenSnap.forEach(child => batch.delete(child.ref))
  await batch.commit()

  /* تحقق فعلي من الحذف */
  const check = await getDoc(doc(db, 'tasks', id))
  if (check.exists()) throw new Error('المستند ما زال موجوداً بعد الحذف')

  /* كشف النسخ المكررة المتبقية بنفس العنوان */
  if (!title) return { duplicates: 0 }
  const allSnap = await getDocs(collection(db, 'tasks'))
  let duplicates = 0
  allSnap.forEach(d => {
    if ((d.data().title || '').trim() === title) duplicates++
  })
  return { duplicates }
}

/** Bulk-import tasks from localStorage array (first run migration) */
export async function importTasksFromArray(tasksArray) {
  const batch = writeBatch(db)
  tasksArray.forEach(t => {
    const { id: _id, ...rest } = t
    const ref = doc(collection(db, 'tasks'))
    batch.set(ref, { ...rest, createdAt: serverTimestamp() })
  })
  await batch.commit()
}

/** Returns true if Firestore tasks collection is empty */
export async function isTasksEmpty() {
  const snap = await getDocs(collection(db, 'tasks'))
  return snap.empty
}

/* ─── USERS ──────────────────────────────────────────────── */

export async function getAllUsers() {
  const snap = await getDocs(collection(db, 'users'))
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }))
}

export async function createUser({ uid, email, name, role }) {
  await setDoc(doc(db, 'users', uid), {
    email, name, role, createdAt: serverTimestamp(),
  })
}

export async function updateUserRole(uid, role) {
  await updateDoc(doc(db, 'users', uid), { role })
}

export async function deleteUser(uid) {
  await deleteDoc(doc(db, 'users', uid))
}

/* ─── REQUESTS ───────────────────────────────────────────── */

/**
 * type: 'add' | 'edit_title' | 'edit_date' | 'close' | 'request_update'
 * payload: data relevant to the request
 */
export async function createRequest({ type, payload, requestedBy, requestedByName }) {
  await addDoc(collection(db, 'requests'), {
    type,
    payload,
    requestedBy,
    requestedByName,
    status: 'pending',
    createdAt: serverTimestamp(),
  })
}

export function subscribeToPendingRequests(callback) {
  const q = query(collection(db, 'requests'), orderBy('createdAt', 'desc'))
  return onSnapshot(q, snap => {
    const reqs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    callback(reqs)
  })
}

export async function approveRequest(requestId, requestData) {
  const { type, payload } = requestData

  if (type === 'add') {
    const { subTaskTitles, ...taskPayload } = payload
    const newId = await addTask(taskPayload)
    // إضافة المهام الفرعية إذا موجودة
    if (subTaskTitles && subTaskTitles.length > 0 && newId) {
      for (const title of subTaskTitles) {
        await addTask({
          title, priority: taskPayload.priority || 'medium', person: taskPayload.person || '',
          dueDate: '', recurrence: '', reminderTime: '',
          projectName: taskPayload.projectName || '',
          projectNames: taskPayload.projectNames || [],
          sourceType: taskPayload.sourceType || '', sourceTitle: taskPayload.sourceTitle || '',
          done: false, status: 'new', parentId: newId,
        })
      }
    }
  } else if (type === 'edit_title') {
    await updateTask(payload.taskId, { title: payload.title })
  } else if (type === 'edit_date') {
    await updateTask(payload.taskId, { dueDate: payload.dueDate })
  } else if (type === 'close') {
    await updateTask(payload.taskId, {
      done: true,
      completedAt: new Date().toISOString(),
    })
  }

  await updateDoc(doc(db, 'requests', requestId), { status: 'approved' })
}

export async function rejectRequest(requestId) {
  await updateDoc(doc(db, 'requests', requestId), { status: 'rejected' })
}

/* ─── TASK UPDATES (طلب تحديث من الموظف) ─────────────────── */

/**
 * المدير يطلب تحديث من الموظف على مهمة معينة
 */
export async function requestTaskUpdate({ taskId, taskTitle, requestedFrom, requestedFromName, requestedBy, requestedByName, message }) {
  await addDoc(collection(db, 'task_updates'), {
    taskId,
    taskTitle,
    requestedFrom,      // UID of employee
    requestedFromName,  // name of employee
    requestedBy,        // UID of manager
    requestedByName,    // name of manager
    message: message || 'يرجى تقديم تحديث عن حالة هذه المهمة',
    response: '',
    status: 'pending',  // pending → responded
    createdAt: serverTimestamp(),
  })
}

/**
 * الموظف يرد بالتحديث
 */
export async function respondToUpdateRequest(updateId, response) {
  // Update the request doc
  await updateDoc(doc(db, 'task_updates', updateId), {
    response,
    status: 'responded',
    respondedAt: serverTimestamp(),
  })
  // Also save on the task itself (updates array)
  const reqSnap = await getDoc(doc(db, 'task_updates', updateId))
  if (reqSnap.exists()) {
    const data = reqSnap.data()
    if (data.taskId) {
      await addUpdateToTask(data.taskId, {
        from: data.requestedFromName || '',
        message: response,
        type: 'update_response',
      })
    }
  }
}

export async function markUpdateAsRead(updateId) {
  await updateDoc(doc(db, 'task_updates', updateId), { status: 'read' })
}

/**
 * اشترك في طلبات التحديث الموجهة لمستخدم معين (الموظف)
 */
export function subscribeToMyUpdateRequests(callback) {
  const q = query(collection(db, 'task_updates'), orderBy('createdAt', 'desc'))
  return onSnapshot(q, snap => {
    const updates = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    callback(updates)
  })
}

/**
 * لما الموظف يرد — يسجل الرد أيضاً في المهمة نفسها (updates array)
 */
export async function addUpdateToTask(taskId, updateEntry) {
  const ref = doc(db, 'tasks', taskId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return
  const current = snap.data().updates || []
  await updateDoc(ref, {
    updates: [...current, { ...updateEntry, timestamp: new Date().toISOString() }]
  })
}

/**
 * Activity Log — سجل كامل لكل إجراء على المهمة
 * actions: created, status_change, title_edit, date_edit, person_edit,
 *          note_added, approved, rejected, transferred, subtask_assigned
 */
export async function addActivityLog(taskId, logEntry) {
  const ref = doc(db, 'tasks', taskId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return
  const current = snap.data().activityLog || []
  await updateDoc(ref, {
    activityLog: [...current, { ...logEntry, at: new Date().toISOString() }]
  })
}

/* ─── PROGRESS UPDATES (تحديثات التقدم على المهمة) ─────────── */

export async function addTaskProgressUpdate(taskId, { text, by }) {
  await updateDoc(doc(db, 'tasks', taskId), {
    updates: arrayUnion({ text, by: by || '', at: new Date().toISOString() }),
  })
}

/* ─── DEPT REPORTS (التقارير الدورية — منقول ومعمّم من فرع الحج) ── */

export function subscribeToDeptReports(callback) {
  const q = query(collection(db, 'dept_reports'), orderBy('createdAt', 'desc'))
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  })
}

export async function addDeptReport(reportData) {
  const ref = await addDoc(collection(db, 'dept_reports'), {
    ...reportData,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateDeptReport(id, data) {
  await updateDoc(doc(db, 'dept_reports', id), data)
}

export async function deleteDeptReport(id) {
  await deleteDoc(doc(db, 'dept_reports', id))
}

export function subscribeToReportTypes(callback) {
  const q = query(collection(db, 'report_types'), orderBy('createdAt', 'asc'))
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  })
}

export async function addReportType(typeData) {
  const ref = await addDoc(collection(db, 'report_types'), {
    ...typeData,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function deleteReportType(id) {
  await deleteDoc(doc(db, 'report_types', id))
}

/* ─── WEEKLY STAR (نجم الأسبوع) ──────────────────────────── */

/* ─── BUSINESS REPORTS (تقارير الأعمال) ───────────────────── */

export async function addBusinessReport(reportData) {
  const ref = await addDoc(collection(db, 'business_reports'), {
    ...reportData,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateBusinessReport(id, data) {
  await updateDoc(doc(db, 'business_reports', id), data)
}

export async function deleteBusinessReport(id) {
  await deleteDoc(doc(db, 'business_reports', id))
}

export function subscribeToBusinessReports(callback) {
  const q = query(collection(db, 'business_reports'), orderBy('createdAt', 'desc'))
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  })
}

export async function recordReportDelivery(reportId, delivery) {
  const ref = doc(db, 'business_reports', reportId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return
  const current = snap.data().deliveries || []
  await updateDoc(ref, {
    deliveries: [...current, { ...delivery, timestamp: new Date().toISOString() }],
    lastDelivered: new Date().toISOString(),
  })
}

const STAR_CATEGORIES = [
  'Action Accelerator',
  'Innovation Spark',
  'Extra Miler',
  'Collaboration Legend',
]

export { STAR_CATEGORIES }

export async function saveWeeklyStar({ person, category, achievement, selectedBy }) {
  await addDoc(collection(db, 'weekly_stars'), {
    person,
    category,
    achievement,
    selectedBy,
    createdAt: serverTimestamp(),
    weekOf: getWeekOfString(),
  })
}

export function subscribeToWeeklyStars(callback) {
  const q = query(collection(db, 'weekly_stars'), orderBy('createdAt', 'desc'))
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  })
}

function getWeekOfString() {
  const now = new Date()
  const day = now.getDay()
  const diff = now.getDate() - day
  const sunday = new Date(now.setDate(diff))
  return `${sunday.getFullYear()}-${String(sunday.getMonth()+1).padStart(2,'0')}-${String(sunday.getDate()).padStart(2,'0')}`
}
