import { afterEach, describe, expect, it, vi } from 'vitest'
import { initRentApp } from '../../src/lib/app'
import type { QuestionAnnotationsDocument } from '../../src/lib/question-annotations'
import type { Question } from '../../src/lib/questions'
import { questionBankSignature } from '../../src/lib/session'

const testStorage = new Map<string, string>()
const storage: Storage = {
  get length() { return testStorage.size },
  clear: () => testStorage.clear(),
  getItem: (key) => testStorage.get(key) ?? null,
  key: (index) => [...testStorage.keys()][index] ?? null,
  removeItem: (key) => { testStorage.delete(key) },
  setItem: (key, value) => { testStorage.set(key, String(value)) },
}
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true })

const question = (chapter = 1, questionNo = 1): Question => ({
  chapter_no: chapter, chapter_code: `第${chapter}章`, chapter_title: `章節${chapter}`,
  section_no: 1, section_code: '一', section_title: '總則', question_no: questionNo,
  question: `第 ${chapter}-${questionNo} 題？`, options: [
    { id: 'A', text: '正確' },
    { id: 'B', text: '錯誤' },
    { id: 'C', text: '選項丙' },
    { id: 'D', text: '選項丁' },
  ],
  answer: 'A', law_reference: `法源 ${chapter}-${questionNo}`,
})

const oneQuestion = [question()]
const examQuestions = Array.from({ length: 10 }, (_, chapter) =>
  Array.from({ length: 10 }, (_, index) => question(chapter + 1, index + 1)),
).flat()

function mount(
  questions: Question[] = oneQuestion,
  initialView: 'practice' | 'chapter' | 'mock' | 'wrong' = 'practice',
  annotations?: QuestionAnnotationsDocument,
) {
  document.body.innerHTML = '<main id="app"></main>'
  initRentApp(document.querySelector<HTMLElement>('#app')!, questions, { initialView, bankKey: 'withLaw', annotations })
}

function clickOptionByText(text: string): void {
  const option = [...document.querySelectorAll<HTMLButtonElement>('[data-option]')]
    .find((button) => button.textContent?.includes(text))
  if (!option) throw new Error(`Option not found: ${text}`)
  option.click()
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
  localStorage.clear()
})

