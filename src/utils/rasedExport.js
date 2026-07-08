import { COVERAGE_MAP } from '../constants'

/**
 * 📊 تصدير راصد — يفتح القالب المحكوم المضمّن (rased-template.xlsx) كأرشيف
 * ويستبدل قيم الخلايا فقط في ورقة Tasks Tracker (الصفوف 5–299):
 * - الأعمدة B..G و I..N تُكتب من مهام MyDay
 * - العمود H (Status) لا يُلمس أبداً — صيغته تحسبه
 * - العمود A (التسلسل) موجود مسبقاً في القالب
 * كل الأوراق الأخرى والصيغ والتنسيقات تبقى مطابقة بالبايت.
 */

const SHEET_PATH = 'xl/worksheets/sheet3.xml' // Tasks Tracker (من خريطة workbook.xml.rels)
const FIRST_ROW = 5
const LAST_ROW = 299

const SOURCE_LABEL = { minutes: 'محضر', directive: 'توجيه مباشر', email: 'إيميل', routine: 'مهمة روتينية' }
const PRIORITY_LABEL = { urgent: 'High', medium: 'Medium', low: 'Low' }

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function excelSerial(dateStr) {
  const d = dateStr instanceof Date ? dateStr : new Date(dateStr)
  if (isNaN(d)) return null
  return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 86400000)
}

function taskToCells(t) {
  /* نسبة الإنجاز من الحالة: 0 / 0.5 / 1 */
  let completion = 0
  if (t.done || t.status === 'completed' || t.status === 'done') completion = 1
  else if (t.status === 'in_progress') completion = 0.5

  let start = null
  try {
    start = t.startDate ? excelSerial(t.startDate)
      : (t.createdAt?.toDate ? excelSerial(t.createdAt.toDate()) : (t.createdAt ? excelSerial(t.createdAt) : null))
  } catch { start = null }

  const lastUpdate = Array.isArray(t.updates) && t.updates.length > 0
    ? `${t.updates[t.updates.length - 1].text} — ${t.updates[t.updates.length - 1].by || ''}`
    : (t.closeNote || '')

  return {
    B: SOURCE_LABEL[t.sourceType] || (t.sourceType || ''),
    C: t.title || '',
    D: '', // Department — فاضي مؤقتاً بقرار علي
    E: start,
    F: t.dueDate ? excelSerial(t.dueDate) : null,
    G: completion,
    I: PRIORITY_LABEL[t.priority] || 'Medium',
    J: t.person || '',
    K: t.secondaryOwner || COVERAGE_MAP[(t.person || '').trim()] || '',
    L: 'Yes',
    M: '',
    N: lastUpdate,
  }
}

/* استبدال خلية داخل نص صف XML مع الحفاظ على فهرس التنسيق (s) الموجود */
function setCell(rowXml, col, rowNum, value, isText) {
  const re = new RegExp(`<c r="${col}${rowNum}"([^>]*?)(?:/>|>[\\s\\S]*?</c>)`)
  const m = rowXml.match(re)
  const attrs = m ? m[1] : ''
  const sMatch = attrs.match(/s="(\d+)"/)
  const s = sMatch ? ` s="${sMatch[1]}"` : ''
  let cell
  if (value === null || value === undefined || value === '') {
    cell = `<c r="${col}${rowNum}"${s}/>`
  } else if (isText) {
    cell = `<c r="${col}${rowNum}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`
  } else {
    cell = `<c r="${col}${rowNum}"${s}><v>${value}</v></c>`
  }
  if (m) return rowXml.replace(re, cell)
  /* الخلية غير موجودة في الصف — نحقنها قبل خلية H أو نهاية الصف */
  const anchor = new RegExp(`<c r="H${rowNum}"`)
  if (anchor.test(rowXml)) return rowXml.replace(anchor, `${cell}<c r="H${rowNum}"`)
  return rowXml.replace('</row>', `${cell}</row>`)
}

export async function exportRased(tasks) {
  const { default: JSZip } = await import('jszip')
  const res = await fetch('/rased-template.xlsx')
  if (!res.ok) throw new Error('تعذّر تحميل قالب راصد المضمّن')
  const zip = await JSZip.loadAsync(await res.arrayBuffer())
  let xml = await zip.file(SHEET_PATH).async('string')

  /* المهام الرئيسية فقط (بدون الفرعيات) */
  const rows = tasks.filter(t => !t.parentId).map(taskToCells)
  if (rows.length > LAST_ROW - FIRST_ROW + 1) {
    throw new Error(`عدد المهام (${rows.length}) يتجاوز سعة القالب`)
  }

  for (let r = FIRST_ROW; r <= LAST_ROW; r++) {
    const rowRe = new RegExp(`<row r="${r}"[ >][\\s\\S]*?</row>`)
    const rowMatch = xml.match(rowRe)
    if (!rowMatch) continue
    let rowXml = rowMatch[0]
    const data = rows[r - FIRST_ROW] || null

    rowXml = setCell(rowXml, 'B', r, data ? data.B : '', true)
    rowXml = setCell(rowXml, 'C', r, data ? data.C : '', true)
    rowXml = setCell(rowXml, 'D', r, data ? data.D : '', true)
    rowXml = setCell(rowXml, 'E', r, data ? data.E : null, false)
    rowXml = setCell(rowXml, 'F', r, data ? data.F : null, false)
    rowXml = setCell(rowXml, 'G', r, data ? data.G : null, false)
    rowXml = setCell(rowXml, 'I', r, data ? data.I : '', true)
    rowXml = setCell(rowXml, 'J', r, data ? data.J : '', true)
    rowXml = setCell(rowXml, 'K', r, data ? data.K : '', true)
    rowXml = setCell(rowXml, 'L', r, data ? data.L : '', true)
    rowXml = setCell(rowXml, 'M', r, data ? data.M : '', true)
    rowXml = setCell(rowXml, 'N', r, data ? data.N : '', true)

    xml = xml.replace(rowRe, rowXml)
    if (!data && r > FIRST_ROW + rows.length + 20) break /* ما بعد البيانات القديمة المحتملة — توقف */
  }

  zip.file(SHEET_PATH, xml)
  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    compression: 'DEFLATE',
  })

  const today = new Date().toISOString().slice(0, 10)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `RASED_Feed_${today}.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  return { exported: rows.length }
}
