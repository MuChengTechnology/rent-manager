import { describe, expect, it } from 'vitest'
import {
  aggregateMockChapterPerformance,
  chapterLearningPerformance,
  clearMockAttempts,
  emptyHistory,
  parseHistory,
  recordMockAttempt,
  recordPracticeAnswer,
} from '../../src/lib/history'

const mockAttempt = {
  attemptId: 'attempt-12345678',
  completedAt: 1_000,
  bankKey: 'withLaw' as const,
  chapters: Array.from({ length: 10 }, (_, index) => ({
    chapter: index + 1,
    total: 10,
    answered: index === 1 ? 8 : 10,
    correct: index === 1 ? 6 : 7,
  })),
  questionResults: [
    { key: 'c2-s1-q1', chapter: 2, answered: true, correct: false },
    { key: 'c2-s1-q2', chapter: 2, answered: true, correct: true },
    { key: 'c2-s1-q3', chapter: 2, answered: false, correct: false },
  ],
}

const completeMockResults = Array.from({ length: 10 }, (_, chapterIndex) => {
  const chapter = chapterIndex + 1
  const correctCount = chapter === 2 ? 6 : 7
  return Array.from({ length: 10 }, (_, questionIndex) => {
    const question = questionIndex + 1
    const answered = chapter !== 2 || question <= 8
    const correct = question <= correctCount
    return {
      key: `c${chapter}-s1-q${question}`,
      chapter,
      answered,
      correct,
      ...(correct ? {} : {
        questionFingerprint: 'q1-12345678',
        selectedOptionId: answered ? 'B' : null,
        displayedSelectedOptionId: answered ? 'A' : null,
        correctOptionId: 'A',
        displayedCorrectOptionId: 'D',
      }),
    }
  })
}).flat()

