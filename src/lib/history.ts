import type { BankKey } from './session'

export const HISTORY_KEY = 'rent-exam-history-v1'
const MAX_MOCK_ATTEMPTS = 50
const MAX_RECORDED_EXAM_IDS = 100

export interface ChapterHistoryStat {
  answered: number
  correct: number
}

export interface MockChapterSummary {
  chapter: number
  total: number
  answered: number
  correct: number
}

export interface MockAttemptSummary {
  attemptId: string
  completedAt: number
  bankKey: BankKey
  correct: number
  total: number
  chapters: MockChapterSummary[]
  mistakes?: MockAttemptMistake[]
}

export interface MockAttemptMistake {
  key: string
  questionFingerprint: string
  selectedOptionId: string | null
  displayedSelectedOptionId: string | null
  correctOptionId: string
  displayedCorrectOptionId: string
  sourceOptionOrder: string[]
}

export interface History {
  version: 2
  answered: number
  correct: number
  wrongKeys: string[]
  recordedExamIds: string[]
  chapterStats: Record<string, ChapterHistoryStat>
  mockAttempts: MockAttemptSummary[]
}

export interface MockQuestionResult {
  key: string
  chapter: number
  answered: boolean
  correct: boolean
  questionFingerprint?: string
  selectedOptionId?: string | null
  displayedSelectedOptionId?: string | null
  correctOptionId?: string
  displayedCorrectOptionId?: string
  sourceOptionOrder?: string[]
}

export interface RecordMockAttemptInput {
  attemptId: string
  completedAt: number
  bankKey: BankKey
  chapters: MockChapterSummary[]
  questionResults: MockQuestionResult[]
}

export interface MockChapterPerformance {
  chapter: number
  correct: number
  total: number
  rate: number
}

export interface ChapterLearningPerformance {
  chapter: number
  answered: number
  wrong: number
  wrongRate: number
  currentWrong: number
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const isSafeCount = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0
const isQuestionKey = (value: unknown): value is string => typeof value === 'string' && /^c[1-9]\d*-s[1-9]\d*-q[1-9]\d*$/.test(value)
const isAttemptId = (value: unknown): value is string => typeof value === 'string' && /^attempt-[A-Za-z0-9_-]{8,80}$/.test(value)
const isBankKey = (value: unknown): value is BankKey => value === 'withLaw' || value === 'withoutLaw'
const isOptionId = (value: unknown): value is string => typeof value === 'string' && /^[A-D]$/.test(value)
const isQuestionFingerprint = (value: unknown): value is string => typeof value === 'string' && /^q1-[0-9a-f]{8}$/.test(value)
const isSourceOptionOrder = (value: unknown): value is string[] => Array.isArray(value)
  && value.length === 4
  && new Set(value).size === 4
  && value.every(isOptionId)

export function emptyHistory(): History {
  return {
    version: 2,
    answered: 0,
    correct: 0,
    wrongKeys: [],
    recordedExamIds: [],
    chapterStats: {},
    mockAttempts: [],
  }
}

function parseChapterStat(value: unknown): ChapterHistoryStat | null {
  if (!isRecord(value) || !isSafeCount(value.answered) || !isSafeCount(value.correct)) return null
  return { answered: value.answered, correct: Math.min(value.correct, value.answered) }
}

function parseMockChapter(value: unknown): MockChapterSummary | null {
  if (!isRecord(value) || !Number.isInteger(value.chapter) || Number(value.chapter) < 1 || Number(value.chapter) > 10) return null
  if (!isSafeCount(value.total) || value.total !== 10 || !isSafeCount(value.answered) || value.answered > value.total) return null
  if (!isSafeCount(value.correct) || value.correct > value.answered) return null
  return { chapter: value.chapter as number, total: value.total, answered: value.answered, correct: value.correct }
}

function parseMockMistake(value: unknown): MockAttemptMistake | null {
  if (!isRecord(value) || !isQuestionKey(value.key) || !isQuestionFingerprint(value.questionFingerprint) || !isOptionId(value.correctOptionId) || !isOptionId(value.displayedCorrectOptionId) || !isSourceOptionOrder(value.sourceOptionOrder)) return null
  const unanswered = value.selectedOptionId === null && value.displayedSelectedOptionId === null
  const answered = isOptionId(value.selectedOptionId) && isOptionId(value.displayedSelectedOptionId)
  if (!unanswered && !answered) return null
  if (answered && (value.selectedOptionId === value.correctOptionId || value.displayedSelectedOptionId === value.displayedCorrectOptionId)) return null
  return {
    key: value.key,
    questionFingerprint: value.questionFingerprint,
    selectedOptionId: value.selectedOptionId as string | null,
    displayedSelectedOptionId: value.displayedSelectedOptionId as string | null,
    correctOptionId: value.correctOptionId,
    displayedCorrectOptionId: value.displayedCorrectOptionId,
    sourceOptionOrder: [...value.sourceOptionOrder],
  }
}

function parseMockMistakes(value: unknown): MockAttemptMistake[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length > 100) return undefined
  const parsed = value.map(parseMockMistake)
  if (parsed.some((item) => !item)) return undefined
  const mistakes = parsed as MockAttemptMistake[]
  if (new Set(mistakes.map((item) => item.key)).size !== mistakes.length) return undefined
  return mistakes
}

