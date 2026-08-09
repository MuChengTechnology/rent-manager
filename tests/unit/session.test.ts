import { describe, expect, it } from 'vitest'
import {
  hydrateStoredSession,
  parseStoredSession,
  questionBankSignature,
  questionContentSignature,
  sessionSummary,
  type StoredMockSession,
  type StoredPracticeSession,
} from '../../src/lib/session'
import { questionAnnotationsSignature, type QuestionAnnotationsDocument } from '../../src/lib/question-annotations'
import type { Question } from '../../src/lib/questions'

const question = (chapter: number, number: number): Question => ({
  chapter_no: chapter,
  chapter_code: `第${chapter}章`,
  chapter_title: `章節${chapter}`,
  section_no: 1,
  section_code: '一',
  section_title: '總則',
  question_no: number,
  question: `第 ${chapter}-${number} 題？`,
  options: [
    { id: 'A', text: '正確' },
    { id: 'B', text: '錯誤' },
    { id: 'C', text: '選項丙' },
    { id: 'D', text: '選項丁' },
  ],
  answer: 'A',
})

const questions = [question(1, 1), question(1, 2), question(2, 1)]
const signature = questionBankSignature(questions)
const mockQuestions = Array.from({ length: 10 }, (_, chapter) =>
  Array.from({ length: 10 }, (_, index) => question(chapter + 1, index + 1)),
).flat()
const validPractice: StoredPracticeSession = {
  version: 1,
  kind: 'practice',
  bankKey: 'withLaw',
  bankSignature: signature,
  view: 'chapter',
  questionKeys: ['c1-s1-q2', 'c1-s1-q1'],
  index: 1,
  selectedAnswer: 'B',
  checked: true,
  explanationOpen: false,
  chapterNo: 1,
  chapterOrder: 'sequential',
  settingsCollapsed: true,
  updatedAt: 1_000,
}

