import { useState } from 'react'
import { getEffectiveStatus, getStatusInfo, STATUS_OPTIONS } from '../constants'

const PRIORITY_LABELS = { urgent: 'عاجل', medium: 'متوسطة', low: 'منخفضة' }
const RECURRENCE_LABELS = { daily: 'يومي', weekly: 'أسبوعي', biweekly: 'كل أسبوعين', monthly: 'شهري', quarterly: 'ربع سنوي' }
const TASK_TYPE_ICONS = { task: '', report: '📋', meeting: '🗓' }

function formatDate(d) {
  if (!d) return null
  const parts = d.split('-')
  if (parts.length !== 3) return d
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}

export default function TaskCard({
  task, onToggle, onEdit, onDelete, showToast, onAddSubtask, onRequestUpdate,
  onTransfer, onAddProgress,
  childCount = 0, isCollapsed, onToggleCollapse,
  isSubtask = false, childProgress
}) {
  const [actionsOpen, setActionsOpen] = useState(false)
  const [updateBox, setUpdateBox] = useState(false)
  const [updateText, setUpdateText] = useState('')
  const isParent = childCount > 0
  const effectiveStatus = getEffectiveStatus(task)
  const statusInfo = getStatusInfo(effectiveStatus)

  function shareWhatsApp() {
    const msg = encodeURIComponent(
      `📋 *${task.title}*\n` +
      (task.person ? `👤 ${task.person}\n` : '') +
      (task.dueDate ? `📅 ${formatDate(task.dueDate)}\n` : '') +
      `🔖 ${PRIORITY_LABELS[task.priority] || ''}`
    )
    window.open(`https://wa.me/?text=${msg}`, '_blank')
  }

  function openCalendar() {
    const title = encodeURIComponent(task.title)
    const details = encodeURIComponent(task.person ? `المسؤول: ${task.person}` : '')
    let dates = ''
    if (task.dueDate) {
      const d = task.dueDate.replace(/-/g, '')
      dates = `&dates=${d}/${d}`
    }
    const recur = task.recurrence === 'daily' ? '&recur=RRULE:FREQ=DAILY'
      : task.recurrence === 'weekly' ? '&recur=RRULE:FREQ=WEEKLY'
      : task.recurrence === 'monthly' ? '&recur=RRULE:FREQ=MONTHLY'
      : ''
    window.open(
      `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}${dates}${recur}`,
      '_blank'
    )
  }

  return (
    <div className={`task-card priority-${task.priority || 'medium'}${task.done ? ' done' : ''}${isParent ? ' parent-task' : ''}${isSubtask ? ' subtask-card' : ''}`}>
      <div className="task-top">
        <button
          className={`task-check${task.done ? ' done' : ''}`}
          onClick={() => onToggle(task.id)}
          aria-label="إتمام المهمة"
        >
          {task.done && <span style={{ color: '#fff', fontSize: 12 }}>✓</span>}
        </button>

        <div className="task-body" onClick={() => setActionsOpen(e => !e)} style={{ cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <div className={`task-title${task.done ? ' done' : ''}`}>{task.title}</div>
            {isParent && (
              <button
                className="collapse-toggle"
                onClick={e => { e.stopPropagation(); onToggleCollapse() }}
                aria-label={isCollapsed ? 'فتح' : 'طي'}
              >
                <span style={{ fontSize: 11, marginLeft: 3 }}>{childCount}</span>
                <span style={{ fontSize: 13, transition: 'transform 0.2s', display: 'inline-block', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▾</span>
              </button>
            )}
          </div>

          {/* Progress bar for parent tasks with children */}
          {isParent && childProgress !== undefined && (
            <div style={{ marginTop: 4, marginBottom: 2 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                <span style={{ fontSize: 10, color: 'var(--text3)' }}>تقدم الفرعيات</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: childProgress === 100 ? 'var(--green)' : 'var(--blue)' }}>{childProgress}%</span>
              </div>
              <div style={{ height: 4, borderRadius: 2, background: 'var(--bg3)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 2, width: `${childProgress}%`,
                  background: childProgress === 100 ? 'var(--green)' : 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
                  transition: 'width 0.3s',
                }} />
              </div>
            </div>
          )}

          <div className="task-meta">
            {/* Status badge */}
            {effectiveStatus && effectiveStatus !== 'not_started' && (
              <span className="badge" style={{
                background: `${statusInfo.color}20`, color: statusInfo.color,
                border: `1px solid ${statusInfo.color}40`,
              }}>
                {statusInfo.label}
              </span>
            )}
            {task.taskType && task.taskType !== 'task' && (
              <span className="badge badge-date" style={{ background: task.taskType === 'report' ? 'rgba(99,102,241,0.15)' : 'rgba(245,158,11,0.15)', color: task.taskType === 'report' ? '#818cf8' : '#fbbf24' }}>
                {TASK_TYPE_ICONS[task.taskType]} {task.taskType === 'report' ? 'تقرير' : 'اجتماع'}
              </span>
            )}
            <span className={`badge badge-${task.priority}`}>
              {PRIORITY_LABELS[task.priority]}
            </span>
            {task.dueDate && (
              <span className="badge badge-date">📅 {formatDate(task.dueDate)}</span>
            )}
            {task.person && (
              <span className="badge badge-person">👤 {task.person}</span>
            )}
            {task.recurrence && (
              <span className="badge badge-recur">🔄 {RECURRENCE_LABELS[task.recurrence]}</span>
            )}
            {task.projectName && (
              <span className="badge badge-project">📁 {task.projectName}</span>
            )}
          </div>
          {Array.isArray(task.updates) && task.updates.length > 0 && (
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text2)', background: 'var(--bg2)', borderRadius: 8, padding: '6px 8px', border: '1px solid var(--border)' }}>
              📝 آخر تحديث: {task.updates[task.updates.length - 1].text}
              <span style={{ color: 'var(--text3)' }}> — {task.updates[task.updates.length - 1].by}{task.updates.length > 1 ? ` (+${task.updates.length - 1} سابقة)` : ''}</span>
            </div>
          )}
        </div>
      </div>

      {actionsOpen && updateBox && (
        <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', gap: 6 }}>
          <input
            value={updateText}
            onChange={e => setUpdateText(e.target.value)}
            placeholder="اكتب التحديث..."
            style={{ flex: 1, background: 'var(--bg2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit' }}
          />
          <button
            onClick={() => {
              if (!updateText.trim()) return
              onAddProgress && onAddProgress(task, updateText.trim())
              setUpdateText(''); setUpdateBox(false)
            }}
            style={{ background: 'linear-gradient(135deg, #f59e0b, #f43f5e)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
          >حفظ</button>
        </div>
      )}
      {actionsOpen && (
        <div className="task-actions">
          {onAddProgress && !task.done && (
            <button className="task-action-btn" onClick={() => setUpdateBox(v => !v)} style={{ color: '#10b981' }}>
              <span>📝</span> إضافة تحديث
            </button>
          )}
          <button className="task-action-btn whatsapp" onClick={shareWhatsApp}>
            <span>💬</span> واتساب
          </button>
          <button className="task-action-btn calendar" onClick={openCalendar}>
            <span>📅</span> تقويم
          </button>
          <button className="task-action-btn edit" onClick={() => onEdit(task)}>
            <span>✏️</span> تعديل
          </button>
          {onAddSubtask && (
            <button className="task-action-btn" onClick={() => { setActionsOpen(false); onAddSubtask(task) }} style={{ color: 'var(--blue)' }}>
              <span>🔀</span> تفريع
            </button>
          )}
          {onRequestUpdate && task.person && !task.done && (
            <button className="task-action-btn" onClick={() => { setActionsOpen(false); onRequestUpdate(task) }} style={{ color: '#8b5cf6' }}>
              <span>📩</span> اطلب تحديث
            </button>
          )}
          {onTransfer && !task.done && (
            <button className="task-action-btn" onClick={() => { setActionsOpen(false); onTransfer(task) }} style={{ color: '#f59e0b' }}>
              <span>🔀</span> تحويل
            </button>
          )}
          {onDelete && (
            <button className="task-action-btn delete" onClick={() => onDelete(task.id)}>
              <span>🗑</span> حذف
            </button>
          )}
        </div>
      )}

      {/* لوق التحديثات */}
      {actionsOpen && task.updates && task.updates.length > 0 && (
        <div style={{
          margin: '0 12px 8px', padding: '8px 10px', borderRadius: 10,
          background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.12)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 6 }}>📝 سجل التحديثات</div>
          {task.updates.slice(-5).reverse().map((u, i) => (
            <div key={i} style={{
              fontSize: 11, color: 'var(--text2)', marginBottom: 4, paddingBottom: 4,
              borderBottom: i < Math.min(task.updates.length, 5) - 1 ? '1px solid var(--border)' : 'none',
              lineHeight: 1.5,
            }}>
              <span style={{ fontWeight: 600, color: 'var(--text)' }}>{u.from}</span>
              <span style={{ fontSize: 10, color: 'var(--text3)', marginRight: 6 }}>
                {u.timestamp ? new Date(u.timestamp).toLocaleDateString('ar-SA') : ''}
              </span>
              <div style={{ marginTop: 2 }}>{u.message}</div>
            </div>
          ))}
        </div>
      )}

      {/* Activity Log — سجل الإجراءات */}
      {actionsOpen && task.activityLog && task.activityLog.length > 0 && (
        <div style={{
          margin: '0 12px 8px', padding: '8px 10px', borderRadius: 10,
          background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.12)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 6 }}>📋 سجل الإجراءات</div>
          {task.activityLog.slice(-10).reverse().map((log, i) => {
            const actionLabels = {
              created: '🆕 أنشأ المهمة',
              status_change: '🔄 غيّر الحالة',
              title_edit: '✏️ عدّل العنوان',
              date_edit: '📅 عدّل التاريخ',
              person_edit: '👤 غيّر المسؤول',
              note_added: '💬 أضاف ملاحظة',
              approved: '✅ وافق',
              rejected: '🚫 رفض',
              transferred: '🔀 حوّل المهمة',
              subtask_assigned: '📌 أسند فرعية',
            }
            let detail = ''
            if (log.action === 'status_change') {
              const fromLabel = STATUS_OPTIONS.find(s => s.value === log.from)?.label || log.from
              const toLabel = STATUS_OPTIONS.find(s => s.value === log.to)?.label || log.to
              detail = `من "${fromLabel}" إلى "${toLabel}"`
            } else if (log.from && log.to) {
              detail = `من "${log.from}" إلى "${log.to}"`
            }
            return (
              <div key={i} style={{
                fontSize: 11, color: 'var(--text2)', marginBottom: 4, paddingBottom: 4,
                borderBottom: i < Math.min(task.activityLog.length, 10) - 1 ? '1px solid var(--border)' : 'none',
                lineHeight: 1.5,
              }}>
                <span style={{ fontWeight: 600, color: 'var(--text)' }}>{log.by}</span>
                <span style={{ fontSize: 10, color: 'var(--text3)', marginRight: 6 }}>
                  {log.at ? new Date(log.at).toLocaleDateString('ar-SA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                </span>
                <div style={{ marginTop: 2 }}>{actionLabels[log.action] || log.action} {detail}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