function buildMockMistakes(results: MockQuestionResult[]): MockAttemptMistake[] | undefined {
  if (results.length !== 100 || new Set(results.map((result) => result.key)).size !== results.length) return undefined
  const incorrect = results.filter((result) => !result.correct)
  if (!incorrect.length) return results.length === 100 ? [] : undefined
  const parsed = incorrect.map(parseMockMistake)
  if (parsed.some((item) => !item)) return undefined
  const mistakes = parsed as MockAttemptMistake[]
  if (new Set(mistakes.map((item) => item.key)).size !== mistakes.length) return undefined
  return mistakes
}

function parseMockAttempt(value: unknown): MockAttemptSummary | null {
  if (!isRecord(value) || !isAttemptId(value.attemptId) || !isSafeCount(value.completedAt) || value.completedAt === 0 || !isBankKey(value.bankKey)) return null
  if (!isSafeCount(value.correct) || !isSafeCount(value.total) || value.total !== 100 || value.correct > value.total || !Array.isArray(value.chapters)) return null
  const chapters = value.chapters.map(parseMockChapter)
  if (chapters.some((chapter) => !chapter)) return null
  const validChapters = chapters as MockChapterSummary[]
  if (validChapters.length !== 10 || new Set(validChapters.map((chapter) => chapter.chapter)).size !== 10) return null
  if (validChapters.reduce((sum, chapter) => sum + chapter.total, 0) !== value.total) return null
  if (validChapters.reduce((sum, chapter) => sum + chapter.correct, 0) !== value.correct) return null
  const parsedMistakes = parseMockMistakes(value.mistakes)
  const mistakes = parsedMistakes?.length === value.total - value.correct ? parsedMistakes : undefined
  return {
    attemptId: value.attemptId,
    completedAt: value.completedAt,
    bankKey: value.bankKey,
    correct: value.correct,
    total: value.total,
    chapters: [...validChapters].sort((left, right) => left.chapter - right.chapter),
    ...(mistakes === undefined ? {} : { mistakes }),
  }
}

export function parseHistory(value: unknown): History {
  if (!isRecord(value)) return emptyHistory()
  if (value.version !== undefined && value.version !== 2) return emptyHistory()
  const answered = isSafeCount(value.answered) ? value.answered : 0
  const savedCorrect = isSafeCount(value.correct) ? value.correct : 0
  const wrongKeys = Array.isArray(value.wrongKeys)
    ? [...new Set(value.wrongKeys.filter(isQuestionKey))]
    : []
  const recordedExamIds = Array.isArray(value.recordedExamIds)
    ? [...new Set(value.recordedExamIds.filter(isAttemptId))].slice(-MAX_RECORDED_EXAM_IDS)
    : []
  const chapterStats: Record<string, ChapterHistoryStat> = {}
  if (isRecord(value.chapterStats)) {
    for (const [chapter, rawStat] of Object.entries(value.chapterStats)) {
      if (!/^(?:[1-9]|10)$/.test(chapter)) continue
      const stat = parseChapterStat(rawStat)
      if (stat) chapterStats[chapter] = stat
    }
  }
  const parsedAttempts = Array.isArray(value.mockAttempts)
    ? value.mockAttempts.map(parseMockAttempt).filter((attempt): attempt is MockAttemptSummary => Boolean(attempt))
    : []
  const allUniqueAttempts = [...new Map(parsedAttempts.map((attempt) => [attempt.attemptId, attempt])).values()]
    .sort((left, right) => left.completedAt - right.completedAt)
  const uniqueAttempts = allUniqueAttempts.slice(-MAX_MOCK_ATTEMPTS)
  const repairedExamIds = [...new Set([
    ...recordedExamIds,
    ...allUniqueAttempts.map((attempt) => attempt.attemptId),
  ])].slice(-MAX_RECORDED_EXAM_IDS)

  return {
    version: 2,
    answered,
    correct: Math.min(savedCorrect, answered),
    wrongKeys,
    recordedExamIds: repairedExamIds,
    chapterStats,
    mockAttempts: uniqueAttempts,
  }
}

function updateChapterStat(history: History, chapter: number, answered: number, correct: number): Record<string, ChapterHistoryStat> {
  const current = history.chapterStats[String(chapter)] ?? { answered: 0, correct: 0 }
  return {
    ...history.chapterStats,
    [String(chapter)]: {
      answered: current.answered + answered,
      correct: current.correct + correct,
    },
  }
}

