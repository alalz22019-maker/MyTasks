import { useState } from 'react'
import { TEAM_MEMBERS } from '../constants'
import { createPortal } from 'react-dom'
import { callClaude } from '../utils/claude'

const TEAM = TEAM_MEMBERS

const SYSTEM_PROMPT = `أنت محلل محاضر اجتماعات ذكي. مهمتك استخراج المهام والقرارات والتوصيات من نص محضر الاجتماع.

أعضاء الفريق المعروفين:
${TEAM.join(', ')}

لو ذكر اسم مختصر (حمادي، صفا، نورة، إلخ) طابقه مع الاسم الكامل من القائمة.

حلّل المحضر واستخرج كل مهمة/قرار/توصية. لكل واحدة حدد:
- title: عنوان واضح ومختصر
- person: المسؤول (من القائمة أعلاه إن أمكن)
- priority: urgent / high / medium / low
- dueDate: لو ذكر تاريخ (YYYY-MM-DD)، وإلا اتركه فاضي
- projectName: اسم المشروع لو واضح

أرجع JSON فقط بدون أي نص إضافي:
{"tasks": [{"title":"","person":"","priority":"medium","dueDate":"","projectName":""}]}

لو ما لقيت مهام: {"tasks": []}`

export default function MeetingMinutesParser({ apiKey, onAddTasks, onClose, showToast }) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState(null)
  const [selected, setSelected] = useState(new Set())

  async function parseMOM() {
    if (!text.trim()) return
    setLoading(true)
    setResults(null)
    try {
      const raw = await callClaude(apiKey, SYSTEM_PROMPT, text.trim())
      const clean = raw.replace(/```json/g, '').replace(/```/g, '').trim()
      const parsed = JSON.parse(clean)
      const tasks = parsed.tasks || []
      if (tasks.length === 0) {
        showToast?.('⚠️ لم أجد مهام في هذا المحضر')
      } else {
        setResults(tasks)
        setSelected(new Set(tasks.map((_, i) => i)))
      }
    } catch (e) {
      console.error('MOM parse error:', e)
      showToast?.('❌ خطأ في تحليل المحضر')
    } finally {
      setLoading(false)
    }
  }

  function toggleSelect(i) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  function toggleAll() {
    if (!results) return
    if (selected.size === results.length) setSelected(new Set())
    else setSelected(new Set(results.map((_, i) => i)))
  }

  function addSelected() {
    if (!results) return
    const tasksToAdd = results
      .filter((_, i) => selected.has(i))
      .map(t => ({
        title: t.title,
        person: t.person || '',
        priority: t.priority || 'medium',
        dueDate: t.dueDate || '',
        projectName: t.projectName || '',
        sourceType: 'minutes',
        sourceTitle: '',
        taskType: 'task',
        recurrence: '',
        reminderTime: '',
        closeNote: '',
      }))
    if (tasksToAdd.length === 0) {
      showToast?.('⚠️ اختر مهمة واحدة على الأقل')
      return
    }
    onAddTasks(tasksToAdd)
    showToast?.(`✅ تمت إضافة ${tasksToAdd.length} مهمة من المحضر`)
    onClose()
  }

  const PRIORITY_LABELS = { urgent: '🔴 عاجل', high: '🟠 مرتفع', medium: '🔵 متوسط', low: '🟢 منخفض' }

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'var(--bg)', display: 'flex', flexDirection: 'column',
      fontFamily: "'IBM Plex Sans Arabic', sans-serif", direction: 'rtl',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10,
        borderBottom: '1px solid var(--border)', background: 'var(--card)',
      }}>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: 'var(--text)',
          fontSize: 20, cursor: 'pointer', padding: 4,
        }}>✕</button>
        <div style={{ flex: 1, fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
          📋 محضر اجتماع → مهام
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {!results ? (
          <>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 10, lineHeight: 1.7 }}>
              الصق نص محضر الاجتماع — الذكاء الاصطناعي يستخرج المهام والقرارات تلقائياً
            </div>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="الصق محضر الاجتماع هنا..."
              style={{
                width: '100%', minHeight: 220, padding: 14, borderRadius: 12,
                border: '1px solid var(--border)', background: 'var(--bg3)',
                color: 'var(--text)', fontSize: 14, lineHeight: 1.8,
                fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box',
              }}
              dir="rtl"
              autoFocus
            />
            <button
              onClick={parseMOM}
              disabled={loading || !text.trim()}
              style={{
                width: '100%', marginTop: 12, padding: '13px 0', borderRadius: 12,
                border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer',
                fontFamily: 'inherit',
                background: loading || !text.trim()
                  ? 'var(--bg3)'
                  : 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                color: loading || !text.trim() ? 'var(--text3)' : '#fff',
              }}
            >
              {loading ? '⏳ جاري التحليل...' : '✨ استخراج المهام'}
            </button>
          </>
        ) : (
          <>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 12,
            }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                📋 المهام المستخرجة ({results.length})
              </div>
              <button onClick={toggleAll} style={{
                background: 'var(--bg3)', border: 'none', borderRadius: 8,
                padding: '5px 12px', fontSize: 12, color: 'var(--text2)',
                cursor: 'pointer', fontFamily: 'inherit',
              }}>
                {selected.size === results.length ? 'إلغاء الكل' : 'تحديد الكل'}
              </button>
            </div>

            {results.map((task, i) => (
              <div
                key={i}
                onClick={() => toggleSelect(i)}
                style={{
                  background: selected.has(i) ? 'rgba(59,130,246,0.08)' : 'var(--card)',
                  border: `1px solid ${selected.has(i) ? 'rgba(59,130,246,0.3)' : 'var(--border)'}`,
                  borderRadius: 12, padding: '12px 14px', marginBottom: 8,
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: 6, flexShrink: 0, marginTop: 1,
                    border: selected.has(i)
                      ? '2px solid #3b82f6'
                      : '2px solid var(--border)',
                    background: selected.has(i) ? '#3b82f6' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {selected.has(i) && <span style={{ color: '#fff', fontSize: 12 }}>✓</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', lineHeight: 1.6 }}>
                      {task.title}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                      {task.person && (
                        <span style={{
                          fontSize: 11, padding: '2px 8px', borderRadius: 6,
                          background: 'rgba(139,92,246,0.1)', color: '#8b5cf6',
                        }}>👤 {task.person}</span>
                      )}
                      <span style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 6,
                        background: 'rgba(59,130,246,0.1)', color: '#3b82f6',
                      }}>{PRIORITY_LABELS[task.priority] || '🔵 متوسط'}</span>
                      {task.dueDate && (
                        <span style={{
                          fontSize: 11, padding: '2px 8px', borderRadius: 6,
                          background: 'rgba(245,158,11,0.1)', color: '#f59e0b',
                        }}>📅 {task.dueDate}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* Back button to re-parse */}
            <button
              onClick={() => setResults(null)}
              style={{
                width: '100%', marginTop: 8, padding: '10px 0', borderRadius: 10,
                border: '1px solid var(--border)', background: 'var(--bg3)',
                color: 'var(--text2)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >↩ تعديل المحضر</button>
          </>
        )}
      </div>

      {/* Footer - Add button */}
      {results && results.length > 0 && (
        <div style={{
          padding: '12px 16px', borderTop: '1px solid var(--border)',
          background: 'var(--card)',
        }}>
          <button
            onClick={addSelected}
            disabled={selected.size === 0}
            style={{
              width: '100%', padding: '13px 0', borderRadius: 12,
              border: 'none', fontSize: 15, fontWeight: 700,
              cursor: selected.size === 0 ? 'default' : 'pointer',
              fontFamily: 'inherit',
              background: selected.size === 0
                ? 'var(--bg3)'
                : 'linear-gradient(135deg, #10b981, #059669)',
              color: selected.size === 0 ? 'var(--text3)' : '#fff',
            }}
          >
            ✅ إضافة {selected.size} مهمة
          </button>
        </div>
      )}
    </div>,
    document.body
  )
}