describe('中斷續作 session contract', () => {
  it('每題內容指紋涵蓋題幹、選項文字、正解與說明，且不受選項陣列順序影響', () => {
    const original = { ...question(1, 1), law_reference: '原說明' }
    const signature = questionContentSignature(original)
    const changedQuestions = [
      { ...original, question: '更新後題幹？' },
      { ...original, options: original.options.map((option) => option.id === 'A' ? { ...option, text: '更新後選項' } : option) },
      { ...original, answer: 'B' },
      { ...original, law_reference: '更新後說明' },
    ]

    for (const changed of changedQuestions) expect(questionContentSignature(changed)).not.toBe(signature)
    expect(questionContentSignature({ ...original, options: [...original.options].reverse() })).toBe(signature)
    expect(questionContentSignature(original, '更新後題目註記')).not.toBe(signature)
  })

  it('以 stable key 還原題目順序與目前作答狀態', () => {
    const restored = hydrateStoredSession(validPractice, questions, 'withLaw', 'chapter')

    expect(restored?.kind).toBe('practice')
    if (!restored || restored.kind !== 'practice') throw new Error('Expected practice session')
    expect(restored.questions.map((item) => item.question_no)).toEqual([2, 1])
    expect(restored.index).toBe(1)
    expect(restored.selectedAnswer).toBe('B')
    expect(restored.checked).toBe(true)
  })

  it('拒絕版本、題庫、signature、題目 key、index 或答案不合法的資料', () => {
    expect(parseStoredSession({ ...validPractice, version: 2 })).toBeNull()
    expect(hydrateStoredSession(validPractice, questions, 'withoutLaw', 'chapter')).toBeNull()
    expect(hydrateStoredSession({ ...validPractice, bankSignature: 'stale' }, questions, 'withLaw', 'chapter')).toBeNull()
    expect(hydrateStoredSession({ ...validPractice, questionKeys: ['c1-s1-q99'] }, questions, 'withLaw', 'chapter')).toBeNull()
    expect(hydrateStoredSession({ ...validPractice, index: 2 }, questions, 'withLaw', 'chapter')).toBeNull()
    expect(parseStoredSession({ ...validPractice, selectedAnswer: 'Z' })).toBeNull()
  })

  it('產生入口可使用且不含任意網址的續作摘要', () => {
    expect(sessionSummary(validPractice)).toEqual({
      bankKey: 'withLaw',
      route: '/practice/chapter/',
      title: '第 1 章依題號順序練習',
      progress: '第 2 / 2 題',
    })
  })

  it('可用 profile base path 產生隔離 track 的續作連結', () => {
    expect(sessionSummary(validPractice, '/renew').route).toBe('/renew/practice/chapter/')
    expect(sessionSummary({ ...validPractice, view: 'practice', chapterNo: null }, '/init').route).toBe('/init/practice/')
  })

  it('指定章節錯題 session 只接受同章題目，續作摘要保留章節', () => {
    const wrongSession: StoredPracticeSession = {
      ...validPractice,
      view: 'wrong',
      chapterNo: 1,
      questionKeys: ['c1-s1-q1', 'c1-s1-q2'],
      index: 0,
    }

    expect(hydrateStoredSession(wrongSession, questions, 'withLaw', 'wrong')?.kind).toBe('practice')
    expect(hydrateStoredSession({
      ...wrongSession,
      questionKeys: ['c1-s1-q1', 'c2-s1-q1'],
    }, questions, 'withLaw', 'wrong')).toBeNull()
    expect(sessionSummary(wrongSession)).toEqual({
      bankKey: 'withLaw',
      route: '/wrong/',
      title: '第 1 章錯題練習',
      progress: '第 1 / 2 題',
    })
  })

  it('還原模擬考題序、答案、目前題號與原始開始時間', () => {
    const stored: StoredMockSession = {
      version: 1,
      kind: 'mock',
      bankKey: 'withLaw',
      bankSignature: questionBankSignature(mockQuestions),
      view: 'mock',
      questionKeys: mockQuestions.map((item) => `c${item.chapter_no}-s${item.section_no}-q${item.question_no}`),
      index: 49,
      answers: { 'c1-s1-q1': 'B' },
      attemptId: 'attempt-00000001',
      startedAt: 5_000,
      updatedAt: 6_000,
    }

    const restored = hydrateStoredSession(stored, mockQuestions, 'withLaw', 'mock')
    expect(restored?.kind).toBe('mock')
    if (!restored || restored.kind !== 'mock') throw new Error('Expected mock session')
    expect(restored.questions).toHaveLength(100)
    expect(restored.index).toBe(49)
    expect(restored.answers).toEqual({ 'c1-s1-q1': 'B' })
    expect(restored.attemptId).toBe('attempt-00000001')
    expect(restored.startedAt).toBe(5_000)
    expect(sessionSummary(stored)).toEqual({
      bankKey: 'withLaw',
      route: '/mock/',
      title: '120 分鐘模擬考',
      progress: '第 50 / 100 題',
    })

    const optionOrders = Object.fromEntries(stored.questionKeys.map((key) => [key, ['B', 'C', 'D', 'A']]))
    const shuffled = hydrateStoredSession({ ...stored, optionOrders }, mockQuestions, 'withLaw', 'mock')
    expect(shuffled?.kind).toBe('mock')
    if (!shuffled || shuffled.kind !== 'mock') throw new Error('Expected shuffled mock session')
    expect(shuffled.optionOrders?.['c1-s1-q1']).toEqual(['B', 'C', 'D', 'A'])
    expect(shuffled.questions[0].options.map((option) => option.text)).toEqual(['錯誤', '選項丙', '選項丁', '正確'])
    expect(shuffled.questions[0].answer).toBe('D')

    expect(hydrateStoredSession({
      ...stored,
      optionOrders: { 'c1-s1-q1': ['A', 'A', 'C', 'D'] },
    }, mockQuestions, 'withLaw', 'mock')).toBeNull()

    expect(hydrateStoredSession({
      ...stored,
      startedAt: Date.now() + 1_000,
      updatedAt: Date.now() + 1_000,
    }, mockQuestions, 'withLaw', 'mock')).toBeNull()

    const expandedBank = [...mockQuestions, question(1, 11)]
    expect(hydrateStoredSession({
      ...stored,
      bankSignature: questionBankSignature(expandedBank),
      questionKeys: [...stored.questionKeys.slice(0, -1), 'c1-s1-q11'],
    }, expandedBank, 'withLaw', 'mock')).toBeNull()
  })

  it('註記變更或 restored mock 含 ignore 題時拒絕還原', () => {
    const oldAnnotations: QuestionAnnotationsDocument = {
      schema_version: 1,
      updated_at: '2026-07-23',
      annotations: [{ question_key: 'c2-s1-q5', type: 'ignore', message: '舊註記' }],
    }
    const newAnnotations: QuestionAnnotationsDocument = {
      ...oldAnnotations,
      annotations: [{ question_key: 'c2-s1-q5', type: 'ignore', message: '新註記' }],
    }
    const oldSignature = questionAnnotationsSignature(oldAnnotations)
    const stored: StoredMockSession = {
      version: 1,
      kind: 'mock',
      bankKey: 'withLaw',
      bankSignature: questionBankSignature(mockQuestions, oldSignature),
      view: 'mock',
      questionKeys: mockQuestions.map((item) => `c${item.chapter_no}-s${item.section_no}-q${item.question_no}`),
      index: 0,
      answers: {},
      attemptId: 'attempt-00000002',
      startedAt: 5_000,
      updatedAt: 6_000,
    }

    expect(hydrateStoredSession(stored, mockQuestions, 'withLaw', 'mock', oldSignature)?.kind).toBe('mock')
    expect(hydrateStoredSession(stored, mockQuestions, 'withLaw', 'mock', questionAnnotationsSignature(newAnnotations))).toBeNull()
    expect(hydrateStoredSession(stored, mockQuestions, 'withLaw', 'mock', oldSignature, new Set(['c2-s1-q5']))).toBeNull()
  })
})