export function recordPracticeAnswer(historyValue: History, result: { key: string; chapter: number; correct: boolean }): History {
  const history = parseHistory(historyValue)
  if (!isQuestionKey(result.key) || !Number.isInteger(result.chapter) || result.chapter < 1 || result.chapter > 10) return history
  const wrongKeys = new Set(history.wrongKeys)
  if (result.correct) wrongKeys.delete(result.key); else wrongKeys.add(result.key)
  return {
    ...history,
    answered: history.answered + 1,
    correct: history.correct + Number(result.correct),
    wrongKeys: [...wrongKeys],
    chapterStats: updateChapterStat(history, result.chapter, 1, Number(result.correct)),
  }
}

export function recordMockAttempt(historyValue: History, input: RecordMockAttemptInput): History {
  const history = parseHistory(historyValue)
  if (history.recordedExamIds.includes(input.attemptId)) return history
  const chapters = input.chapters.map(parseMockChapter)
  if (!isAttemptId(input.attemptId) || !isSafeCount(input.completedAt) || input.completedAt === 0 || !isBankKey(input.bankKey)) return history
  if (chapters.some((chapter) => !chapter) || chapters.length !== 10) return history
  const validChapters = chapters as MockChapterSummary[]
  if (new Set(validChapters.map((chapter) => chapter.chapter)).size !== 10) return history
  const total = validChapters.reduce((sum, chapter) => sum + chapter.total, 0)
  const answered = validChapters.reduce((sum, chapter) => sum + chapter.answered, 0)
  const correct = validChapters.reduce((sum, chapter) => sum + chapter.correct, 0)
  if (total !== 100) return history

  let chapterStats = history.chapterStats
  for (const chapter of validChapters) {
    chapterStats = updateChapterStat({ ...history, chapterStats }, chapter.chapter, chapter.answered, chapter.correct)
  }
  const wrongKeys = new Set(history.wrongKeys)
  for (const result of input.questionResults) {
    if (!result.answered || !isQuestionKey(result.key)) continue
    if (result.correct) wrongKeys.delete(result.key); else wrongKeys.add(result.key)
  }
  const mistakes = buildMockMistakes(input.questionResults)
  const attempt: MockAttemptSummary = {
    attemptId: input.attemptId,
    completedAt: input.completedAt,
    bankKey: input.bankKey,
    correct,
    total,
    chapters: [...validChapters].sort((left, right) => left.chapter - right.chapter),
    ...(mistakes === undefined ? {} : { mistakes }),
  }
  return {
    ...history,
    answered: history.answered + answered,
    correct: history.correct + correct,
    wrongKeys: [...wrongKeys],
    recordedExamIds: [...history.recordedExamIds, input.attemptId].slice(-MAX_RECORDED_EXAM_IDS),
    chapterStats,
    mockAttempts: [...history.mockAttempts, attempt].slice(-MAX_MOCK_ATTEMPTS),
  }
}

export function clearMockAttempts(historyValue: History): History {
  return { ...parseHistory(historyValue), mockAttempts: [] }
}

export function aggregateMockChapterPerformance(historyValue: History): MockChapterPerformance[] {
  const history = parseHistory(historyValue)
  return Array.from({ length: 10 }, (_, index) => index + 1).map((chapter) => {
    const chapters = history.mockAttempts.flatMap((attempt) => attempt.chapters.filter((item) => item.chapter === chapter))
    const correct = chapters.reduce((sum, item) => sum + item.correct, 0)
    const total = chapters.reduce((sum, item) => sum + item.total, 0)
    return { chapter, correct, total, rate: total ? Math.round(correct / total * 100) : 0 }
  })
}

export function chapterLearningPerformance(historyValue: History, chapters: readonly number[] = Array.from({ length: 10 }, (_, index) => index + 1)): ChapterLearningPerformance[] {
  const history = parseHistory(historyValue)
  return [...new Set(chapters)].filter((chapter) => Number.isInteger(chapter) && chapter >= 1 && chapter <= 10).sort((left, right) => left - right).map((chapter) => {
    const stat = history.chapterStats[String(chapter)] ?? { answered: 0, correct: 0 }
    const wrong = stat.answered - stat.correct
    const currentWrong = history.wrongKeys.filter((key) => key.startsWith(`c${chapter}-`)).length
    return {
      chapter,
      answered: stat.answered,
      wrong,
      wrongRate: stat.answered ? Math.round(wrong / stat.answered * 100) : 0,
      currentWrong,
    }
  })
}

export function readHistory(storageKey = HISTORY_KEY): History {
  try {
    return parseHistory(JSON.parse(localStorage.getItem(storageKey) ?? 'null'))
  } catch {
    return emptyHistory()
  }
}

export function writeHistory(history: History, storageKey = HISTORY_KEY): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(parseHistory(history)))
  } catch {
    // Storage may be unavailable in restricted contexts.
  }
}

export function clearHistory(storageKey = HISTORY_KEY): void {
  try {
    localStorage.removeItem(storageKey)
  } catch {
    // Storage may be unavailable in restricted contexts.
  }
}
