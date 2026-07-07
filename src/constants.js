/* ─── My Day — Constants المركزية (فريق الأداء والتحليلات P&A) ─── */

export const TEAM_MEMBERS = [
  'م. علي الزهراني',
  'أ. فيصل الرحيمي',
  'م. حمادي الشعائره',
  'أ. صفا الشهري',
  'أ. صالحة المالكي',
  'أ. نورة التركي',
  'أ. رهف جباري',
  'أ. محمد القحطاني',
  'أ. تركي السلمان',
  'أ. ريما الفهيد',
]

/* تاريخ فاصل الأرشيف: كل مهمة أُنشئت قبله تُعتبر أرشيف عهد المختبرات */
export const ARCHIVE_CUTOFF = '2026-07-03'

/* أنواع التقارير الافتراضية (صفحة التقارير الدورية) */
export const DEFAULT_REPORT_TYPES = [
  { value: 'periodic', label: 'التقرير الدوري' },
  { value: 'adhoc', label: 'تقرير حسب الطلب' },
]

export const SOURCE_TYPES = [
  { value: '', label: '— اختر المصدر —' },
  { value: 'minutes', label: 'محضر' },
  { value: 'directive', label: 'توجيه مباشر' },
  { value: 'email', label: 'إيميل' },
  { value: 'routine', label: 'مهمة روتينية' },
]

export const STATUS_OPTIONS = [
  { value: 'not_started',  label: 'لم يبدأ',      color: '#6b7280' },
  { value: 'in_progress',  label: 'جاري العمل',   color: '#10b981' },
  { value: 'overdue',      label: 'متأخر',        color: '#ef4444' },
  { value: 'completed',    label: 'مكتمل',        color: '#3b82f6' },
]

export const PROJECT_FILES = [
  'إدارة المشاريع PMO',
  'راصد والمؤشرات',
  'لوحات البيانات',
  'التقارير الدورية',
  'الاجتماعات والمحاضر',
  'السياسات والقياس',
  'الحوكمة والامتثال',
  'أعمال إشرافية',
  'أخرى',
]

export const PRIORITIES = [
  { value: 'urgent', label: 'عاجل' },
  { value: 'medium', label: 'متوسطة' },
  { value: 'low',    label: 'منخفضة' },
]

export const RECURRENCES = [
  { value: '',          label: 'لا تكرار' },
  { value: 'daily',     label: 'يومي' },
  { value: 'weekly',    label: 'أسبوعي' },
  { value: 'biweekly',  label: 'كل أسبوعين' },
  { value: 'monthly',   label: 'شهري' },
  { value: 'quarterly', label: 'ربع سنوي' },
]

export const TASK_TYPES = [
  { value: 'task',    label: 'مهمة' },
  { value: 'meeting', label: 'اجتماع' },
]

export const ROLE_LABEL = { admin: 'إدارة', superuser: 'منسق', user: 'عضو' }
export const ROLE_BG    = { admin: 'rgba(139,92,246,0.15)', superuser: 'rgba(59,130,246,0.15)', user: 'rgba(16,185,129,0.12)' }
export const ROLE_COLOR = { admin: '#a78bfa', superuser: '#60a5fa', user: '#34d399' }

/* Helper: حساب الحالة الفعلية — "متأخر" تلقائي */
export function getEffectiveStatus(task) {
  if (task.status === 'completed' || task.done) return 'completed'
  if (task.dueDate && task.status !== 'completed') {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const due = new Date(task.dueDate); due.setHours(0, 0, 0, 0)
    if (due < today) return 'overdue'
  }
  return task.status || 'not_started'
}

/* Helper: إرجاع معلومات الحالة */
export function getStatusInfo(status) {
  return STATUS_OPTIONS.find(s => s.value === status) || STATUS_OPTIONS[0]
}

/* Helper: تحويل الحالات القديمة للجديدة */
export function migrateStatus(oldStatus, dueDate, done) {
  if (done || oldStatus === 'done' || oldStatus === 'completed') return 'completed'
  if (dueDate) {
    const due = new Date(dueDate)
    due.setHours(23, 59, 59, 999)
    if (due < new Date()) return 'overdue'
  }
  if (oldStatus === 'in_progress' || oldStatus === 'studying' ||
      oldStatus === 'executing' || oldStatus === 'review' ||
      oldStatus === 'waiting') return 'in_progress'
  return 'not_started'
}
