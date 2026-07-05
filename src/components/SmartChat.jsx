import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { callClaudeChat, buildSmartChatSystem } from '../utils/claude'
import { TEAM_MEMBERS as TEAM, PROJECT_FILES, SOURCE_TYPES } from '../constants'

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

const PRIORITY_LABELS = { urgent: '🔴 عاجل', medium: '🟡 متوسط', low: '🟢 منخفض' }

export default function SmartChat({ tasks, onAddTasks, onClose, apiKey, initialText, userName }) {
  const [messages, setMessages]         = useState([])
  const [input, setInput]               = useState('')
  const [loading, setLoading]           = useState(false)
  const [pendingTasks, setPendingTasks] = useState([])
  const [skipped, setSkipped]           = useState(new Set())
  const historyRef = useRef([])
  const scrollRef  = useRef(null)
  const inputRef   = useRef(null)
  const initialTextRef = useRef(initialText || '')

  const activeTasks = tasks.filter(t => !t.done)

  useEffect(() => {
    if (scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, loading])

  // Auto-send voice text
  useEffect(() => {
    const txt = initialTextRef.current
    if (txt && txt.trim()) {
      const timer = setTimeout(() => {
        sendMessage(txt.trim())
      }, 400)
      return () => clearTimeout(timer)
    }
  }, []) // eslint-disable-line

  async function sendMessage(text) { return send(text) }

  async function send(text) {
    if (!text.trim() || loading) return

    const userMsg = { role: 'user', content: text }
    historyRef.current = [...historyRef.current, userMsg]
    setMessages(prev => [...prev, { role: 'user', text }])
    setInput('')
    setLoading(true)

    try {
      const system = buildSmartChatSystem(activeTasks, userName)
      const raw    = await callClaudeChat(apiKey, system, historyRef.current)
      
      // Try to extract JSON block from response (may be mixed with text)
      let message = raw
      let tasks = []
      
      // Look for ```json ... ``` block
      const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/)
      if (jsonMatch) {
        try {
          const jsonData = JSON.parse(jsonMatch[1].trim())
          tasks = jsonData.tasks || []
          // Remove JSON block from message
          message = raw.replace(/```json[\s\S]*?```/, '').trim()
        } catch {}
      } else {
        // Try parsing entire response as JSON (legacy format)
        try {
          const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
          const parsed = JSON.parse(clean)
          message = parsed.message || ''
          tasks = parsed.tasks || []
        } catch {
          // It's just plain text — that's fine
          message = raw
        }
      }

      const parsed = { message, tasks }
      historyRef.current = [...historyRef.current, { role: 'assistant', content: raw }]
      setMessages(prev => [...prev, { role: 'assistant', text: message || '...', parsed }])

      // Add new tasks to pending
      if (tasks.length > 0) {
        setPendingTasks(prev => {
          const map = Object.fromEntries(prev.map(t => [t.id, t]))
          tasks.forEach(nt => {
            map[nt.id || `t${Date.now()}_${Math.random().toString(36).slice(2,5)}`] = nt
          })
          return Object.values(map)
        })
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', text: '❌ ' + e.message }])
    } finally {
      setLoading(false)
    }
  }

  function toggleSkip(id) {
    setSkipped(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function resolveDuplicate(taskId, option) {
    if (option === 'تجاهل') {
      setSkipped(prev => new Set([...prev, taskId]))
    } else {
      setSkipped(prev => { const s = new Set(prev); s.delete(taskId); return s })
    }
    const task = pendingTasks.find(t => t.id === taskId)
    if (task && option !== 'تجاهل') {
      send(`بخصوص مهمة "${task.title}": اخترت "${option}"`)
    }
  }

  function handleAddTasks() {
    const toAdd = pendingTasks
      .filter(t => !skipped.has(t.id))
      .map(t => ({
        id: genId(),
        title: t.title,
        priority: t.priority   || 'medium',
        category: t.category   || 'work',
        subcategory: t.subcategory || 'other',
        person:      t.person      || '',
        dueDate:     t.dueDate     || '',
        projectName: t.projectName || '',
        sourceType:  t.sourceType  || 'directive',
        sourceTitle: t.sourceTitle || 'مساعد My Day',
        recurrence:  '',
        reminderTime: '',
        done: false,
        createdAt: Date.now(),
      }))
    onAddTasks(toAdd)
    onClose()
  }

  const confirmedCount = pendingTasks.filter(t => !skipped.has(t.id)).length

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'var(--bg)',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'var(--font)',
    }}>

      {/* ── Header ── */}
      <div style={{
        padding: '16px 16px 12px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>💬 مساعد مهامي</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
            اسأل أي شي أو أضف مهام
          </div>
        </div>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: 'var(--text2)',
          fontSize: 22, cursor: 'pointer', padding: 4, lineHeight: 1,
        }}>✕</button>
      </div>

      {/* ── Messages ── */}
      <div ref={scrollRef} style={{
        flex: 1, overflowY: 'auto', padding: '16px',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>

        {messages.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text2)' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>💬</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
              مساعدك الذكي
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.8 }}>
              اكتب أي شي تحتاجه:<br/>
              • "أضف مهمة على حمادي بخصوص راصد"<br/>
              • "كم مهمة عاجلة عندي؟"<br/>
              • "ساعدني أصيغ مهمة عن التقرير الدوري"<br/>
              • أو الصق محضر اجتماع
            </div>
          </div>
        )}

        {messages.map((msg, i) => {
          const parsed = msg.parsed
          // آخر قائمة مهام تصدر من Claude نعرضها تحت رسالته
          const isLatestAssistant =
            msg.role === 'assistant' &&
            parsed?.tasks?.length > 0 &&
            messages.slice(i + 1).every(m => !m.parsed?.tasks?.length)

          return (
            <div key={i}>
              {/* فقاعة الرسالة */}
              <div style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '85%',
                  padding: '10px 14px',
                  borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  background: msg.role === 'user' ? 'var(--purple)' : 'var(--card)',
                  color: msg.role === 'user' ? '#fff' : 'var(--text)',
                  fontSize: 14, direction: 'rtl', lineHeight: 1.6,
                }}>
                  {msg.text}
                </div>
              </div>

              {/* بطاقات المهام المقترحة */}
              {isLatestAssistant && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {pendingTasks.map(t => {
                    const isOff = skipped.has(t.id)
                    return (
                      <div key={t.id} style={{
                        background: isOff ? 'rgba(255,255,255,0.03)' : 'var(--card)',
                        border: `1px solid ${isOff ? 'var(--border)' : 'rgba(59,130,246,0.3)'}`,
                        borderRadius: 12, padding: '10px 12px',
                        opacity: isOff ? 0.45 : 1,
                        transition: 'opacity .2s',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                          <div style={{ flex: 1 }}>
                            {/* العنوان — قابل للتعديل */}
                            <input value={t.title} onChange={e => {
                              setPendingTasks(prev => prev.map(p => p.id === t.id ? { ...p, title: e.target.value } : p))
                            }} style={{
                              width: '100%', fontSize: 13, fontWeight: 600, color: 'var(--text)',
                              background: 'transparent', border: 'none', borderBottom: isOff ? 'none' : '1px solid var(--border)',
                              padding: '2px 0', fontFamily: 'inherit', textDecoration: isOff ? 'line-through' : 'none',
                              boxSizing: 'border-box',
                            }} disabled={isOff} />
                            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                              {/* الأولوية — قابلة للتعديل */}
                              <select value={t.priority || 'medium'} onChange={e => {
                                setPendingTasks(prev => prev.map(p => p.id === t.id ? { ...p, priority: e.target.value } : p))
                              }} disabled={isOff} style={{
                                fontSize: 11, padding: '2px 4px', borderRadius: 6,
                                border: '1px solid var(--border)', background: 'var(--bg)',
                                color: 'var(--text)', fontFamily: 'inherit',
                              }}>
                                <option value="urgent">🔴 عاجل</option>
                                <option value="medium">🟡 متوسط</option>
                                <option value="low">🟢 منخفض</option>
                              </select>
                              {/* المسؤول — قابل للتعديل */}
                              <select value={t.person || ''} onChange={e => {
                                setPendingTasks(prev => prev.map(p => p.id === t.id ? { ...p, person: e.target.value } : p))
                              }} disabled={isOff} style={{
                                fontSize: 11, padding: '2px 4px', borderRadius: 6,
                                border: '1px solid var(--border)', background: 'var(--bg)',
                                color: 'var(--text)', fontFamily: 'inherit',
                              }}>
                                <option value="">👤 اختر</option>
                                {TEAM.map(m => <option key={m} value={m}>{m}</option>)}
                              </select>
                              {/* التاريخ — قابل للتعديل */}
                              <input type="date" value={t.dueDate || ''} onChange={e => {
                                setPendingTasks(prev => prev.map(p => p.id === t.id ? { ...p, dueDate: e.target.value } : p))
                              }} disabled={isOff} style={{
                                fontSize: 11, padding: '2px 4px', borderRadius: 6,
                                border: '1px solid var(--border)', background: 'var(--bg)',
                                color: 'var(--text)', fontFamily: 'inherit',
                              }} />
                              {/* الملف — قابل للتعديل */}
                              <select value={t.projectName || ''} onChange={e => {
                                setPendingTasks(prev => prev.map(p => p.id === t.id ? { ...p, projectName: e.target.value } : p))
                              }} disabled={isOff} style={{
                                fontSize: 11, padding: '2px 4px', borderRadius: 6,
                                border: '1px solid var(--border)', background: 'var(--bg)',
                                color: 'var(--text)', fontFamily: 'inherit', maxWidth: 130,
                              }}>
                                <option value="">📁 الملف</option>
                                {PROJECT_FILES.map(f => <option key={f} value={f}>{f}</option>)}
                              </select>
                              {/* المصدر — قابل للتعديل */}
                              <select value={t.sourceType || 'directive'} onChange={e => {
                                setPendingTasks(prev => prev.map(p => p.id === t.id ? { ...p, sourceType: e.target.value } : p))
                              }} disabled={isOff} style={{
                                fontSize: 11, padding: '2px 4px', borderRadius: 6,
                                border: '1px solid var(--border)', background: 'var(--bg)',
                                color: 'var(--text)', fontFamily: 'inherit', maxWidth: 110,
                              }}>
                                {SOURCE_TYPES.filter(st => st.value).map(st => <option key={st.value} value={st.value}>📌 {st.label}</option>)}
                              </select>
                            </div>
                          </div>
                          <button onClick={() => toggleSkip(t.id)} style={{
                            width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                            border: `2px solid ${isOff ? 'var(--border)' : 'var(--green)'}`,
                            background: isOff ? 'none' : 'rgba(16,185,129,0.15)',
                            color: isOff ? 'var(--text2)' : 'var(--green)',
                            fontSize: 13, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {isOff ? '○' : '✓'}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{
              padding: '10px 16px', background: 'var(--card)',
              borderRadius: 16, color: 'var(--text2)', fontSize: 13,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span className="spinner" />
              جاري التحليل...
            </div>
          </div>
        )}
      </div>

      {/* ── زر الإضافة ── */}
      {confirmedCount > 0 && (
        <div style={{ padding: '8px 16px', flexShrink: 0 }}>
          <button onClick={handleAddTasks} style={{
            width: '100%', padding: '13px',
            background: 'linear-gradient(135deg, #006B3F, #28A265)',
            color: '#fff', border: 'none', borderRadius: 14,
            fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          }}>
            ✅ إضافة {confirmedCount} مهمة
          </button>
        </div>
      )}

      {/* ── حقل الإدخال ── */}
      <div style={{
        padding: '8px 16px 24px',
        borderTop: '1px solid var(--border)',
        display: 'flex', gap: 8, flexShrink: 0,
      }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
          placeholder="اكتب سؤال أو طلب أو الصق محضر..."
          rows={2}
          style={{
            flex: 1, padding: '10px 12px',
            background: 'var(--card)', color: 'var(--text)',
            border: '1px solid var(--border)', borderRadius: 12,
            fontSize: 14, fontFamily: 'inherit', direction: 'rtl',
            resize: 'none', outline: 'none', lineHeight: 1.5,
          }}
        />
        <button
          onClick={() => send(input)}
          disabled={!input.trim() || loading}
          style={{
            width: 44, height: 44, borderRadius: 12, flexShrink: 0, alignSelf: 'flex-end',
            background: input.trim() && !loading ? 'var(--purple)' : 'var(--card)',
            border: '1px solid var(--border)',
            color: input.trim() && !loading ? '#fff' : 'var(--text2)',
            fontSize: 20, cursor: input.trim() && !loading ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >↑</button>
      </div>
    </div>,
    document.body
  )
}