describe('租賃題庫操作介面', () => {
  it('Header 顯示證照題庫標題，漢堡按鈕可切換導覽與可及性狀態', () => {
    mount()
    const menu = document.querySelector<HTMLButtonElement>('[data-mobile-menu-toggle]')!
    const navigation = document.querySelector<HTMLElement>('#primary-nav')!
    expect(document.querySelector('.brand-home')!.textContent).toContain('租賃住宅管理人員證照題庫練習')
    expect(menu.querySelectorAll('.hamburger-line')).toHaveLength(3)
    expect(menu.getAttribute('aria-label')).toBe('開啟選單')
    expect(menu.textContent?.trim()).toBe('')
    expect(menu.getAttribute('aria-expanded')).toBe('false')
    expect(navigation.classList.contains('is-open')).toBe(false)

    menu.click()
    expect(menu.getAttribute('aria-label')).toBe('關閉選單')
    expect(menu.getAttribute('aria-expanded')).toBe('true')
    expect(navigation.classList.contains('is-open')).toBe(true)

    menu.click()
    expect(menu.getAttribute('aria-label')).toBe('開啟選單')
    expect(menu.getAttribute('aria-expanded')).toBe('false')
    expect(navigation.classList.contains('is-open')).toBe(false)
  })

  it('選擇答案不重建題目 DOM，避免手機捲動位置跳動', () => {
    mount()
    const questionCard = document.querySelector('[data-question-key]')
    expect(document.querySelector('[data-option="B"]')!.getAttribute('aria-pressed')).toBe('false')
    document.querySelector<HTMLButtonElement>('[data-option="B"]')!.click()

    expect(document.querySelector('[data-question-key]')).toBe(questionCard)
    expect(document.querySelector<HTMLButtonElement>('[data-action="check-practice"]')!.disabled).toBe(false)
    expect(document.querySelector('[data-option="B"]')!.classList.contains('is-selected')).toBe(true)
    expect(document.querySelector('[data-option="A"]')!.getAttribute('aria-pressed')).toBe('false')
    expect(document.querySelector('[data-option="B"]')!.getAttribute('aria-pressed')).toBe('true')
  })

  it('練習模式標示可忽略題，錯字題只在顯示時插入括號修正', () => {
    const ignored = question(2, 5)
    const typo = { ...question(2, 17), question: '除言明租金外，並為約定租金應如何支付。' }
    const annotations: QuestionAnnotationsDocument = {
      schema_version: 1,
      updated_at: '2026-07-23',
      annotations: [
        { question_key: 'c2-s1-q5', type: 'ignore', message: '依實際課程資訊，此題可忽略；模擬考不會抽到此題。' },
        {
          question_key: 'c2-s1-q17',
          type: 'typo',
          message: '題目原文疑有錯字，考試仍可能沿用原文；括號內「未」為補充字詞。',
          question_replacement: { from: '並為約定', to: '並為（未）約定' },
        },
      ],
    }

    mount([ignored], 'practice', annotations)
    expect(document.querySelector('[data-annotation-type="ignore"]')?.textContent).toContain('此題可忽略')
    expect(document.querySelector('h1')?.textContent).toBe(ignored.question)

    localStorage.clear()
    mount([typo], 'chapter', annotations)
    const chapter = document.querySelector<HTMLSelectElement>('[data-action="chapter-select"]')!
    chapter.value = '2'
    chapter.dispatchEvent(new Event('change', { bubbles: true }))
    expect(document.querySelector('h1')?.textContent).toContain('並為（未）約定')
    expect(document.querySelector('[data-annotation-type="typo"]')?.textContent).toContain('考試仍可能沿用原文')
    expect(typo.question).toContain('並為約定')
  })

  it('題目設定可收合與展開，檢查答案後自動收合並保留摘要', () => {
    mount()
    let toggle = document.querySelector<HTMLButtonElement>('[data-action="toggle-settings"]')!
    let settings = document.querySelector<HTMLElement>('#practice-settings')!
    expect(toggle.tagName).toBe('BUTTON')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(toggle.getAttribute('aria-controls')).toBe('practice-settings')
    expect(toggle.getAttribute('aria-label')).toBe('展開練習設定')
    expect(settings.hidden).toBe(true)
    expect(document.querySelector('.settings-summary')!.textContent).toContain('全題庫・隨機出題')

    toggle.click()
    toggle = document.querySelector<HTMLButtonElement>('[data-action="toggle-settings"]')!
    settings = document.querySelector<HTMLElement>('#practice-settings')!
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(toggle.getAttribute('aria-label')).toBe('收合練習設定')
    expect(settings.hidden).toBe(false)

    document.querySelector<HTMLButtonElement>('[data-option="B"]')!.click()
    document.querySelector<HTMLButtonElement>('[data-action="check-practice"]')!.click()
    expect(document.querySelector<HTMLButtonElement>('[data-action="toggle-settings"]')!.getAttribute('aria-expanded')).toBe('false')
    expect(document.querySelector<HTMLElement>('#practice-settings')!.hidden).toBe(true)
    expect(document.querySelector('[data-answer-feedback]')).not.toBeNull()
  })

  it('Practice 作答前不洩漏答案，檢查後先隱藏法源，主動展開才顯示並記錄統計', () => {
    mount()
    expect(document.body.textContent).not.toContain('正確答案：A')
    document.querySelector<HTMLButtonElement>('[data-option="B"]')!.click()
    document.querySelector<HTMLButtonElement>('[data-action="check-practice"]')!.click()
    expect(document.body.textContent).toContain('正確答案：A')
    expect(document.body.textContent).not.toContain('法源 1-1')
    document.querySelector<HTMLButtonElement>('[data-action="toggle-explanation"]')!.click()
    expect(document.body.textContent).toContain('法源 1-1')
    document.querySelector<HTMLButtonElement>('[data-action="toggle-explanation"]')!.click()
    expect(document.body.textContent).not.toContain('法源 1-1')
    expect(JSON.parse(localStorage.getItem('rent-exam-history-v1')!).wrongKeys).toContain('c1-s1-q1')
  })

  it('Practice reload 後還原同一題、答案、檢查與詳解狀態且不重複累計', () => {
    mount([question(1, 1), question(1, 2)])
    const key = document.querySelector<HTMLElement>('[data-question-key]')!.dataset.questionKey
    document.querySelector<HTMLButtonElement>('[data-option="B"]')!.click()
    document.querySelector<HTMLButtonElement>('[data-action="check-practice"]')!.click()
    document.querySelector<HTMLButtonElement>('[data-action="toggle-explanation"]')!.click()

    expect(localStorage.getItem('rent-exam-session-v1')).not.toBeNull()
    expect(JSON.parse(localStorage.getItem('rent-exam-history-v1')!).answered).toBe(1)

    mount([question(1, 1), question(1, 2)])

    expect(document.querySelector<HTMLElement>('[data-question-key]')!.dataset.questionKey).toBe(key)
    expect(document.querySelector('[data-option="B"]')!.classList.contains('is-wrong')).toBe(true)
    expect(document.body.textContent).toContain('正確答案：A')
    expect(document.body.textContent).toContain('法源')
    expect(JSON.parse(localStorage.getItem('rent-exam-history-v1')!).answered).toBe(1)
  })

  it('章節選單 onchange 立即載入新章題目，且不顯示重複操作與錯題回顧按鈕', () => {
    mount([question(1, 1), question(1, 2), question(2, 1)], 'chapter')
    let select = document.querySelector<HTMLSelectElement>('[data-action="chapter-select"]')!
    select.value = '1'
    select.dispatchEvent(new Event('change', { bubbles: true }))

    expect(document.querySelector('[data-question-key]')!.getAttribute('data-question-key')).toMatch(/^c1-/)
    expect(document.querySelector('[data-action="start-chapter-practice"]')).toBeNull()
    expect(document.querySelector('.control-panel a[href="/wrong/"]')).toBeNull()

    document.querySelector<HTMLButtonElement>('[data-option="A"]')!.click()
    document.querySelector<HTMLButtonElement>('[data-action="check-practice"]')!.click()
    document.querySelector<HTMLButtonElement>('[data-action="toggle-explanation"]')!.click()
    document.querySelector<HTMLButtonElement>('[data-action="next-practice"]')!.click()
    document.querySelector<HTMLButtonElement>('[data-option="A"]')!.click()
    document.querySelector<HTMLButtonElement>('[data-action="check-practice"]')!.click()
    document.querySelector<HTMLButtonElement>('[data-action="toggle-explanation"]')!.click()

    select = document.querySelector<HTMLSelectElement>('[data-action="chapter-select"]')!
    select.value = '2'
    select.dispatchEvent(new Event('change', { bubbles: true }))

    expect(document.querySelector('[data-question-key]')!.getAttribute('data-question-key')).toBe('c2-s1-q1')
    expect(document.body.textContent).toContain('第 2 章隨機練習')
    expect(document.body.textContent).toContain('第 1 / 1 題')
    expect(document.querySelector('.option.is-selected')).toBeNull()
    expect(document.querySelector<HTMLButtonElement>('[data-action="check-practice"]')!.disabled).toBe(true)
    expect(document.querySelector('.explanation')).toBeNull()
  })

  it('章節練習可切換為依題號順序並重置作答狀態', () => {
    mount([question(1, 3), question(1, 1), question(1, 2)], 'chapter')
    const chapter = document.querySelector<HTMLSelectElement>('[data-action="chapter-select"]')!
    chapter.value = '1'
    chapter.dispatchEvent(new Event('change', { bubbles: true }))

    let order = document.querySelector<HTMLSelectElement>('[data-action="chapter-order"]')!
    expect(order.value).toBe('random')
    order.value = 'sequential'
    order.dispatchEvent(new Event('change', { bubbles: true }))

    expect(document.querySelector('[data-question-key]')!.getAttribute('data-question-key')).toBe('c1-s1-q1')
    expect(document.body.textContent).toContain('第 1 章依題號順序練習')

    document.querySelector<HTMLButtonElement>('[data-option="A"]')!.click()
    document.querySelector<HTMLButtonElement>('[data-action="check-practice"]')!.click()
    document.querySelector<HTMLButtonElement>('[data-action="next-practice"]')!.click()
    expect(document.querySelector('[data-question-key]')!.getAttribute('data-question-key')).toBe('c1-s1-q2')
    document.querySelector<HTMLButtonElement>('[data-option="A"]')!.click()
    document.querySelector<HTMLButtonElement>('[data-action="check-practice"]')!.click()
    document.querySelector<HTMLButtonElement>('[data-action="toggle-explanation"]')!.click()
    expect(document.querySelector('.explanation')).not.toBeNull()

    order = document.querySelector<HTMLSelectElement>('[data-action="chapter-order"]')!
    order.value = 'random'
    order.dispatchEvent(new Event('change', { bubbles: true }))

    expect(document.body.textContent).toContain('第 1 / 3 題')
    expect(document.querySelector('.option.is-selected')).toBeNull()
    expect(document.querySelector<HTMLButtonElement>('[data-action="check-practice"]')!.disabled).toBe(true)
    expect(document.querySelector('.explanation')).toBeNull()

    order = document.querySelector<HTMLSelectElement>('[data-action="chapter-order"]')!
    order.value = 'sequential'
    order.dispatchEvent(new Event('change', { bubbles: true }))
    expect(document.querySelector('[data-question-key]')!.getAttribute('data-question-key')).toBe('c1-s1-q1')
  })

  it('模擬考鎖定百題、可切題並於交卷後顯示章節統計；未作答直接顯示說明', () => {
    mount(examQuestions, 'mock')
    expect(document.body.textContent).toContain('第 1 至第 10 章，每章各隨機抽取 10 題，共 100 題')
    expect(document.body.textContent).toContain('每次開始模擬考都會重新抽題')
    expect(document.body.textContent).toContain('隨機重排 A、B、C、D 選項，正確答案會同步調整')
    expect(document.body.textContent).toContain('作答時間為 120 分鐘')
    document.querySelector<HTMLButtonElement>('[data-action="start-mock"]')!.click()
    expect(document.querySelectorAll('[data-exam-index]').length).toBe(100)
    expect(document.body.textContent).toContain('第 1 / 100 題')
    document.querySelector<HTMLButtonElement>('[data-action="mock-next"]')!.click()
    expect(document.body.textContent).toContain('第 2 / 100 題')
    document.querySelector<HTMLButtonElement>('[data-exam-index="49"]')!.click()
    expect(document.body.textContent).toContain('第 50 / 100 題')
    document.querySelector<HTMLButtonElement>('[data-action="submit-mock"]')!.click()
    expect(document.body.textContent).toContain('尚有 100 題未作答')
    document.querySelector<HTMLButtonElement>('[data-action="confirm-submit-mock"]')!.click()
    expect(document.body.textContent).toContain('模擬考成績')
    expect(document.body.textContent).toContain('第 1 章')
    expect(document.body.textContent).toContain('法源 1-1')
    expect(document.querySelector('[data-action="toggle-result-explanation"]')).toBeNull()
  })

  it('模擬考重排選項與答案，並在 reload 後維持同一排列', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    mount(examQuestions, 'mock')
    document.querySelector<HTMLButtonElement>('[data-action="start-mock"]')!.click()

    const stored = JSON.parse(localStorage.getItem('rent-exam-session-v1')!)
    const firstKey = stored.questionKeys[0]
    expect(Object.keys(stored.optionOrders)).toHaveLength(100)
    expect(stored.optionOrders[firstKey]).toEqual(['B', 'C', 'D', 'A'])
    const beforeReload = [...document.querySelectorAll<HTMLElement>('[data-option] span')].map((item) => item.textContent)
    expect(beforeReload).toEqual(['錯誤', '選項丙', '選項丁', '正確'])
    document.querySelector<HTMLButtonElement>('[data-option="D"]')!.click()

    mount(examQuestions, 'mock')
    expect([...document.querySelectorAll<HTMLElement>('[data-option] span')].map((item) => item.textContent)).toEqual(beforeReload)
    expect(document.querySelector('[data-option="D"]')?.getAttribute('aria-pressed')).toBe('true')
    document.querySelector<HTMLButtonElement>('[data-action="submit-mock"]')!.click()
    document.querySelector<HTMLButtonElement>('[data-action="confirm-submit-mock"]')!.click()
    expect(document.body.textContent).toContain('1 / 100 題（1%）')
    expect(document.body.textContent).toContain('你的答案：D；正確答案：D・✓ 正確')
    expect(JSON.parse(localStorage.getItem('rent-exam-history-v1')!).correct).toBe(1)
  })

  it('模擬考答錯時以文字列出當次作答選項、正確選項與直接顯示的說明', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    mount(examQuestions, 'mock')
    document.querySelector<HTMLButtonElement>('[data-action="start-mock"]')!.click()
    const key = document.querySelector<HTMLElement>('[data-question-key]')!.dataset.questionKey!

    clickOptionByText('錯誤')
    document.querySelector<HTMLButtonElement>('[data-action="submit-mock"]')!.click()
    document.querySelector<HTMLButtonElement>('[data-action="confirm-submit-mock"]')!.click()

    const result = document.querySelector<HTMLElement>(`.result-item[data-question-key="${key}"]`)!
    expect(result.querySelector('[data-answer-kind="selected"]')?.textContent).toContain('你的作答')
    expect(result.querySelector('[data-answer-kind="selected"]')?.textContent).toContain('A')
    expect(result.querySelector('[data-answer-kind="selected"]')?.textContent).toContain('錯誤')
    expect(result.querySelector('[data-answer-kind="correct"]')?.textContent).toContain('正確答案')
    expect(result.querySelector('[data-answer-kind="correct"]')?.textContent).toContain('D')
    expect(result.querySelector('[data-answer-kind="correct"]')?.textContent).toContain('正確')
    expect(result.textContent).toContain('法源')
    expect(result.querySelector('[data-action="toggle-result-explanation"]')).toBeNull()
  })

  it('模擬考排除 ignore 題，且註記變更會更新 session fingerprint', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const bank = Array.from({ length: 10 }, (_, chapter) =>
      Array.from({ length: 25 }, (_, index) => question(chapter + 1, index + 1)),
    ).flat()
    const annotations: QuestionAnnotationsDocument = {
      schema_version: 1,
      updated_at: '2026-07-23',
      annotations: [
        { question_key: 'c2-s1-q5', type: 'ignore', message: '此題可忽略。' },
        { question_key: 'c2-s1-q23', type: 'ignore', message: '此題可忽略。' },
      ],
    }

    mount(bank, 'mock', annotations)
    document.querySelector<HTMLButtonElement>('[data-action="start-mock"]')!.click()

    const stored = JSON.parse(localStorage.getItem('rent-exam-session-v1')!)
    expect(stored.questionKeys).not.toContain('c2-s1-q5')
    expect(stored.questionKeys).not.toContain('c2-s1-q23')
    expect(stored.bankSignature).not.toBe(questionBankSignature(bank))
  })

  it('模擬考中的錯字題顯示括號修正與原文提示', () => {
    const typo = {
      ...question(2, 17),
      question: '除言明租金外，並為約定租金應如何支付。',
    }
    const bank = examQuestions.map((item) => item.chapter_no === 2 && item.question_no === 10 ? typo : item)
    const annotations: QuestionAnnotationsDocument = {
      schema_version: 1,
      updated_at: '2026-07-23',
      annotations: [{
        question_key: 'c2-s1-q17',
        type: 'typo',
        message: '題目原文疑有錯字，考試仍可能沿用原文；括號內「未」為補充字詞。',
        question_replacement: { from: '並為約定', to: '並為（未）約定' },
      }],
    }

    mount(bank, 'mock', annotations)
    document.querySelector<HTMLButtonElement>('[data-action="start-mock"]')!.click()
    const keys = JSON.parse(localStorage.getItem('rent-exam-session-v1')!).questionKeys as string[]
    document.querySelector<HTMLButtonElement>(`[data-exam-index="${keys.indexOf('c2-s1-q17')}"]`)!.click()

    expect(document.querySelector('h1')?.textContent).toContain('並為（未）約定')
    expect(document.querySelector('[data-annotation-type="typo"]')?.textContent).toContain('考試仍可能沿用原文')

    document.querySelector<HTMLButtonElement>('[data-action="submit-mock"]')!.click()
    document.querySelector<HTMLButtonElement>('[data-action="confirm-submit-mock"]')!.click()
    const result = document.querySelector('[data-question-key="c2-s1-q17"]')!
    expect(result.querySelector('h3')?.textContent).toContain('並為（未）約定')
    expect(result.querySelector('[data-annotation-type="typo"]')?.textContent).toContain('考試仍可能沿用原文')
  })

  it('模擬考重複題目文字仍依唯一 key 展開被點擊題目的詳解', () => {
    const duplicateTextExam = examQuestions.map((item) =>
      item.chapter_no === 1 && item.question_no <= 2 ? { ...item, question: '相同題目文字？' } : item,
    )
    mount(duplicateTextExam, 'mock')
    document.querySelector<HTMLButtonElement>('[data-action="start-mock"]')!.click()
    document.querySelector<HTMLButtonElement>('[data-action="submit-mock"]')!.click()
    document.querySelector<HTMLButtonElement>('[data-action="confirm-submit-mock"]')!.click()

    const duplicates = [...document.querySelectorAll<HTMLElement>('.result-item')]
      .filter((item) => item.querySelector('h3')?.textContent === '相同題目文字？')
    expect(duplicates).toHaveLength(2)
    for (const item of duplicates) {
      const key = item.dataset.questionKey
      expect(key).toMatch(/^c1-s1-q[12]$/)
      expect(item.querySelector('[data-action="toggle-result-explanation"]')).toBeNull()
      expect(item.textContent).toContain(`法源 1-${key!.endsWith('q1') ? '1' : '2'}`)
    }
  })

  it('模擬考章節不足十題時 fail closed 並顯示可理解錯誤', () => {
    const insufficient = [
      ...examQuestions.filter((item) => !(item.chapter_no === 1 && item.question_no === 10)),
      question(2, 11),
    ]
    mount(insufficient, 'mock')

    expect(() => document.querySelector<HTMLButtonElement>('[data-action="start-mock"]')!.click()).not.toThrow()
    expect(document.body.textContent).toMatch(/第 1 章.*至少.*10 題/)
    expect(document.querySelector('[data-timer]')).toBeNull()
    expect(document.querySelectorAll('[data-exam-index]')).toHaveLength(0)
  })

  it('模擬考交卷會把已作答題目寫入統計與錯題紀錄', () => {
    mount(examQuestions, 'mock')
    document.querySelector<HTMLButtonElement>('[data-action="start-mock"]')!.click()
    const firstKey = document.querySelector('[data-question-key]')!.getAttribute('data-question-key')
    clickOptionByText('錯誤')
    document.querySelector<HTMLButtonElement>('[data-action="submit-mock"]')!.click()
    document.querySelector<HTMLButtonElement>('[data-action="confirm-submit-mock"]')!.click()

    const history = JSON.parse(localStorage.getItem('rent-exam-history-v1')!)
    expect(history.answered).toBe(1)
    expect(history.correct).toBe(0)
    expect(history.wrongKeys).toContain(firstKey)
  })

  it('模擬考保存錯題 identity，重新進入可回顧作答、正解與說明並單獨清除紀錄', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    mount(examQuestions, 'mock')
    document.querySelector<HTMLButtonElement>('[data-action="start-mock"]')!.click()
    clickOptionByText('錯誤')
    document.querySelector<HTMLButtonElement>('[data-action="submit-mock"]')!.click()
    document.querySelector<HTMLButtonElement>('[data-action="confirm-submit-mock"]')!.click()

    const saved = JSON.parse(localStorage.getItem('rent-exam-history-v1')!)
    expect(saved.mockAttempts).toHaveLength(1)
    expect(saved.mockAttempts[0]).toMatchObject({ correct: 0, total: 100 })
    expect(saved.mockAttempts[0].chapters).toHaveLength(10)
    expect(saved.mockAttempts[0]).not.toHaveProperty('questionKeys')
    expect(saved.mockAttempts[0].mistakes).toHaveLength(100)

    mount(examQuestions, 'mock')
    expect(document.body.textContent).toContain('歷史模擬考表現')
    expect(document.body.textContent).toContain('共 1 次模擬考')
    expect(document.body.textContent).toContain('第 1 章')
    expect(document.querySelector<HTMLProgressElement>('[data-mock-chapter-rate="1"]')?.max).toBe(100)
    document.querySelector<HTMLElement>('.attempt-card summary')!.click()
    expect(document.body.textContent).toContain('該次錯誤題目回顧')
    const answeredMistake = [...document.querySelectorAll<HTMLElement>('[data-attempt-mistake]')]
      .find((item) => item.querySelector('[data-answer-kind="selected"]')?.textContent?.includes('錯誤'))!
    expect(answeredMistake.textContent).toContain('你的作答')
    expect(answeredMistake.textContent).toContain('A')
    expect(answeredMistake.textContent).toContain('正確答案')
    expect(answeredMistake.textContent).toContain('D')
    expect(answeredMistake.textContent).toContain('法源')
    expect([...document.querySelectorAll<HTMLElement>('[data-attempt-mistake]')]
      .some((item) => item.textContent?.includes('未作答'))).toBe(true)
    document.querySelector<HTMLButtonElement>('[data-action="clear-mock-history"]')!.click()
    expect(document.body.textContent).toContain('確定清除所有模擬考結果分布')
    document.querySelector<HTMLButtonElement>('[data-action="confirm-clear-mock-history"]')!.click()

    const cleared = JSON.parse(localStorage.getItem('rent-exam-history-v1')!)
    expect(cleared.mockAttempts).toEqual([])
    expect(cleared.wrongKeys).toHaveLength(1)
    expect(document.body.textContent).toContain('尚無模擬考紀錄')
  })

  it('歷史錯題的合法 A-D 排列遭語意竄改時，不顯示答案比較', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    mount(examQuestions, 'mock')
    document.querySelector<HTMLButtonElement>('[data-action="start-mock"]')!.click()
    clickOptionByText('錯誤')
    document.querySelector<HTMLButtonElement>('[data-action="submit-mock"]')!.click()
    document.querySelector<HTMLButtonElement>('[data-action="confirm-submit-mock"]')!.click()

    const saved = JSON.parse(localStorage.getItem('rent-exam-history-v1')!)
    const tampered = saved.mockAttempts[0].mistakes.find((item: { selectedOptionId: string | null }) => item.selectedOptionId)
    tampered.sourceOptionOrder = ['A', 'B', 'C', 'D']
    localStorage.setItem('rent-exam-history-v1', JSON.stringify(saved))

    mount(examQuestions, 'mock')
    document.querySelector<HTMLElement>('.attempt-card summary')!.click()
    const unsafe = [...document.querySelectorAll<HTMLElement>('[data-attempt-mistake]')]
      .find((item) => item.textContent?.includes('無法安全還原'))!
    expect(unsafe).toBeTruthy()
    expect(unsafe.querySelector('[data-answer-kind]')).toBeNull()
  })

  it('舊版模擬考摘要仍顯示章節統計，並提示未保存逐題作答', () => {
    const chapters = Array.from({ length: 10 }, (_, index) => ({ chapter: index + 1, total: 10, answered: 10, correct: 8 }))
    localStorage.setItem('rent-exam-history-v1', JSON.stringify({
      version: 2,
      answered: 100,
      correct: 80,
      wrongKeys: [],
      recordedExamIds: ['attempt-legacy01'],
      chapterStats: {},
      mockAttempts: [{ attemptId: 'attempt-legacy01', completedAt: 1_000, bankKey: 'withLaw', correct: 80, total: 100, chapters }],
    }))

    mount(examQuestions, 'mock')
    document.querySelector<HTMLElement>('.attempt-card summary')!.click()

    expect(document.body.textContent).toContain('80 / 100')
    expect(document.body.textContent).toContain('舊紀錄未保存逐題作答')
    expect(document.querySelectorAll('[data-attempt-mistake]')).toHaveLength(0)
  })

  it('全對的模擬考歷史明確顯示沒有錯誤或未作答', () => {
    const chapters = Array.from({ length: 10 }, (_, index) => ({ chapter: index + 1, total: 10, answered: 10, correct: 10 }))
    localStorage.setItem('rent-exam-history-v1', JSON.stringify({
      version: 2,
      answered: 100,
      correct: 100,
      wrongKeys: [],
      recordedExamIds: ['attempt-perfect1'],
      chapterStats: {},
      mockAttempts: [{ attemptId: 'attempt-perfect1', completedAt: 1_000, bankKey: 'withLaw', correct: 100, total: 100, chapters, mistakes: [] }],
    }))

    mount(examQuestions, 'mock')
    document.querySelector<HTMLElement>('.attempt-card summary')!.click()

    expect(document.body.textContent).toContain('本次沒有錯誤或未作答題目')
    expect(document.querySelectorAll('[data-attempt-mistake]')).toHaveLength(0)
  })

  it('舊版 history 與進行中的 version 1 模擬考可跨更新 reload 後交卷', () => {
    localStorage.setItem('rent-exam-history-v1', JSON.stringify({
      answered: 7,
      correct: 5,
      wrongKeys: ['c1-s1-q1'],
    }))
    mount(examQuestions, 'mock')
    document.querySelector<HTMLButtonElement>('[data-action="start-mock"]')!.click()
    clickOptionByText('錯誤')
    expect(JSON.parse(localStorage.getItem('rent-exam-session-v1')!).version).toBe(1)

    mount(examQuestions, 'mock')
    expect(document.body.textContent).toContain('第 1 / 100 題')
    document.querySelector<HTMLButtonElement>('[data-action="submit-mock"]')!.click()
    document.querySelector<HTMLButtonElement>('[data-action="confirm-submit-mock"]')!.click()

    const upgraded = JSON.parse(localStorage.getItem('rent-exam-history-v1')!)
    expect(upgraded.version).toBe(2)
    expect(upgraded.answered).toBe(8)
    expect(upgraded.correct).toBe(5)
    expect(upgraded.wrongKeys).toContain('c1-s1-q1')
    expect(upgraded.mockAttempts).toHaveLength(1)
  })

  it('同一模擬考 attempt 重送交卷不會重複累計', () => {
    mount(examQuestions, 'mock')
    document.querySelector<HTMLButtonElement>('[data-action="start-mock"]')!.click()
    clickOptionByText('錯誤')
    const activeAttempt = localStorage.getItem('rent-exam-session-v1')!
    document.querySelector<HTMLButtonElement>('[data-action="submit-mock"]')!.click()
    document.querySelector<HTMLButtonElement>('[data-action="confirm-submit-mock"]')!.click()
    expect(JSON.parse(localStorage.getItem('rent-exam-history-v1')!).answered).toBe(1)

    localStorage.setItem('rent-exam-session-v1', activeAttempt)
    mount(examQuestions, 'mock')
    document.querySelector<HTMLButtonElement>('[data-action="submit-mock"]')!.click()
    document.querySelector<HTMLButtonElement>('[data-action="confirm-submit-mock"]')!.click()

    expect(JSON.parse(localStorage.getItem('rent-exam-history-v1')!).answered).toBe(1)
  })

  it('倒數時間到會自動交卷', () => {
    vi.useFakeTimers()
    mount(examQuestions, 'mock')
    document.querySelector<HTMLButtonElement>('[data-action="start-mock"]')!.click()
    vi.advanceTimersByTime(120 * 60 * 1000)
    expect(document.body.textContent).toContain('模擬考成績')
  })

  it('錯題回顧顯示本機統計，能只練錯題並重設紀錄', () => {
    localStorage.setItem('rent-exam-history-v1', JSON.stringify({ answered: 3, correct: 2, wrongKeys: ['c1-s1-q1'] }))
    mount(oneQuestion, 'wrong')
    expect(document.body.textContent).toContain('累計作答：3')
    expect(document.body.textContent).toContain('錯題數：1')
    document.querySelector<HTMLButtonElement>('[data-action="practice-wrongs"]')!.click()
    expect(document.body.textContent).toContain('錯題練習')
    mount(oneQuestion, 'wrong')
    expect(document.body.textContent).toContain('錯題練習')
    document.querySelector<HTMLButtonElement>('[data-action="return-wrong-review"]')!.click()
    document.querySelector<HTMLButtonElement>('[data-action="reset-history"]')!.click()
    expect(document.body.textContent).toContain('累計作答：0')
  })

  it('錯題回顧顯示每章歷史答錯率與目前錯題，並可練習指定章節', () => {
    localStorage.setItem('rent-exam-history-v1', JSON.stringify({
      version: 2,
      answered: 8,
      correct: 5,
      wrongKeys: ['c2-s1-q1', 'c2-s1-q2', 'c3-s1-q1'],
      recordedExamIds: [],
      chapterStats: { '2': { answered: 5, correct: 2 }, '3': { answered: 3, correct: 3 } },
      mockAttempts: [],
    }))
    mount(examQuestions, 'wrong')

    const chapterTwo = document.querySelector<HTMLElement>('[data-wrong-chapter-summary="2"]')!
    expect(chapterTwo.textContent).toContain('歷史答錯率 60%')
    expect(chapterTwo.textContent).toContain('3 / 5')
    expect(chapterTwo.textContent).toContain('目前錯題 2 題')
    expect(chapterTwo.querySelector<HTMLProgressElement>('progress')?.value).toBe(60)
    document.querySelector<HTMLButtonElement>('[data-wrong-chapter="2"]')!.click()

    expect(document.body.textContent).toContain('第 2 章錯題練習')
    expect(document.querySelector<HTMLElement>('[data-question-key]')!.dataset.questionKey).toMatch(/^c2-/)
    expect(document.body.textContent).toContain('第 1 / 2 題')
  })

  it('目前錯題已解除時不還原過時的錯題練習 session', () => {
    localStorage.setItem('rent-exam-history-v1', JSON.stringify({
      version: 2,
      answered: 1,
      correct: 0,
      wrongKeys: ['c1-s1-q1'],
      recordedExamIds: [],
      chapterStats: { '1': { answered: 1, correct: 0 } },
      mockAttempts: [],
    }))
    mount(oneQuestion, 'wrong')
    document.querySelector<HTMLButtonElement>('[data-action="practice-wrongs"]')!.click()
    expect(document.body.textContent).toContain('錯題練習')

    const history = JSON.parse(localStorage.getItem('rent-exam-history-v1')!)
    localStorage.setItem('rent-exam-history-v1', JSON.stringify({ ...history, wrongKeys: [] }))
    mount(oneQuestion, 'wrong')

    expect(document.querySelector('[data-question-key]')).toBeNull()
    expect(document.body.textContent).toContain('錯題回顧')
    expect(document.body.textContent).toContain('錯題數：0')
  })

  it('目前錯題新增時不還原題目集合不完整的全部或指定章節 session', () => {
    const setWrongKeys = (wrongKeys: string[]) => localStorage.setItem('rent-exam-history-v1', JSON.stringify({
      version: 2,
      answered: wrongKeys.length,
      correct: 0,
      wrongKeys,
      recordedExamIds: [],
      chapterStats: { '1': { answered: wrongKeys.length, correct: 0 } },
      mockAttempts: [],
    }))

    setWrongKeys(['c1-s1-q1'])
    mount(examQuestions, 'wrong')
    document.querySelector<HTMLButtonElement>('[data-action="practice-wrongs"]')!.click()
    setWrongKeys(['c1-s1-q1', 'c1-s1-q2'])
    mount(examQuestions, 'wrong')
    expect(document.querySelector('[data-question-key]')).toBeNull()
    expect(document.body.textContent).toContain('錯題數：2')

    setWrongKeys(['c1-s1-q1'])
    mount(examQuestions, 'wrong')
    document.querySelector<HTMLButtonElement>('[data-wrong-chapter="1"]')!.click()
    setWrongKeys(['c1-s1-q1', 'c1-s1-q2'])
    mount(examQuestions, 'wrong')
    expect(document.querySelector('[data-question-key]')).toBeNull()
    expect(document.body.textContent).toContain('錯題數：2')
  })

  it('錯題回顧將損壞的本機統計正規化並去除無效與重複錯題 key', () => {
    localStorage.setItem('rent-exam-history-v1', JSON.stringify({
      answered: -3,
      correct: 99,
      wrongKeys: ['c1-s1-q1', 'c1-s1-q1', 'c9-s1-q99', 3, null, '<img>'],
    }))
    mount(oneQuestion, 'wrong')

    expect(document.body.textContent).toContain('累計作答：0')
    expect(document.body.textContent).toContain('正確率0%')
    expect(document.body.textContent).toContain('錯題數：1')
    expect(document.querySelector('[data-wrong-chapter="9"]')).toBeNull()
    expect(document.querySelector<HTMLButtonElement>('[data-wrong-chapter="1"]')?.disabled).toBe(false)
    expect(JSON.parse(localStorage.getItem('rent-exam-history-v1')!).wrongKeys).toEqual(['c1-s1-q1'])
  })
})