describe('本機學習歷史', () => {
  it('安全遷移舊版資料並正規化不可信欄位', () => {
    const history = parseHistory({
      answered: 3,
      correct: 99,
      wrongKeys: ['c2-s1-q5', 'c2-s1-q5', 'bad'],
      recordedExamIds: ['attempt-12345678', 'bad'],
    })

    expect(history).toMatchObject({ version: 2, answered: 3, correct: 3 })
    expect(history.wrongKeys).toEqual(['c2-s1-q5'])
    expect(history.recordedExamIds).toEqual(['attempt-12345678'])
    expect(history.mockAttempts).toEqual([])
    expect(history.chapterStats).toEqual({})
  })

  it('舊版累計與錯題可在首次新模擬考交卷時無損升級', () => {
    const legacy = parseHistory({
      answered: 12,
      correct: 8,
      wrongKeys: ['c1-s1-q1'],
    })
    const upgraded = recordMockAttempt(legacy, mockAttempt)

    expect(upgraded.version).toBe(2)
    expect(upgraded.answered).toBe(110)
    expect(upgraded.correct).toBe(77)
    expect(upgraded.wrongKeys).toContain('c1-s1-q1')
    expect(upgraded.mockAttempts).toHaveLength(1)
  })

  it('未知 schema version 採 fail-safe，不誤讀成目前版本', () => {
    expect(parseHistory({
      version: 999,
      answered: 20,
      correct: 20,
      wrongKeys: ['c1-s1-q1'],
    })).toEqual(emptyHistory())
  })

  it('只記錄模擬考分布摘要，並以 attempt ID 保持冪等', () => {
    const once = recordMockAttempt(emptyHistory(), mockAttempt)
    const twice = recordMockAttempt(once, mockAttempt)

    expect(twice).toEqual(once)
    expect(once.mockAttempts).toHaveLength(1)
    expect(once.mockAttempts[0]).toEqual({
      attemptId: 'attempt-12345678',
      completedAt: 1_000,
      bankKey: 'withLaw',
      correct: 69,
      total: 100,
      chapters: mockAttempt.chapters,
    })
    expect(once.mockAttempts[0]).not.toHaveProperty('questionResults')
    expect(once.wrongKeys).toEqual(['c2-s1-q1'])
    expect(once.answered).toBe(98)
    expect(once.correct).toBe(69)
  })

  it('保存錯誤與未作答題目的最小選項 identity，供歷史 attempt 回顧', () => {
    const recorded = recordMockAttempt(emptyHistory(), {
      ...mockAttempt,
      attemptId: 'attempt-details1',
      questionResults: completeMockResults,
    })

    expect(recorded.mockAttempts[0].attemptId).toBe('attempt-details1')
    expect(recorded.mockAttempts[0].mistakes).toHaveLength(31)
    expect(recorded.mockAttempts[0].mistakes).toContainEqual({
      key: 'c1-s1-q8',
      questionFingerprint: 'q1-12345678',
      selectedOptionId: 'B', displayedSelectedOptionId: 'A',
      correctOptionId: 'A', displayedCorrectOptionId: 'D',
    })
    expect(recorded.mockAttempts[0].mistakes).toContainEqual({
      key: 'c2-s1-q9',
      questionFingerprint: 'q1-12345678',
      selectedOptionId: null, displayedSelectedOptionId: null,
      correctOptionId: 'A', displayedCorrectOptionId: 'D',
    })
    expect(parseHistory(recorded)).toEqual(recorded)
  })

  it('全對 attempt 保存空錯題清單，與未保存逐題資料的舊紀錄明確區分', () => {
    const recorded = recordMockAttempt(emptyHistory(), {
      ...mockAttempt,
      attemptId: 'attempt-perfect1',
      chapters: mockAttempt.chapters.map((chapter) => ({ ...chapter, answered: 10, correct: 10 })),
      questionResults: completeMockResults.map(({ key, chapter }) => ({ key, chapter, answered: true, correct: true })),
    })

    expect(recorded.mockAttempts[0]).toMatchObject({ correct: 100, total: 100, mistakes: [] })
    expect(parseHistory(recorded)).toEqual(recorded)
  })

  it('逐題結果不完整時不建立可能誤導的錯題回顧', () => {
    const recorded = recordMockAttempt(emptyHistory(), {
      ...mockAttempt,
      attemptId: 'attempt-partial1',
      questionResults: [{
        key: 'c2-s1-q1', chapter: 2, answered: true, correct: false,
        questionFingerprint: 'q1-12345678',
        selectedOptionId: 'B', displayedSelectedOptionId: 'A',
        correctOptionId: 'A', displayedCorrectOptionId: 'D',
      }],
    })

    expect(recorded.mockAttempts[0]).not.toHaveProperty('mistakes')
  })

  it('逐題 detail 損壞時保留原有 attempt 摘要，但不顯示不可信答案', () => {
    const recorded = recordMockAttempt(emptyHistory(), mockAttempt)
    const repaired = parseHistory({
      ...recorded,
      mockAttempts: [{
        ...recorded.mockAttempts[0],
        mistakes: [{
          key: 'c2-s1-q1',
          questionFingerprint: 'q1-12345678',
          selectedOptionId: '<img>', displayedSelectedOptionId: 'A',
          correctOptionId: 'A', displayedCorrectOptionId: 'B',
        }],
      }],
    })

    expect(repaired.mockAttempts).toHaveLength(1)
    expect(repaired.mockAttempts[0]).not.toHaveProperty('mistakes')
    expect(repaired.mockAttempts[0]).toMatchObject({ correct: 69, total: 100 })
  })

  it('逐題 detail 數量與分數不一致時保留摘要但捨棄不完整回顧', () => {
    const recorded = recordMockAttempt(emptyHistory(), { ...mockAttempt, questionResults: completeMockResults })
    const repaired = parseHistory({
      ...recorded,
      mockAttempts: [{ ...recorded.mockAttempts[0], mistakes: recorded.mockAttempts[0].mistakes?.slice(0, 1) }],
    })

    expect(repaired.mockAttempts).toHaveLength(1)
    expect(repaired.mockAttempts[0]).not.toHaveProperty('mistakes')
    expect(repaired.mockAttempts[0]).toMatchObject({ correct: 69, total: 100 })
  })

  it('由有效摘要修復遺失的 tombstone，且只保留最近 50 次摘要', () => {
    const recorded = recordMockAttempt(emptyHistory(), mockAttempt)
    const repaired = parseHistory({ ...recorded, recordedExamIds: [] })

    expect(repaired.recordedExamIds).toContain(mockAttempt.attemptId)
    expect(recordMockAttempt(repaired, mockAttempt)).toEqual(repaired)

    let history = emptyHistory()
    for (let index = 0; index < 51; index += 1) {
      history = recordMockAttempt(history, {
        ...mockAttempt,
        attemptId: `attempt-${String(index).padStart(8, '0')}`,
        completedAt: index + 1,
        questionResults: [],
      })
    }
    expect(history.mockAttempts).toHaveLength(50)
    expect(history.mockAttempts[0].attemptId).toBe('attempt-00000001')
    expect(history.mockAttempts.at(-1)?.attemptId).toBe('attempt-00000050')

    const summariesWithoutTombstones = Array.from({ length: 51 }, (_, index) => ({
      ...recorded.mockAttempts[0],
      attemptId: `attempt-${String(index).padStart(8, '0')}`,
      completedAt: index + 1,
    }))
    const repairedOverflow = parseHistory({
      ...emptyHistory(),
      recordedExamIds: [],
      mockAttempts: summariesWithoutTombstones,
    })
    expect(repairedOverflow.mockAttempts).toHaveLength(50)
    expect(repairedOverflow.recordedExamIds).toContain('attempt-00000000')
    expect(recordMockAttempt(repairedOverflow, {
      ...mockAttempt,
      attemptId: 'attempt-00000000',
      completedAt: 1,
    })).toEqual(repairedOverflow)
  })

  it('清除模擬考紀錄但保留錯題、累計表現與冪等 tombstone', () => {
    const recorded = recordMockAttempt(emptyHistory(), mockAttempt)
    const cleared = clearMockAttempts(recorded)

    expect(cleared.mockAttempts).toEqual([])
    expect(cleared.wrongKeys).toEqual(['c2-s1-q1'])
    expect(cleared.answered).toBe(98)
    expect(cleared.recordedExamIds).toEqual(['attempt-12345678'])
  })

  it('彙總歷次模擬考章節正確率', () => {
    const first = recordMockAttempt(emptyHistory(), mockAttempt)
    const second = recordMockAttempt(first, {
      ...mockAttempt,
      attemptId: 'attempt-abcdefgh',
      completedAt: 2_000,
      chapters: mockAttempt.chapters.map((chapter) => ({ ...chapter, answered: 10, correct: 8 })),
      questionResults: [],
    })

    expect(aggregateMockChapterPerformance(second)[1]).toEqual({
      chapter: 2,
      correct: 14,
      total: 20,
      rate: 70,
    })
  })

  it('保留每章歷史答錯率與目前待複習錯題，答對後只解除目前錯題', () => {
    const wrong = recordPracticeAnswer(emptyHistory(), { key: 'c3-s1-q4', chapter: 3, correct: false })
    const corrected = recordPracticeAnswer(wrong, { key: 'c3-s1-q4', chapter: 3, correct: true })
    const chapter = chapterLearningPerformance(corrected).find((item) => item.chapter === 3)

    expect(chapter).toEqual({
      chapter: 3,
      answered: 2,
      wrong: 1,
      wrongRate: 50,
      currentWrong: 0,
    })
  })

  it('可依題庫實際章節動態產生錯題摘要，不補上不存在的空章節', () => {
    const history = recordPracticeAnswer(emptyHistory(), { key: 'c2-s1-q1', chapter: 2, correct: false })
    expect(chapterLearningPerformance(history, [1, 2, 3]).map((item) => item.chapter)).toEqual([1, 2, 3])
    expect(chapterLearningPerformance(history, [3, 2, 2, 1]).find((item) => item.chapter === 2)?.currentWrong).toBe(1)
  })
})
