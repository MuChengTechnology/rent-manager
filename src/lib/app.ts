import { buildMockExam, questionKey, selectQuestions, shuffleQuestionOptions, type Question } from './questions'
import { annotateQuestionText, ignoredQuestionKeys, questionAnnotationMap, questionAnnotationsSignature, type QuestionAnnotation, type QuestionAnnotationsDocument } from './question-annotations'
import { aggregateMockChapterPerformance, chapterLearningPerformance, clearHistory, clearMockAttempts, readHistory, recordMockAttempt, recordPracticeAnswer, writeHistory, type MockAttemptSummary } from './history'
import { clearStoredSession, hydrateStoredSession, questionBankSignature, questionContentSignature, readStoredSession, writeStoredSession, type BankKey } from './session'
import { formatRemaining, remainingSeconds, shouldAutoSubmit } from './timer'
import type { ExamProfile } from './exam-profiles'
import { initMobileMenu, renderPrimaryHeader, type NavigationRoutes } from './navigation'

type Mode = 'practice' | 'chapter-select' | 'mock-start' | 'mock' | 'result' | 'review'
type ChapterOrder = 'random' | 'sequential'
type AppRoutes = NavigationRoutes
type InitRentAppOptions = { profile?: ExamProfile; routes?: AppRoutes; bankLabel?: string; bankKey?: BankKey; initialView?: 'practice' | 'chapter' | 'mock' | 'wrong'; annotations?: QuestionAnnotationsDocument; historicalQuestionBanks?: Partial<Record<BankKey, Question[]>> }

const OPTION_LABELS = ['A', 'B', 'C', 'D'] as const
const escapeHtml = (value: string) => value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]!)
const button = (action: string, label: string, extra = '', className = '') => `<button type="button" class="button${className ? ` ${className}` : ''}" data-action="${action}" ${extra}>${label}</button>`

export function initRentApp(root: HTMLElement, questions: Question[], options: InitRentAppOptions = {}): void {
  const routes = options.routes ?? { home: '/', practice: '/practice/', chapter: '/practice/chapter/', mock: '/mock/', wrong: '/wrong/', about: '/about/' }
  const initialView = options.initialView ?? 'practice'
  const bankKey = options.bankKey ?? 'withLaw'
  const sessionKey = options.profile?.storage.session
  const historyKey = options.profile?.storage.history
  const mockEnabled = options.profile?.mockExam.enabled ?? true
  const annotations = options.annotations ?? { schema_version: 1, updated_at: '1970-01-01', annotations: [] }
  const annotationsByKey = questionAnnotationMap(annotations)
  const ignoredKeys = ignoredQuestionKeys(annotations)
  const annotationSignature = questionAnnotationsSignature(annotations)
  const bankSignature = questionBankSignature(questions, annotationSignature)
  const questionChapterByKey = new Map(questions.map((question) => [questionKey(question), question.chapter_no]))
  const validQuestionKeys = new Set(questionChapterByKey.keys())
  const historicalQuestionBanks: Partial<Record<BankKey, Question[]>> = { ...options.historicalQuestionBanks, [bankKey]: questions }
  const historicalQuestionsByBank = Object.fromEntries(Object.entries(historicalQuestionBanks).map(([key, bankQuestions]) => [
    key,
    new Map((bankQuestions ?? []).map((question) => [questionKey(question), question])),
  ])) as Partial<Record<BankKey, Map<string, Question>>>
  const historicalQuestionFingerprint = (question: Question): string => {
    const annotation = annotationsByKey.get(questionKey(question))
    return questionContentSignature(question, annotation ? JSON.stringify(annotation) : '')
  }
  const availableChapters = [...new Set(questions.map((question) => question.chapter_no))].sort((left, right) => left - right)
  const readCurrentHistory = () => {
    const history = readHistory(historyKey)
    const wrongKeys = history.wrongKeys.filter((key) => validQuestionKeys.has(key))
    if (wrongKeys.length === history.wrongKeys.length) return history
    const cleaned = { ...history, wrongKeys }
    writeHistory(cleaned, historyKey)
    return cleaned
  }
  let mode: Mode = initialView === 'chapter' ? 'chapter-select' : initialView === 'mock' && mockEnabled ? 'mock-start' : initialView === 'wrong' ? 'review' : 'practice'
  let practiceQuestions = selectQuestions(questions, { count: questions.length })
  let practiceIndex = 0
  let selectedAnswer: string | undefined
  let checked = false
  let explanationOpen = false
  let practiceLabel = '全題庫隨機練習'
  let chapterNo = ''
  let chapterOrder: ChapterOrder = 'random'
  let examQuestions: Question[] = []
  let examOptionOrders: Record<string, string[]> = {}
  let examAnswers: Record<string, string> = {}
  let examIndex = 0
  let examStartedAt = 0
  let examAttemptId = ''
  let timerId: ReturnType<typeof setInterval> | undefined
  let resultExplanations = new Set<string>()
  const unavailableChapter = Array.from({ length: 10 }, (_, index) => index + 1)
    .find((chapter) => questions.filter((question) => question.chapter_no === chapter && !ignoredKeys.has(questionKey(question))).length < 10)
  let mockError = unavailableChapter ? `第 ${unavailableChapter} 章題數不足，至少需要 10 題，無法建立模擬考。` : ''
  let confirmingSubmit = false
  let confirmingClearMockHistory = false
  let examRecorded = false
  let settingsCollapsed = true

  const storedSession = readStoredSession(sessionKey)
  const hydratedSession = hydrateStoredSession(storedSession, questions, bankKey, initialView, annotationSignature, ignoredKeys)
  const currentWrongKeys = new Set(readCurrentHistory().wrongKeys)
  const expectedWrongSessionKeys = hydratedSession?.kind === 'practice' && hydratedSession.view === 'wrong'
    ? [...currentWrongKeys].filter((key) => hydratedSession.chapterNo === null || questionChapterByKey.get(key) === hydratedSession.chapterNo)
    : []
  const restoredWrongSessionKeys = hydratedSession?.kind === 'practice' && hydratedSession.view === 'wrong'
    ? new Set(hydratedSession.questionKeys)
    : new Set<string>()
  const staleWrongSession = hydratedSession?.kind === 'practice' && hydratedSession.view === 'wrong'
    && (restoredWrongSessionKeys.size !== expectedWrongSessionKeys.length
      || expectedWrongSessionKeys.some((key) => !restoredWrongSessionKeys.has(key)))
  const restoredSession = staleWrongSession ? null : hydratedSession
  if (restoredSession?.kind === 'practice') {
    mode = 'practice'
    practiceQuestions = restoredSession.questions
    practiceIndex = restoredSession.index
    selectedAnswer = restoredSession.selectedAnswer ?? undefined
    checked = restoredSession.checked
    explanationOpen = restoredSession.explanationOpen
    chapterNo = restoredSession.chapterNo === null ? '' : String(restoredSession.chapterNo)
    chapterOrder = restoredSession.chapterOrder
    settingsCollapsed = restoredSession.settingsCollapsed
    practiceLabel = restoredSession.view === 'chapter'
      ? `第 ${restoredSession.chapterNo} 章${restoredSession.chapterOrder === 'sequential' ? '依題號順序' : '隨機'}練習`
      : restoredSession.view === 'wrong'
        ? restoredSession.chapterNo ? `第 ${restoredSession.chapterNo} 章錯題練習` : '錯題練習'
        : '全題庫隨機練習'
  } else if (restoredSession?.kind === 'mock') {
    mode = 'mock'
    examQuestions = restoredSession.questions
    examOptionOrders = restoredSession.optionOrders
      ? Object.fromEntries(Object.entries(restoredSession.optionOrders).map(([key, order]) => [key, [...order]]))
      : Object.fromEntries(examQuestions.map((question) => [questionKey(question), question.options.map((option) => option.id)]))
    examAnswers = restoredSession.answers
    examIndex = restoredSession.index
    examStartedAt = restoredSession.startedAt
    examAttemptId = restoredSession.attemptId
    examRecorded = false
  } else if (storedSession?.view === initialView) {
    clearStoredSession(sessionKey)
  }

  const currentPractice = () => practiceQuestions[practiceIndex]
  const saveCurrentPracticeSession = () => {
    if (mode !== 'practice' || initialView === 'mock' || !currentPractice()) return
    writeStoredSession({
      version: 1,
      kind: 'practice',
      bankKey,
      bankSignature,
      view: initialView,
      questionKeys: practiceQuestions.map(questionKey),
      index: practiceIndex,
      selectedAnswer: selectedAnswer ?? null,
      checked,
      explanationOpen,
      chapterNo: initialView === 'chapter' || initialView === 'wrong' ? Number(chapterNo) || null : null,
      chapterOrder,
      settingsCollapsed,
      updatedAt: Date.now(),
    }, sessionKey)
  }
  const saveCurrentMockSession = () => {
    if (mode !== 'mock' || examQuestions.length !== 100 || !examStartedAt) return
    writeStoredSession({
      version: 1,
      kind: 'mock',
      bankKey,
      bankSignature,
      view: 'mock',
      questionKeys: examQuestions.map(questionKey),
      index: examIndex,
      answers: { ...examAnswers },
      optionOrders: Object.fromEntries(Object.entries(examOptionOrders).map(([key, order]) => [key, [...order]])),
      attemptId: examAttemptId,
      startedAt: examStartedAt,
      updatedAt: Date.now(),
    }, sessionKey)
  }
  const savePractice = () => {
    const current = currentPractice()
    const isCorrect = selectedAnswer === current.answer
    writeHistory(recordPracticeAnswer(readCurrentHistory(), {
      key: questionKey(current),
      chapter: current.chapter_no,
      correct: isCorrect,
    }), historyKey)
  }
  const saveExam = () => {
    if (examRecorded) return
    const history = readCurrentHistory()
    if (history.recordedExamIds.includes(examAttemptId)) { examRecorded = true; return }
    const chapters = Array.from({ length: 10 }, (_, index) => index + 1).map((chapter) => {
      const chapterQuestions = examQuestions.filter((question) => question.chapter_no === chapter)
      return {
        chapter,
        total: chapterQuestions.length,
        answered: chapterQuestions.filter((question) => Boolean(examAnswers[questionKey(question)])).length,
        correct: chapterQuestions.filter((question) => examAnswers[questionKey(question)] === question.answer).length,
      }
    })
    writeHistory(recordMockAttempt(history, {
      attemptId: examAttemptId,
      completedAt: Date.now(),
      bankKey,
      chapters,
      questionResults: examQuestions.map((question) => {
        const key = questionKey(question)
        const sourceQuestion = historicalQuestionsByBank[bankKey]?.get(key)
        const displayedSelectedOptionId = examAnswers[key] ?? null
        const optionOrder = examOptionOrders[key] ?? [...OPTION_LABELS]
        const sourceOptionId = (displayedOptionId: string | null) => displayedOptionId
          ? optionOrder[OPTION_LABELS.indexOf(displayedOptionId as typeof OPTION_LABELS[number])]
          : null
        const selectedOptionId = sourceOptionId(displayedSelectedOptionId)
        const correctOptionId = sourceOptionId(question.answer)
        return {
          key,
          chapter: question.chapter_no,
          answered: Boolean(displayedSelectedOptionId),
          correct: Boolean(displayedSelectedOptionId) && displayedSelectedOptionId === question.answer,
          questionFingerprint: sourceQuestion ? historicalQuestionFingerprint(sourceQuestion) : undefined,
          selectedOptionId,
          displayedSelectedOptionId,
          correctOptionId: correctOptionId ?? question.answer,
          displayedCorrectOptionId: question.answer,
        }
      }),
    }), historyKey)
    examRecorded = true
  }
  const stopTimer = () => { if (timerId !== undefined) clearInterval(timerId); timerId = undefined }
  const renderHeader = () => renderPrimaryHeader({ routes, mockEnabled, bankLabel: options.bankLabel })
  const renderOptions = (question: Question, answer?: string, reveal = false) => `<div class="options">${question.options.map((option) => {
    const selected = answer === option.id
    const correctness = reveal ? (option.id === question.answer ? ' is-correct' : selected ? ' is-wrong' : '') : selected ? ' is-selected' : ''
    return `<button type="button" class="option${correctness}" data-option="${escapeHtml(option.id)}" aria-pressed="${selected}"><b>${escapeHtml(option.id)}</b><span>${escapeHtml(option.text)}</span></button>`
  }).join('')}</div>`
  const renderExplanation = (question: Question, action = 'toggle-explanation', open = explanationOpen) => question.law_reference ? `${button(action, open ? '收合詳解' : '查看詳解')} ${open ? `<aside class="explanation">${escapeHtml(question.law_reference)}</aside>` : ''}` : ''
  const renderAnswerComparison = (selectedLabel: string | null, selectedText: string | null, correctLabel: string, correctText: string) => `<dl class="answer-comparison" aria-label="作答與正確答案比較"><div class="answer-comparison-row selected-answer" data-answer-kind="selected"><dt>你的作答</dt><dd>${selectedLabel && selectedText ? `<b>${escapeHtml(selectedLabel)}</b><span>${escapeHtml(selectedText)}</span>` : '<strong>未作答</strong>'}</dd></div><div class="answer-comparison-row correct-answer" data-answer-kind="correct"><dt>正確答案</dt><dd><b>${escapeHtml(correctLabel)}</b><span>${escapeHtml(correctText)}</span></dd></div></dl>`
  const renderHistoricalMistakes = (attempt: MockAttemptSummary) => {
    if (attempt.mistakes === undefined) return '<section class="attempt-review"><h4>該次錯誤題目回顧</h4><p class="history-detail-note">舊紀錄未保存逐題作答，章節統計仍可正常查看。</p></section>'
    if (!attempt.mistakes.length) return '<section class="attempt-review"><h4>該次錯誤題目回顧</h4><p class="history-detail-note success">本次沒有錯誤或未作答題目。</p></section>'
    const bankQuestions = historicalQuestionsByBank[attempt.bankKey]
    return `<section class="attempt-review"><h4>該次錯誤題目回顧</h4><p class="history-detail-note">共 ${attempt.mistakes.length} 題答錯或未作答；以下依當次錯題順序列出。</p><div class="attempt-mistake-list">${attempt.mistakes.map((mistake) => {
      const question = bankQuestions?.get(mistake.key)
      if (!question || mistake.questionFingerprint !== historicalQuestionFingerprint(question)) return `<article class="attempt-mistake" data-attempt-mistake data-question-key="${escapeHtml(mistake.key)}"><p class="feedback error">題庫目前無法載入或內容已更新，這一題無法安全還原。</p></article>`
      const selectedText = mistake.selectedOptionId ? question.options.find((option) => option.id === mistake.selectedOptionId)?.text ?? null : null
      const correctText = question.options.find((option) => option.id === mistake.correctOptionId)?.text
      if ((mistake.selectedOptionId && !selectedText) || !correctText) return `<article class="attempt-mistake" data-attempt-mistake data-question-key="${escapeHtml(mistake.key)}"><p class="feedback error">題庫選項已更新，這一題目前無法安全還原。</p></article>`
      const annotation = annotationsByKey.get(mistake.key)
      return `<article class="attempt-mistake" data-attempt-mistake data-question-key="${escapeHtml(mistake.key)}"><p class="eyebrow">第 ${question.chapter_no} 章・題庫第 ${question.question_no} 題・${mistake.selectedOptionId ? '✗ 答錯' : '— 未作答'}</p>${renderQuestionAnnotation(annotation)}<h5>${escapeHtml(annotateQuestionText(question, annotation))}</h5>${renderAnswerComparison(mistake.displayedSelectedOptionId, selectedText, mistake.displayedCorrectOptionId, correctText)}<aside class="explanation"><strong>說明</strong><p>${escapeHtml(question.law_reference ?? '此題庫未提供說明。')}</p></aside></article>`
    }).join('')}</div></section>`
  }
  const renderQuestionAnnotation = (annotation?: QuestionAnnotation) => annotation
    ? `<aside class="question-annotation ${annotation.type}" data-annotation-type="${annotation.type}" role="note"><strong>${annotation.type === 'ignore' ? '此題可忽略' : '題目文字提示'}</strong><p>${escapeHtml(annotation.message)}</p></aside>`
    : ''
  const chapterOptions = () => `<option value="">請選擇章節</option>${[...new Map(questions.map((q) => [q.chapter_no, q.chapter_title])).entries()].map(([number, title]) => `<option value="${number}" ${String(number) === chapterNo ? 'selected' : ''}>第 ${number} 章・${escapeHtml(title)}</option>`).join('')}`
  const chapterControls = () => `<label>選擇章節<select data-action="chapter-select">${chapterOptions()}</select></label><label>出題順序<select data-action="chapter-order"><option value="random" ${chapterOrder === 'random' ? 'selected' : ''}>隨機出題</option><option value="sequential" ${chapterOrder === 'sequential' ? 'selected' : ''}>依題號順序</option></select></label>`
  const renderChapterSelect = () => {
    root.innerHTML = `${renderHeader()}<main class="single-column"><section class="card"><p class="eyebrow">Chapter Practice</p><h1>章節練習</h1>${chapterControls()}</section></main>`
    bind()
  }
  const renderMockHistory = () => {
    const history = readCurrentHistory()
    if (!history.mockAttempts.length) {
      return '<section class="card history-panel"><p class="eyebrow">Local History</p><h2>歷史模擬考表現</h2><p>尚無模擬考紀錄。完成並交卷後，會在此保存各章結果分布與錯題回顧所需的最小選項識別；不會保存完整題目、四個選項或整份題序。</p></section>'
    }
    const aggregate = aggregateMockChapterPerformance(history)
    const attempts = [...history.mockAttempts].reverse()
    return `<section class="card history-panel"><div class="history-heading"><div><p class="eyebrow">Local History</p><h2>歷史模擬考表現</h2><p>共 ${history.mockAttempts.length} 次模擬考；紀錄只保存在此瀏覽器。</p></div>${button('clear-mock-history', '清除模擬考紀錄', '', 'destructive-outline-button')}</div>${confirmingClearMockHistory ? `<div class="confirm" role="alert"><p>確定清除所有模擬考結果分布？錯題與累計作答不受影響。</p><div class="action-group">${button('confirm-clear-mock-history', '確認清除', '', 'destructive-button')}${button('cancel-clear-mock-history', '取消', '', 'secondary-button')}</div></div>` : ''}<h3>歷次合計章節正確率</h3><div class="performance-grid">${aggregate.map((item) => `<article class="performance-card"><strong>第 ${item.chapter} 章</strong><span>${item.correct} / ${item.total} 題</span><b>${item.rate}%</b><progress data-mock-chapter-rate="${item.chapter}" max="100" value="${item.rate}" aria-label="第 ${item.chapter} 章歷次正確率 ${item.rate}%"></progress></article>`).join('')}</div><h3>每次模擬考結果</h3><div class="attempt-list">${attempts.map((attempt) => `<details class="attempt-card"><summary><span>${escapeHtml(new Date(attempt.completedAt).toLocaleString('zh-TW'))}・${attempt.bankKey === 'withLaw' ? '有詳解題庫' : '只有答案題庫'}</span><strong>${attempt.correct} / ${attempt.total}（${Math.round(attempt.correct / attempt.total * 100)}%）</strong></summary><div class="performance-grid compact">${attempt.chapters.map((chapter) => { const chapterRate = Math.round(chapter.correct / chapter.total * 100); return `<article class="performance-card"><strong>第 ${chapter.chapter} 章</strong><span>${chapter.correct} / ${chapter.total} 題</span><b>${chapterRate}%</b><progress max="100" value="${chapterRate}" aria-label="第 ${chapter.chapter} 章本次正確率 ${chapterRate}%"></progress></article>` }).join('')}</div>${renderHistoricalMistakes(attempt)}</details>`).join('')}</div></section>`
  }
  const renderMockStart = () => {
    root.innerHTML = `${renderHeader()}<main class="single-column"><section class="card"><p class="eyebrow">Mock Exam</p><h1>120 分鐘模擬考</h1><p>系統會從第 1 至第 10 章，每章各隨機抽取 10 題，共 100 題；經實際課程註記為「可忽略」的題目不納入抽題。每次開始模擬考都會重新抽題並隨機重排 A、B、C、D 選項，正確答案會同步調整；作答時間為 120 分鐘，交卷後可查看各章統計與逐題答案。</p>${button('start-mock', '開始模擬考', mockError ? 'disabled' : '')}${mockError ? `<p class="feedback error" role="alert">${escapeHtml(mockError)}</p>` : ''}</section>${renderMockHistory()}</main>`
    bind()
  }
  const renderPractice = () => {
    const current = currentPractice()
    if (!current) {
      clearStoredSession(sessionKey)
      root.innerHTML = `${renderHeader()}<section class="card"><h1>${practiceLabel}</h1><p>此題組已完成。請重新選擇練習方式。</p>${button('start-all-practice', '重新開始全題庫練習')}</section>`
      bind()
      return
    }
    const settingsTitle = initialView === 'chapter' ? '章節設定' : '練習設定'
    const settingsSummary = initialView === 'chapter'
      ? `第 ${chapterNo} 章・${chapterOrder === 'sequential' ? '依題號順序' : '隨機出題'}`
      : initialView === 'wrong' ? '錯題練習' : '全題庫・隨機出題'
    const controls = initialView === 'chapter'
      ? chapterControls()
      : initialView === 'wrong'
        ? button('return-wrong-review', '返回錯題回顧')
      : `${button('start-all-practice', '重新隨機排序')} <a class="button" href="${escapeHtml(routes.wrong)}">錯題回顧</a>`
    const toggleVerb = settingsCollapsed ? '展開' : '收合'
    const annotation = annotationsByKey.get(questionKey(current))
    root.innerHTML = `${renderHeader()}<main class="app-shell"><aside class="control-panel settings-panel${settingsCollapsed ? ' is-collapsed' : ''}"><div class="settings-heading"><div><h2>${settingsTitle}</h2><p class="settings-summary">${escapeHtml(settingsSummary)}</p></div><button type="button" class="settings-toggle" data-action="toggle-settings" aria-label="${toggleVerb}${settingsTitle}" aria-expanded="${!settingsCollapsed}" aria-controls="practice-settings"><span data-settings-toggle-label>${toggleVerb}</span><span aria-hidden="true">${settingsCollapsed ? '＋' : '−'}</span></button></div><div id="practice-settings" class="settings-body" ${settingsCollapsed ? 'hidden' : ''}>${controls}</div></aside><section class="card question-card" data-question-key="${questionKey(current)}" data-question-number="${practiceIndex + 1}"><p class="eyebrow">${escapeHtml(practiceLabel)}・第 ${practiceIndex + 1} / ${practiceQuestions.length} 題</p>${renderQuestionAnnotation(annotation)}<h1>${escapeHtml(annotateQuestionText(current, annotation))}</h1>${renderOptions(current, selectedAnswer, checked)}${checked ? `<p class="feedback ${selectedAnswer === current.answer ? 'success' : 'error'}" data-answer-feedback role="status" tabindex="-1">${selectedAnswer === current.answer ? '答對了！' : '答錯了。'} 正確答案：${escapeHtml(current.answer)}</p>${renderExplanation(current)}</p>${button('next-practice', practiceIndex + 1 < practiceQuestions.length ? '下一題' : '完成本輪')}</p>` : `<div class="action-group">${button('check-practice', '檢查答案', selectedAnswer ? '' : 'disabled')}</div>`}</section></main>`
    bind()
  }
  const renderMock = () => {
    const current = examQuestions[examIndex]
    const annotation = annotationsByKey.get(questionKey(current))
    const unanswered = examQuestions.filter((question) => !examAnswers[questionKey(question)]).length
    root.innerHTML = `${renderHeader()}<main class="app-shell"><aside class="control-panel"><h2>模擬考</h2><p class="timer" data-timer>${formatRemaining(remainingSeconds(examStartedAt, Date.now()))}</p><p>已答 ${examQuestions.length - unanswered} / 100</p>${button('submit-mock', '交卷')}${confirmingSubmit ? `<div class="confirm" role="alert"><p>尚有 ${unanswered} 題未作答</p><div class="action-group">${button('confirm-submit-mock', '確認交卷')}${button('cancel-submit-mock', '繼續作答', '', 'secondary-button')}</div></div>` : ''}</aside><section class="card question-card" data-question-key="${questionKey(current)}" data-question-number="${examIndex + 1}"><p class="eyebrow">第 ${examIndex + 1} / 100 題・第 ${current.chapter_no} 章</p>${renderQuestionAnnotation(annotation)}<h1>${escapeHtml(annotateQuestionText(current, annotation))}</h1>${renderOptions(current, examAnswers[questionKey(current)])}<nav class="pager">${button('mock-prev', '上一題', examIndex ? '' : 'disabled')}${button('mock-next', '下一題', examIndex < 99 ? '' : 'disabled')}</nav><div class="exam-map" aria-label="試題導覽">${examQuestions.map((question, index) => `<button type="button" data-exam-index="${index}" class="${examAnswers[questionKey(question)] ? 'answered' : ''}" aria-label="第 ${index + 1} 題">${index + 1}</button>`).join('')}</div></section></main>`
    bind()
  }
  const renderResult = () => {
    const correct = examQuestions.filter((question) => examAnswers[questionKey(question)] === question.answer).length
    const byChapter = Array.from({ length: 10 }, (_, index) => index + 1).map((chapter) => ({ chapter, total: examQuestions.filter((q) => q.chapter_no === chapter), correct: examQuestions.filter((q) => q.chapter_no === chapter && examAnswers[questionKey(q)] === q.answer).length }))
    root.innerHTML = `${renderHeader()}<main class="result-page"><section class="card results"><h1>模擬考成績</h1><p class="score">${correct} / 100 題（${correct}%）</p><a class="button secondary-button" href="${escapeHtml(routes.practice)}">返回練習首頁</a><h2>章節統計</h2><ul>${byChapter.map(({ chapter, total, correct: chapterCorrect }) => `<li>第 ${chapter} 章：${chapterCorrect} / ${total.length} 題正確</li>`).join('')}</ul><h2>逐題答案</h2>${examQuestions.map((question, index) => {
      const key = questionKey(question)
      const selected = examAnswers[key] ?? null
      const isCorrect = selected === question.answer
      const open = resultExplanations.has(key)
      const annotation = annotationsByKey.get(key)
      const selectedText = selected ? question.options.find((option) => option.id === selected)?.text ?? null : null
      const correctText = question.options.find((option) => option.id === question.answer)?.text ?? ''
      const comparison = isCorrect ? '' : renderAnswerComparison(selected, selectedText, question.answer, correctText)
      const status = isCorrect
        ? `你的答案：${selected}；正確答案：${question.answer}・✓ 正確`
        : selected ? '✗ 答錯' : '— 未作答'
      return `<article class="result-item" data-question-key="${key}"><p class="result-status">第 ${index + 1} 題・${status}</p>${renderQuestionAnnotation(annotation)}<h3>${escapeHtml(annotateQuestionText(question, annotation))}</h3>${comparison}${renderExplanation(question, 'toggle-result-explanation', open)}</article>`
    }).join('')}</section></main>`
    bind()
  }
  const renderReview = () => {
    const history = readCurrentHistory()
    const rate = history.answered ? Math.round(history.correct / history.answered * 100) : 0
    const chapterPerformance = chapterLearningPerformance(history, availableChapters)
    root.innerHTML = `${renderHeader()}<main class="single-column"><section class="card"><h1>錯題回顧</h1><p>作答紀錄僅保存在此瀏覽器。歷史答錯率會累計每次已作答結果；「目前錯題」則會在之後答對同題時解除。</p><dl><dt>累計作答</dt><dd>累計作答：${history.answered}</dd><dt>正確率</dt><dd>${rate}%</dd><dt>錯題</dt><dd>錯題數：${history.wrongKeys.length}</dd></dl><div class="action-group">${button('practice-wrongs', '練習全部錯題', history.wrongKeys.length ? '' : 'disabled')}${button('reset-history', '重設本機紀錄', '', 'destructive-button')}<a class="button secondary-button" href="${escapeHtml(routes.practice)}">返回練習</a></div></section><section class="card history-panel"><p class="eyebrow">Chapter Review</p><h2>各章錯誤狀況</h2><div class="wrong-chapter-grid">${chapterPerformance.map((item) => `<article class="wrong-chapter-card" data-wrong-chapter-summary="${item.chapter}"><h3>第 ${item.chapter} 章</h3><p>歷史答錯率 <strong>${item.wrongRate}%</strong>（${item.wrong} / ${item.answered}）</p><progress max="100" value="${item.wrongRate}" aria-label="第 ${item.chapter} 章歷史答錯率 ${item.wrongRate}%"></progress><p>目前錯題 <strong>${item.currentWrong} 題</strong></p>${button('practice-wrong-chapter', `練習第 ${item.chapter} 章錯題`, `data-wrong-chapter="${item.chapter}" ${item.currentWrong ? '' : 'disabled'}`)}</article>`).join('')}</div></section></main>`
    bind()
  }
  const render = () => { if (mode === 'chapter-select') renderChapterSelect(); else if (mode === 'mock-start') renderMockStart(); else if (mode === 'mock') renderMock(); else if (mode === 'result') renderResult(); else if (mode === 'review') renderReview(); else renderPractice() }
  const loadChapterPractice = () => {
    if (!chapterNo) { mode = 'chapter-select'; render(); return }
    mode = 'practice'
    practiceLabel = `第 ${chapterNo} 章${chapterOrder === 'sequential' ? '依題號順序' : '隨機'}練習`
    practiceQuestions = selectQuestions(questions, { chapterNo: Number(chapterNo), count: questions.length, order: chapterOrder })
    practiceIndex = 0
    selectedAnswer = undefined
    checked = false
    explanationOpen = false
    settingsCollapsed = true
    saveCurrentPracticeSession()
    render()
  }
  const startWrongPractice = (selectedChapter?: number) => {
    const wrongKeys = readCurrentHistory().wrongKeys
    const matchingKeys = wrongKeys.filter((key) => !selectedChapter || key.startsWith(`c${selectedChapter}-`))
    chapterNo = selectedChapter ? String(selectedChapter) : ''
    practiceLabel = selectedChapter ? `第 ${selectedChapter} 章錯題練習` : '錯題練習'
    practiceQuestions = selectQuestions(questions, { count: questions.length, wrongKeys: matchingKeys })
      .filter((question) => matchingKeys.includes(questionKey(question)))
    practiceIndex = 0
    selectedAnswer = undefined
    checked = false
    explanationOpen = false
    settingsCollapsed = true
    mode = 'practice'
    saveCurrentPracticeSession()
    render()
  }
  const submitExam = () => {
    if (mode !== 'mock') return
    stopTimer()
    saveExam()
    clearStoredSession(sessionKey)
    confirmingSubmit = false
    mode = 'result'
    render()
  }
  const startMockTimer = () => {
    stopTimer()
    timerId = setInterval(() => {
      if (shouldAutoSubmit(remainingSeconds(examStartedAt, Date.now()))) submitExam()
      else {
        const timer = root.querySelector('[data-timer]')
        if (timer) timer.textContent = formatRemaining(remainingSeconds(examStartedAt, Date.now()))
      }
    }, 1000)
  }
  const bind = () => {
    initMobileMenu(root)
    root.querySelectorAll<HTMLButtonElement>('[data-option]').forEach((element) => element.addEventListener('click', () => {
      if (mode === 'result' || (mode === 'practice' && checked)) return
      if (mode === 'mock') {
        examAnswers[questionKey(examQuestions[examIndex])] = element.dataset.option!
        saveCurrentMockSession()
        render()
        return
      }
      selectedAnswer = element.dataset.option
      root.querySelectorAll<HTMLElement>('[data-option]').forEach((option) => {
        const isSelected = option === element
        option.classList.toggle('is-selected', isSelected)
        option.setAttribute('aria-pressed', String(isSelected))
      })
      const checkButton = root.querySelector<HTMLButtonElement>('[data-action="check-practice"]')
      if (checkButton) checkButton.disabled = false
      saveCurrentPracticeSession()
    }))
    root.querySelector<HTMLSelectElement>('[data-action="chapter-select"]')?.addEventListener('change', (event) => {
      chapterNo = (event.target as HTMLSelectElement).value
      loadChapterPractice()
    })
    root.querySelector<HTMLSelectElement>('[data-action="chapter-order"]')?.addEventListener('change', (event) => {
      chapterOrder = (event.target as HTMLSelectElement).value as ChapterOrder
      loadChapterPractice()
    })
    root.querySelectorAll<HTMLButtonElement>('[data-exam-index]').forEach((element) => element.addEventListener('click', () => {
      examIndex = Number(element.dataset.examIndex)
      confirmingSubmit = false
      saveCurrentMockSession()
      render()
    }))
    root.querySelectorAll<HTMLElement>('[data-action]').forEach((element) => element.addEventListener('click', () => {
      const action = element.dataset.action

      if (action === 'toggle-settings') {
        settingsCollapsed = !settingsCollapsed
        const settings = root.querySelector<HTMLElement>('#practice-settings')
        const panel = root.querySelector<HTMLElement>('.settings-panel')
        const label = element.querySelector<HTMLElement>('[data-settings-toggle-label]')
        const title = initialView === 'chapter' ? '章節設定' : '練習設定'
        const verb = settingsCollapsed ? '展開' : '收合'
        if (settings) settings.hidden = settingsCollapsed
        panel?.classList.toggle('is-collapsed', settingsCollapsed)
        element.setAttribute('aria-expanded', String(!settingsCollapsed))
        element.setAttribute('aria-label', `${verb}${title}`)
        if (label) label.textContent = verb
        const icon = element.querySelector<HTMLElement>('[aria-hidden="true"]')
        if (icon) icon.textContent = settingsCollapsed ? '＋' : '−'
        saveCurrentPracticeSession()
        return
      }
      if (action === 'start-all-practice') { stopTimer(); mode = 'practice'; practiceLabel = '全題庫隨機練習'; practiceQuestions = selectQuestions(questions, { count: questions.length }); practiceIndex = 0; selectedAnswer = undefined; checked = false; explanationOpen = false; settingsCollapsed = true; saveCurrentPracticeSession(); render() }
      if (action === 'clear-mock-history') { confirmingClearMockHistory = true; render() }
      if (action === 'cancel-clear-mock-history') { confirmingClearMockHistory = false; render() }
      if (action === 'confirm-clear-mock-history') {
        writeHistory(clearMockAttempts(readCurrentHistory()), historyKey)
        confirmingClearMockHistory = false
        render()
      }

      if (action === 'check-practice' && selectedAnswer) {
        checked = true
        settingsCollapsed = true
        savePractice()
        saveCurrentPracticeSession()
        render()
        const feedback = root.querySelector<HTMLElement>('[data-answer-feedback]')
        if (feedback && typeof feedback.scrollIntoView === 'function') feedback.scrollIntoView({ block: 'nearest' })
      }
      if (action === 'next-practice' && checked) { practiceIndex += 1; selectedAnswer = undefined; checked = false; explanationOpen = false; saveCurrentPracticeSession(); render() }
      if (action === 'toggle-explanation') { explanationOpen = !explanationOpen; saveCurrentPracticeSession(); render() }
      if (action === 'start-mock') {
        try {
          const shuffledQuestions = buildMockExam(questions, Math.random, ignoredKeys)
            .map((question) => ({ key: questionKey(question), ...shuffleQuestionOptions(question, Math.random) }))
          examQuestions = shuffledQuestions.map((item) => item.question)
          examOptionOrders = Object.fromEntries(shuffledQuestions.map((item) => [item.key, item.optionOrder]))
          examAnswers = {}
          examIndex = 0
          examStartedAt = Date.now()
          examAttemptId = `attempt-${typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`
          examRecorded = false
          confirmingSubmit = false
          resultExplanations.clear()
          mockError = ''
          mode = 'mock'
          saveCurrentMockSession()
          startMockTimer()
          render()
        } catch (error) {
          mockError = error instanceof Error ? error.message : '題庫資料不足，無法建立模擬考。'
          mode = 'practice'
          render()
        }
      }
      if (action === 'mock-prev') { examIndex = Math.max(0, examIndex - 1); saveCurrentMockSession(); render() }
      if (action === 'mock-next') { examIndex = Math.min(99, examIndex + 1); saveCurrentMockSession(); render() }
      if (action === 'submit-mock') {
        const unanswered = examQuestions.filter((question) => !examAnswers[questionKey(question)]).length
        if (unanswered) { confirmingSubmit = true; render() } else submitExam()
      }
      if (action === 'cancel-submit-mock') { confirmingSubmit = false; render() }
      if (action === 'confirm-submit-mock') submitExam()
      if (action === 'toggle-result-explanation') {
        const key = element.closest<HTMLElement>('.result-item')?.dataset.questionKey
        if (!key) return
        if (resultExplanations.has(key)) resultExplanations.delete(key); else resultExplanations.add(key)
        render()
      }
      if (action === 'practice-wrongs') startWrongPractice()
      if (action === 'practice-wrong-chapter') startWrongPractice(Number(element.dataset.wrongChapter))
      if (action === 'return-wrong-review') { clearStoredSession(sessionKey); mode = 'review'; render() }
      if (action === 'reset-history') { clearHistory(historyKey); render() }
    }))
  }
  render()
  saveCurrentPracticeSession()
  if (mode === 'mock') {
    if (shouldAutoSubmit(remainingSeconds(examStartedAt, Date.now()))) submitExam()
    else startMockTimer()
  }
}
