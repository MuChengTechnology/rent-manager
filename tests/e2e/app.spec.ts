import { expect, test } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const rootPath = '/'
const homePath = '/init/'
const practicePath = '/init/practice/'
const chapterPath = '/init/practice/chapter/'
const mockPath = '/init/mock/'
const wrongPath = '/init/wrong/'
const aboutPath = '/about/'
const withLawUrl = '/data/questions_with_law.json'
const withoutLawUrl = '/data/questions_without_law.json'
const annotationsUrl = '/data/question_annotations.json'

async function openPrimaryNavigation(page: import('@playwright/test').Page): Promise<void> {
  const menu = page.locator('[data-action="toggle-mobile-menu"]')
  if (await menu.isVisible()) {
    await expect(menu).toHaveAttribute('aria-label', '開啟選單')
    await expect(page.getByRole('navigation', { name: '主要導覽' })).toBeHidden()
    await menu.click()
    await expect(menu).toHaveAttribute('aria-expanded', 'true')
    await expect(menu).toHaveAttribute('aria-label', '關閉選單')
    await expect(page.getByRole('navigation', { name: '主要導覽' })).toBeVisible()
  }
}

async function selectBankAtEntry(page: import('@playwright/test').Page, label = '有詳解題庫'): Promise<void> {
  await page.goto(homePath)
  await page.getByRole('button', { name: label }).click()
  await expect(page).toHaveURL(practicePath)
  await expect(page.locator('[data-question-key]')).toBeVisible()
}

test('問題回報使用同頁浮出表單，送出失敗時只提示未送出且不暴露設定細節', async ({ page, context }) => {
  await page.goto(aboutPath)
  const pagesBefore = context.pages().length
  await page.getByRole('button', { name: '開啟問題回報表單' }).click()

  const dialog = page.getByRole('dialog', { name: '問題回報' })
  await expect(dialog).toBeVisible()
  await expect(page).toHaveURL(aboutPath)
  expect(context.pages()).toHaveLength(pagesBefore)
  await expect(dialog.getByLabel('問題類型')).toBeVisible()
  await expect(dialog.getByLabel('題庫類型')).toBeVisible()
  await expect(dialog.getByLabel('題庫類型')).toHaveValue('')
  await expect(dialog.getByLabel('題庫版本')).toBeVisible()
  await expect(dialog.getByLabel('題目出現於')).toBeVisible()
  await expect(dialog.getByLabel('題目出現於').getByRole('option')).toHaveCount(5)
  await expect(dialog.getByLabel('章節（選填）')).toBeVisible()
  await expect(dialog.getByLabel('章節（選填）').getByRole('option')).toHaveCount(11)
  await expect(dialog.getByLabel('第幾題（選填）')).toBeVisible()
  await expect(dialog.locator('[name="questionId"]')).toBeHidden()
  await expect(dialog.getByLabel('您的稱呼')).toBeVisible()
  await expect(dialog.getByLabel('您的 Email')).toBeVisible()
  await expect(dialog.getByLabel('問題描述')).toBeVisible()
  await expect(dialog.getByLabel('附圖（選填）')).toHaveAttribute('accept', 'image/png,image/jpeg,image/webp')
  await expect(dialog.getByText('最大 1 MiB')).toBeVisible()
  const submit = dialog.getByRole('button', { name: '送出回報' })
  await expect(submit).toBeEnabled()
  await expect(dialog.getByText(/site key/i)).toHaveCount(0)
  await dialog.getByLabel('問題類型').selectOption('other')
  await dialog.getByLabel('題庫類型').selectOption('init')
  await dialog.getByLabel('您的稱呼').fill('測試使用者')
  await dialog.getByLabel('您的 Email').fill('test@example.com')
  await dialog.getByLabel('問題描述').fill('這是一段足夠長的測試問題描述。')
  await dialog.getByLabel(/我確認回報內容/).check()
  await submit.click()
  await expect(dialog.getByRole('alert')).toContainText('回報未送出')
  await expect(dialog.getByRole('alert')).not.toContainText(/site key|Turnstile/i)
  await expect(dialog.getByRole('link', { name: 'GitHub Issues' })).toHaveAttribute('href', 'https://github.com/MuChengTechnology/rent-manager/issues/new')
  await dialog.getByRole('button', { name: '取消' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('button', { name: '開啟問題回報表單' })).toBeFocused()
});

test('入口選擇題庫後進入全題練習，Header 可返回入口重新選擇', async ({ page }) => {
  await page.goto(homePath)
  await expect(page.getByRole('heading', { name: '選擇題庫版本' })).toBeVisible()
  await page.getByRole('button', { name: '有詳解題庫' }).click()

  await expect(page).toHaveURL(practicePath)
  await expect(page.locator('.brand-home')).toContainText('租賃住宅管理人員證照題庫練習')
  await expect(page.locator('.hamburger-line')).toHaveCount(3)
  await expect(page.getByRole('link', { name: '返回入口' })).toHaveAttribute('href', homePath)
  await openPrimaryNavigation(page)
  await expect(page.getByRole('link', { name: '更換題庫版本' })).toHaveAttribute('href', homePath)
  await expect(page.getByRole('link', { name: '關於本站' })).toHaveAttribute('href', aboutPath)
  await expect(page.locator('.brand small')).toContainText('目前：初訓・有詳解題庫')

  await page.reload()
  await expect(page).toHaveURL(practicePath)
  await expect(page.locator('.brand small')).toContainText('目前：初訓・有詳解題庫')
  await expect(page.locator('[data-question-key]')).toBeVisible()

  await openPrimaryNavigation(page)
  await page.getByRole('link', { name: '更換題庫版本' }).click()
  await expect(page).toHaveURL(homePath)
  await expect(page.getByRole('heading', { name: '選擇題庫版本' })).toBeVisible()
})

test('入口可繼續上次中斷練習，reload 保留檢查狀態且可放棄進度', async ({ page }) => {
  await page.goto(homePath)
  await expect(page.getByRole('link', { name: '繼續上次練習' })).toHaveCount(0)
  await page.getByRole('button', { name: '有詳解題庫' }).click()
  const key = await page.locator('[data-question-key]').getAttribute('data-question-key')
  await page.locator('[data-option="B"]').click()
  await page.locator('[data-action="check-practice"]').click()

  await page.reload()
  await expect(page.locator('[data-question-key]')).toHaveAttribute('data-question-key', key!)
  await expect(page.getByText('正確答案：')).toBeVisible()

  await page.goto(homePath)
  await expect(page.getByRole('link', { name: '繼續上次練習' })).toBeVisible()
  await expect(page.getByText('全題庫隨機練習')).toBeVisible()
  await expect(page.getByText(/第 1 \/ \d+ 題/)).toBeVisible()
  await page.getByRole('link', { name: '繼續上次練習' }).click()
  await expect(page).toHaveURL(practicePath)
  await expect(page.locator('[data-question-key]')).toHaveAttribute('data-question-key', key!)
  await expect(page.getByText('正確答案：')).toBeVisible()

  await page.goto(homePath)
  await page.getByRole('button', { name: '放棄這次進度' }).click()
  await expect(page.getByRole('link', { name: '繼續上次練習' })).toHaveCount(0)
})

test('入口遇到損壞的中斷資料時安全忽略', async ({ page }) => {
  await page.goto(homePath)
  await page.evaluate(() => localStorage.setItem('rent-exam-session-v1', '{broken'))
  await page.reload()

  await expect(page.getByRole('heading', { name: '選擇題庫版本' })).toBeVisible()
  await expect(page.getByRole('link', { name: '繼續上次練習' })).toHaveCount(0)
})

test('根目錄實際整合離線狀態提示，使用同步的三秒倒數進度條', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {
      getRegistration: async () => undefined,
      register: async () => ({ active: {} }),
    } })
  })
  await page.goto(homePath)
  const notice = page.locator('[data-offline-notice]')
  await expect(notice).toHaveAttribute('data-state', 'ready')
  await expect(notice).toBeVisible()

  const progress = notice.locator('.offline-toast-progress')
  await expect(progress).toHaveCSS('animation-duration', '3s')
  await expect(progress).not.toHaveCSS('animation-name', 'none')
})

test('手機題目設定可收合，檢查答案後結果留在 viewport', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', '手機 UX 專屬驗證')
  await selectBankAtEntry(page)
  const toggle = page.locator('[data-action="toggle-settings"]')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(toggle).toHaveAttribute('aria-label', '展開練習設定')
  await expect(page.locator('#practice-settings')).toBeHidden()
  await expect(page.locator('.settings-summary')).toContainText('全題庫・隨機出題')

  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('#practice-settings')).toBeVisible()
  await page.locator('[data-option="B"]').click()
  await page.locator('[data-action="check-practice"]').click()

  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator('#practice-settings')).toBeHidden()
  const feedback = page.locator('[data-answer-feedback]')
  await expect(feedback).toBeVisible()
  const feedbackBox = await feedback.boundingBox()
  const viewport = page.viewportSize()!
  expect(feedbackBox).not.toBeNull()
  expect(feedbackBox!.y).toBeGreaterThanOrEqual(0)
  expect(feedbackBox!.y + feedbackBox!.height).toBeLessThanOrEqual(viewport.height)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('手機主要導覽與模擬考題號均有 44×44 點擊範圍', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', '手機 UX 專屬驗證')
  await selectBankAtEntry(page)
  await openPrimaryNavigation(page)
  for (const link of await page.getByRole('navigation', { name: '主要導覽' }).getByRole('link').all()) {
    const box = await link.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
  }

  await page.goto(mockPath)
  await page.getByRole('button', { name: '開始模擬考' }).click()
  for (const item of await page.locator('[data-exam-index]').all()) {
    const box = await item.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('章節練習使用獨立路由並在選章後顯示該章題目', async ({ page }) => {
  await selectBankAtEntry(page)
  await openPrimaryNavigation(page)
  await page.getByRole('link', { name: '章節練習' }).click()

  await expect(page).toHaveURL(chapterPath)
  await expect(page.getByRole('heading', { name: '章節練習' })).toBeVisible()
  await page.locator('[data-action="chapter-select"]').selectOption('1')
  await expect(page.getByText('第 1 章隨機練習').first()).toBeVisible()
  await expect(page.locator('[data-question-key]')).toBeVisible()
  await expect(page.locator('[data-action="start-chapter-practice"]')).toHaveCount(0)
  await expect(page.locator('.control-panel').getByRole('link', { name: '錯題回顧' })).toHaveCount(0)

  await page.locator('[data-action="toggle-settings"]').click()
  await expect(page.locator('[data-action="chapter-order"]')).toHaveValue('random')
  await page.locator('[data-action="chapter-order"]').selectOption('sequential')
  await expect(page.getByText('第 1 章依題號順序練習').first()).toBeVisible()
  await expect(page.locator('[data-question-key]')).toHaveAttribute('data-question-key', 'c1-s1-q1')
  await page.locator('[data-option]').first().click()
  await page.locator('[data-action="check-practice"]').click()
  await page.locator('[data-action="next-practice"]').click()
  await expect(page.locator('[data-question-key]')).toHaveAttribute('data-question-key', 'c1-s1-q2')
  await page.locator('[data-option]').first().click()
  await page.locator('[data-action="check-practice"]').click()
  await page.locator('[data-action="toggle-explanation"]').click()
  await expect(page.locator('.explanation')).toBeVisible()

  await page.locator('[data-action="toggle-settings"]').click()
  await page.locator('[data-action="chapter-select"]').selectOption('2')
  await expect(page.getByText('第 2 章依題號順序練習').first()).toBeVisible()
  await expect(page.locator('[data-question-key]')).toHaveAttribute('data-question-key', 'c2-s1-q1')
  await expect(page.getByText(/第 1 \/ \d+ 題/).first()).toBeVisible()
  await expect(page.locator('.option.is-selected')).toHaveCount(0)
  await expect(page.locator('[data-action="check-practice"]')).toBeDisabled()
  await expect(page.locator('.explanation')).toHaveCount(0)
})

test('模擬考使用獨立路由且交卷後可返回練習首頁', async ({ page }) => {
  await selectBankAtEntry(page)
  await openPrimaryNavigation(page)
  await page.getByRole('link', { name: '模擬考' }).click()

  await expect(page).toHaveURL(mockPath)
  await expect(page.getByRole('heading', { name: '120 分鐘模擬考' })).toBeVisible()
  await expect(page.getByText('第 1 至第 10 章，每章各隨機抽取 10 題，共 100 題')).toBeVisible()
  await expect(page.getByText('每次開始模擬考都會重新抽題')).toBeVisible()
  await page.getByRole('button', { name: '開始模擬考' }).click()
  await expect(page.getByText('第 1 / 100 題')).toBeVisible()
  await page.getByRole('button', { name: '交卷' }).click()
  await page.getByRole('button', { name: '確認交卷' }).click()
  await expect(page.getByRole('heading', { name: '模擬考成績' })).toBeVisible()

  await page.getByRole('link', { name: '返回練習首頁' }).click()
  await expect(page).toHaveURL(practicePath)
  await expect(page.locator('[data-question-key]')).toBeVisible()
})

test('模擬考錯題於本次結果與歷史 attempt 顯示作答、正解及說明', async ({ page }) => {
  await selectBankAtEntry(page)
  await page.goto(mockPath)
  await page.getByRole('button', { name: '開始模擬考' }).click()

  const answer = await page.evaluate(async () => {
    const session = JSON.parse(localStorage.getItem('rent-exam-session-v1')!)
    const questions = await fetch('/data/questions_with_law.json').then((response) => response.json())
    const key = session.questionKeys[0]
    const question = questions.find((item: { chapter_no: number; section_no: number; question_no: number }) =>
      `c${item.chapter_no}-s${item.section_no}-q${item.question_no}` === key)
    const labels = ['A', 'B', 'C', 'D']
    const order = session.optionOrders[key] as string[]
    const correctDisplayed = labels[order.indexOf(question.answer)]
    const selectedDisplayed = labels.find((label) => label !== correctDisplayed)!
    const selectedSource = order[labels.indexOf(selectedDisplayed)]
    return {
      key,
      selectedDisplayed,
      selectedSource,
      selectedText: question.options.find((option: { id: string }) => option.id === selectedSource).text,
      correctDisplayed,
      correctSource: question.answer,
      correctText: question.options.find((option: { id: string }) => option.id === question.answer).text,
      explanation: question.law_reference,
    }
  })

  await page.locator(`[data-option="${answer.selectedDisplayed}"]`).click()
  await page.getByRole('button', { name: '交卷' }).click()
  await page.getByRole('button', { name: '確認交卷' }).click()

  const result = page.locator(`.result-item[data-question-key="${answer.key}"]`)
  await expect(result.locator('[data-answer-kind="selected"]')).toContainText(`你的作答${answer.selectedDisplayed}${answer.selectedText}`)
  await expect(result.locator('[data-answer-kind="correct"]')).toContainText(`正確答案${answer.correctDisplayed}${answer.correctText}`)
  await expect(result.locator('.explanation')).toContainText(answer.explanation)
  await expect(result.getByRole('button', { name: '查看詳解' })).toHaveCount(0)
  const resultGeometry = await page.evaluate(() => {
    const layout = document.querySelector<HTMLElement>('.result-page')!.getBoundingClientRect()
    const card = document.querySelector<HTMLElement>('.result-page .results')!.getBoundingClientRect()
    const comparison = document.querySelector<HTMLElement>('.result-page .answer-comparison-row')!
    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      layout: { left: layout.left, right: layout.right, width: layout.width },
      card: { left: card.left, right: card.right },
      comparisonColumns: getComputedStyle(comparison).gridTemplateColumns.split(' ').filter(Boolean).length,
    }
  })
  expect(resultGeometry.documentWidth).toBeLessThanOrEqual(resultGeometry.viewportWidth)
  expect(resultGeometry.layout.left).toBeGreaterThanOrEqual(-1)
  expect(resultGeometry.layout.right).toBeLessThanOrEqual(resultGeometry.viewportWidth + 1)
  expect(resultGeometry.card.left).toBeGreaterThanOrEqual(-1)
  expect(resultGeometry.card.right).toBeLessThanOrEqual(resultGeometry.viewportWidth + 1)
  if (resultGeometry.viewportWidth >= 760) {
    expect(resultGeometry.layout.width).toBeGreaterThan(800)
    expect(resultGeometry.layout.width).toBeLessThanOrEqual(921)
    expect(resultGeometry.comparisonColumns).toBe(2)
  } else {
    expect(resultGeometry.layout.width).toBeGreaterThanOrEqual(resultGeometry.viewportWidth - 1)
    expect(resultGeometry.comparisonColumns).toBe(1)
  }

  const storedMistake = await page.evaluate((key) => {
    const history = JSON.parse(localStorage.getItem('rent-exam-history-v1')!)
    return {
      attempt: history.mockAttempts[0],
      mistake: history.mockAttempts[0].mistakes.find((item: { key: string }) => item.key === key),
    }
  }, answer.key)
  expect(storedMistake.attempt).not.toHaveProperty('questionKeys')
  expect(storedMistake.mistake).toMatchObject({
    questionFingerprint: expect.stringMatching(/^q1-[0-9a-f]{8}$/),
    selectedOptionId: answer.selectedSource,
    displayedSelectedOptionId: answer.selectedDisplayed,
    correctOptionId: answer.correctSource,
    displayedCorrectOptionId: answer.correctDisplayed,
    sourceOptionOrder: expect.arrayContaining(['A', 'B', 'C', 'D']),
  })

  await page.goto(mockPath)
  await page.locator('.attempt-card summary').first().click()
  const historicalMistake = page.locator(`[data-attempt-mistake][data-question-key="${answer.key}"]`)
  await expect(historicalMistake).toContainText(`你的作答${answer.selectedDisplayed}${answer.selectedText}`)
  await expect(historicalMistake).toContainText(`正確答案${answer.correctDisplayed}${answer.correctText}`)
  await expect(historicalMistake.locator('.explanation')).toContainText(answer.explanation)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

  await page.goto(homePath)
  await page.getByRole('button', { name: '只有答案題庫' }).click()
  await page.goto(mockPath)
  await page.locator('.attempt-card summary').first().click()
  const crossBankMistake = page.locator(`[data-attempt-mistake][data-question-key="${answer.key}"]`)
  await expect(crossBankMistake.locator('.explanation')).toContainText(answer.explanation)
})

test('歷史題目同 key 但內容更新時安全降級，不混用新題庫與舊作答', async ({ page, context }) => {
  await selectBankAtEntry(page)
  await page.goto(mockPath)
  await page.getByRole('button', { name: '開始模擬考' }).click()
  const answer = await page.evaluate(async () => {
    const session = JSON.parse(localStorage.getItem('rent-exam-session-v1')!)
    const questions = await fetch('/data/questions_with_law.json').then((response) => response.json())
    const key = session.questionKeys[0]
    const question = questions.find((item: { chapter_no: number; section_no: number; question_no: number }) =>
      `c${item.chapter_no}-s${item.section_no}-q${item.question_no}` === key)
    const labels = ['A', 'B', 'C', 'D']
    const order = session.optionOrders[key] as string[]
    const correctDisplayed = labels[order.indexOf(question.answer)]
    return { key, selectedDisplayed: labels.find((label) => label !== correctDisplayed)! }
  })
  await page.locator(`[data-option="${answer.selectedDisplayed}"]`).click()
  await page.getByRole('button', { name: '交卷' }).click()
  await page.getByRole('button', { name: '確認交卷' }).click()

  const bankResponse = await page.request.get(withLawUrl)
  const changedBank = await bankResponse.json()
  const changedQuestion = changedBank.find((item: { chapter_no: number; section_no: number; question_no: number }) =>
    `c${item.chapter_no}-s${item.section_no}-q${item.question_no}` === answer.key)
  changedQuestion.question = '不應冒充為當次內容的新題幹'
  await page.evaluate(async () => {
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map((registration) => registration.unregister()))
    await Promise.all((await caches.keys()).map((key) => caches.delete(key)))
  })
  await context.route(`**${withLawUrl}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(changedBank) }))
  await page.close()

  const historyPage = await context.newPage()
  await historyPage.goto(mockPath)
  await historyPage.locator('.attempt-card summary').first().click()
  const degraded = historyPage.locator(`[data-attempt-mistake][data-question-key="${answer.key}"]`)
  await expect(degraded).toContainText('無法安全還原')
  await expect(degraded).not.toContainText('不應冒充為當次內容的新題幹')
  await expect(degraded.locator('[data-answer-kind]')).toHaveCount(0)
})

test('模擬考答錯時在桌機與手機直接顯示法源；只有答案題庫顯示固定說明', async ({ page }) => {
  await selectBankAtEntry(page, '只有答案題庫')
  await page.goto(mockPath)
  await page.getByRole('button', { name: '開始模擬考' }).click()
  const selectedDisplayed = await page.evaluate(async () => {
    const session = JSON.parse(localStorage.getItem('rent-exam-session-v1')!)
    const questions = await fetch('/data/questions_without_law.json').then((response) => response.json())
    const key = session.questionKeys[0]
    const question = questions.find((item: { chapter_no: number; section_no: number; question_no: number }) =>
      `c${item.chapter_no}-s${item.section_no}-q${item.question_no}` === key)
    const labels = ['A', 'B', 'C', 'D']
    const correctDisplayed = labels[(session.optionOrders[key] as string[]).indexOf(question.answer)]
    return labels.find((label) => label !== correctDisplayed)!
  })

  await page.locator(`[data-option="${selectedDisplayed}"]`).click()
  await page.getByRole('button', { name: '交卷' }).click()
  await page.getByRole('button', { name: '確認交卷' }).click()

  const wrong = page.locator('.result-item').filter({ hasText: '✗ 答錯' }).first()
  await expect(wrong.locator('.explanation')).toContainText('此題庫未提供說明。')
  await expect(wrong.getByRole('button', { name: '查看詳解' })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('模擬考 reload 後保留題序、選項排列、目前題號、答案與原始倒數', async ({ page }) => {
  await selectBankAtEntry(page)
  await page.goto(mockPath)
  await page.getByRole('button', { name: '開始模擬考' }).click()
  const firstOptionTexts = await page.locator('[data-option] span').allTextContents()
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('rent-exam-session-v1')!))
  expect(Object.keys(stored.optionOrders)).toHaveLength(100)
  expect(stored.optionOrders[stored.questionKeys[0]]).toHaveLength(4)
  await page.locator('[data-option="B"]').click()
  await page.locator('[data-exam-index="49"]').click()
  await page.waitForTimeout(1_100)
  const timerBeforeReload = await page.locator('[data-timer]').textContent()

  await page.reload()

  await expect(page.getByText('第 50 / 100 題')).toBeVisible()
  await page.locator('[data-exam-index="0"]').click()
  await expect(page.locator('[data-option="B"]')).toHaveAttribute('aria-pressed', 'true')
  expect(await page.locator('[data-option] span').allTextContents()).toEqual(firstOptionTexts)
  const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('rent-exam-session-v1')!))
  expect(restored.optionOrders).toEqual(stored.optionOrders)
  const timerAfterReload = await page.locator('[data-timer]').textContent()
  expect(timerAfterReload).not.toBe('120:00')
  expect(timerAfterReload! <= timerBeforeReload!).toBe(true)
})

test('錯題回顧使用獨立路由並可啟動錯題練習', async ({ page }) => {
  await selectBankAtEntry(page)
  await page.evaluate(() => localStorage.setItem('rent-exam-history-v1', JSON.stringify({
    answered: 3,
    correct: 2,
    wrongKeys: ['c1-s1-q1'],
  })))
  await openPrimaryNavigation(page)
  await page.getByRole('navigation', { name: '主要導覽' }).getByRole('link', { name: '錯題回顧' }).click()

  await expect(page).toHaveURL(wrongPath)
  await expect(page.getByRole('heading', { name: '錯題回顧' })).toBeVisible()
  await expect(page.getByText('錯題數：1')).toBeVisible()
  await page.getByRole('button', { name: '練習全部錯題' }).click()
  await expect(page.getByText('錯題練習').first()).toBeVisible()
  await expect(page.locator('[data-question-key]')).toBeVisible()
})

test('錯題回顧顯示各章歷史比例並可練習指定章節錯題', async ({ page }) => {
  await selectBankAtEntry(page)
  await page.evaluate(() => localStorage.setItem('rent-exam-history-v1', JSON.stringify({
    version: 2,
    answered: 8,
    correct: 5,
    wrongKeys: ['c2-s1-q1', 'c2-s1-q2', 'c3-s1-q1'],
    recordedExamIds: [],
    chapterStats: { '2': { answered: 5, correct: 2 }, '3': { answered: 3, correct: 3 } },
    mockAttempts: [],
  })))
  await page.goto(wrongPath)

  const chapterTwo = page.locator('[data-wrong-chapter-summary="2"]')
  await expect(chapterTwo).toContainText('歷史答錯率 60%')
  await expect(chapterTwo).toContainText('目前錯題 2 題')
  await chapterTwo.getByRole('button', { name: '練習第 2 章錯題' }).click()
  await expect(page.getByText('第 2 章錯題練習').first()).toBeVisible()
  await expect(page.locator('[data-question-key]')).toHaveAttribute('data-question-key', /^c2-/)
  await expect(page.getByText('第 1 / 2 題')).toBeVisible()
})

test('模擬考頁顯示歷史章節分布並可單獨清除結果', async ({ page }) => {
  await selectBankAtEntry(page)
  await page.evaluate(() => {
    const chapters = Array.from({ length: 10 }, (_, index) => ({ chapter: index + 1, total: 10, answered: 10, correct: index === 1 ? 6 : 8 }))
    localStorage.setItem('rent-exam-history-v1', JSON.stringify({
      version: 2,
      answered: 200,
      correct: 158,
      wrongKeys: ['c2-s1-q1'],
      recordedExamIds: ['attempt-12345678', 'attempt-abcdefgh'],
      chapterStats: { '2': { answered: 20, correct: 14 } },
      mockAttempts: [
        { attemptId: 'attempt-12345678', completedAt: 1_000, bankKey: 'withLaw', correct: 78, total: 100, chapters },
        { attemptId: 'attempt-abcdefgh', completedAt: 2_000, bankKey: 'withLaw', correct: 80, total: 100, chapters: chapters.map((chapter) => ({ ...chapter, correct: 8 })) },
      ],
    }))
  })
  await page.goto(mockPath)

  await expect(page.getByRole('heading', { name: '歷史模擬考表現' })).toBeVisible()
  await expect(page.getByText('共 2 次模擬考')).toBeVisible()
  const chapterTwo = page.locator('.history-panel > .performance-grid .performance-card').filter({ hasText: '第 2 章' })
  await expect(chapterTwo).toContainText('14 / 20 題')
  await expect(chapterTwo).toContainText('70%')
  await expect(page.locator('.attempt-card')).toHaveCount(2)

  await page.getByRole('button', { name: '清除模擬考紀錄' }).click()
  await expect(page.getByText('確定清除所有模擬考結果分布？錯題與累計作答不受影響。')).toBeVisible()
  await page.getByRole('button', { name: '確認清除' }).click()
  await expect(page.getByText(/尚無模擬考紀錄/)).toBeVisible()
  const retained = await page.evaluate(() => JSON.parse(localStorage.getItem('rent-exam-history-v1')!))
  expect(retained.wrongKeys).toEqual(['c2-s1-q1'])
  expect(retained.answered).toBe(200)
})

test('舊版本機紀錄在更新後可直接使用且不發生頁面錯誤', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await selectBankAtEntry(page)
  await page.evaluate(() => localStorage.setItem('rent-exam-history-v1', JSON.stringify({
    answered: 3,
    correct: 2,
    wrongKeys: ['c1-s1-q1'],
  })))

  await page.goto(wrongPath)
  await expect(page.getByText('累計作答：3')).toBeVisible()
  await expect(page.getByText('錯題數：1')).toBeVisible()
  await expect(page.locator('[data-wrong-chapter-summary="1"]')).toContainText('目前錯題 1 題')

  await page.goto(mockPath)
  await expect(page.getByRole('heading', { name: '120 分鐘模擬考' })).toBeVisible()
  await expect(page.getByText(/尚無模擬考紀錄/)).toBeVisible()
  expect(errors).toEqual([])
})

async function chooseQuestionBank(page: import('@playwright/test').Page, label: string, expectedUrl: string): Promise<void> {
  const dataRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/data/')) dataRequests.push(new URL(request.url()).pathname)
  })
  await page.getByRole('button', { name: label }).click()
  await expect(page.getByRole('link', { name: '返回入口' })).toBeVisible()
  await expect(page.locator('[data-question-key]')).toBeVisible()
  await expect.poll(() => [...dataRequests].sort()).toEqual([annotationsUrl, expectedUrl].sort())
}

test('首次進入先選擇題庫，不會自動載入 JSON', async ({ page }) => {
  const dataRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/data/')) dataRequests.push(new URL(request.url()).pathname)
  })

  await page.goto(homePath)

  await expect(page.getByRole('heading', { name: '選擇題庫版本' })).toBeVisible()
  await expect(page.getByRole('button', { name: '有詳解題庫' })).toBeVisible()
  await expect(page.getByRole('button', { name: '只有答案題庫' })).toBeVisible()
  await expect(page.getByRole('button', { name: '有詳解題庫' })).toHaveCSS('min-height', '52px')
  await expect(page.getByRole('button', { name: '只有答案題庫' })).toHaveCSS('min-height', '52px')
  expect(dataRequests).toEqual([])
})

test('初訓入口顯示來源摘要、練習用途聲明與 About 入口', async ({ page }) => {
  await page.goto(homePath)

  await expect(page.getByText('租賃住宅管理人員資格訓練題庫')).toBeVisible()
  await expect(page.getByText('官方更新日期：2026-02-06')).toBeVisible()
  await expect(page.getByText('本站最後更新／轉檔日期：2026-07-21')).toBeVisible()
  await expect(page.getByText('本題庫僅供學習與練習使用，內容請以官方最新公告為準。')).toBeVisible()
  await expect(page.getByRole('link', { name: '查看完整資料來源與使用說明' })).toHaveAttribute('href', aboutPath)
})

test('共用 About 集中顯示初訓與換證資料來源、免責聲明與模擬考規則', async ({ page }) => {
  await page.goto(aboutPath)

  await expect(page.getByRole('heading', { name: '關於本站' })).toBeVisible()
  await expect(page.getByText('租賃住宅管理人員資格訓練題庫')).toBeVisible()
  const sources = page.locator('.about-source-list dd')
  await expect(sources.nth(0)).toContainText('官方更新日期：2026-02-06')
  await expect(sources.nth(0)).toContainText('本站最後更新／轉檔日期：2026-07-21')
  await expect(sources.nth(1)).toContainText('官方更新日期：2026-02-06')
  await expect(sources.nth(1)).toContainText('本站最後更新／轉檔日期：2026-08-03')
  await expect(sources.nth(1)).toContainText('共 379 題')
  await expect(page.getByText(/本網站僅供個人學習與測驗練習/)).toBeVisible()
  await expect(page.getByText('不得作為法律意見或專業服務之替代')).toBeVisible()
  await expect(page.getByText(/初訓模擬考從第 1 至第 10 章各抽十題，共 100 題/)).toBeVisible()
  await expect(page.getByText('作答時間 120 分鐘')).toBeVisible()
  await expect(page.getByText('換證目前不提供模擬考')).toBeVisible()
  await expect(page.getByText('沐承科技有限公司提供，為公開免費的個人學習服務')).toBeVisible()
  await expect(page.getByRole('link', { name: 'MIT License' })).toHaveAttribute('href', /LICENSE/)
  await expect(page.getByRole('link', { name: '使用 GitHub Issues' })).toHaveAttribute('href', /issues\/new/)
  await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0)
  await expect(page.getByRole('link', { name: '租賃住宅管理人員測驗題庫' })).toHaveAttribute('href', /rentalh\.org\.tw/)
})

test('所有頁面使用同一個根目錄 favicon', async ({ page, request }) => {
  await page.goto(homePath)
  await page.evaluate(() => sessionStorage.setItem('rent-exam-question-bank-v1', 'withLaw'))

  for (const path of [homePath, practicePath, chapterPath, mockPath, wrongPath, aboutPath]) {
    await page.goto(path)
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/favicon.svg')
  }

  const favicon = await request.get('/favicon.svg')
  expect(favicon.ok()).toBe(true)
  expect(favicon.headers()['content-type']).toContain('image/svg+xml')
})

test('網站固定由根目錄提供入口與靜態資源', async ({ page, request }) => {
  expect((await request.get('/')).status()).toBe(200)
  await page.goto(homePath)

  const resourcePaths = await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => new URL(entry.name).pathname))
  expect(resourcePaths.length).toBeGreaterThan(0)
  expect(resourcePaths.every((path) => path.startsWith('/'))).toBe(true)
})

test('完整 build 的 Service Worker precache 包含離線資源但排除 legacy redirect 文件', async ({ request }) => {
  const serviceWorkerPath = resolve(process.cwd(), 'dist/sw.js')
  expect(existsSync(serviceWorkerPath)).toBe(true)
  const serviceWorker = readFileSync(serviceWorkerPath, 'utf8')
  expect(serviceWorker).toContain('question_annotations.json')
  expect(serviceWorker).toContain('manifest-init.webmanifest')
  expect(serviceWorker).toContain('manifest-renew.webmanifest')
  for (const legacyDocument of [
    'practice/index.html',
    'practice/chapter/index.html',
    'mock/index.html',
    'wrong/index.html',
  ]) {
    expect(serviceWorker).not.toContain(`url:${JSON.stringify(legacyDocument)}`)
  }
  const networkOnlyIndex = serviceWorker.indexOf('NetworkOnly')
  const networkFirstIndex = serviceWorker.indexOf('NetworkFirst')
  expect(networkOnlyIndex).toBeGreaterThan(-1)
  expect(networkFirstIndex).toBeGreaterThan(networkOnlyIndex)

  const response = await request.get('/sw.js')
  expect(response.ok()).toBe(true)
  expect(await response.text()).toContain('question_annotations.json')
})

test('選擇有詳解題庫後只載入對應 JSON', async ({ page }) => {
  await page.goto(homePath)
  await chooseQuestionBank(page, '有詳解題庫', withLawUrl)
})

test('題庫載入失敗後可回到選擇畫面', async ({ page }) => {
  await page.route(`**${withLawUrl}`, (route) => route.fulfill({ status: 503, body: '暫時無法使用' }))
  await page.goto(homePath)
  await page.getByRole('button', { name: '有詳解題庫' }).click()

  await expect(page.getByRole('alert')).toContainText('有詳解題庫目前無法載入')
  await page.getByRole('link', { name: '返回入口' }).click()
  await expect(page.getByRole('heading', { name: '選擇題庫版本' })).toBeVisible()
  await expect(page.getByRole('button', { name: '只有答案題庫' })).toBeVisible()
})

test('歷史用的另一題庫暫時失敗時，不阻擋目前題庫開始模擬考', async ({ page }) => {
  await page.route(`**${withoutLawUrl}`, (route) => route.fulfill({ status: 503, body: '暫時無法使用' }))
  await selectBankAtEntry(page)
  await page.goto(mockPath)

  await expect(page.getByRole('button', { name: '開始模擬考' })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('題目註記載入失敗時 fail closed', async ({ page }) => {
  await page.route(`**${annotationsUrl}`, (route) => route.fulfill({ status: 503, body: '暫時無法使用' }))
  await page.goto(homePath)
  await page.getByRole('button', { name: '有詳解題庫' }).click()

  await expect(page.getByRole('alert')).toContainText('目前無法載入')
  await expect(page.locator('[data-question-key]')).toHaveCount(0)
})

test('章節練習標示可忽略題並以括號補充錯字', async ({ page }) => {
  await selectBankAtEntry(page)
  await page.goto(chapterPath)
  await page.locator('[data-action="chapter-select"]').selectOption('2')
  await page.locator('[data-action="toggle-settings"]').click()
  await page.locator('[data-action="chapter-order"]').selectOption('sequential')

  for (let index = 1; index < 5; index += 1) {
    await page.locator('[data-option]').first().click()
    await page.locator('[data-action="check-practice"]').click()
    await page.locator('[data-action="next-practice"]').click()
  }
  await expect(page.locator('[data-question-key]')).toHaveAttribute('data-question-key', 'c2-s1-q5')
  await expect(page.locator('[data-annotation-type="ignore"]')).toContainText('此題可忽略')

  for (let index = 5; index < 17; index += 1) {
    await page.locator('[data-option]').first().click()
    await page.locator('[data-action="check-practice"]').click()
    await page.locator('[data-action="next-practice"]').click()
  }
  await expect(page.locator('[data-question-key]')).toHaveAttribute('data-question-key', 'c2-s1-q17')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('並為（未）約定')
  await expect(page.locator('[data-annotation-type="typo"]')).toContainText('考試仍可能沿用原文')
})

test('模擬考 session 不包含可忽略題', async ({ page }) => {
  await selectBankAtEntry(page)
  await page.goto(mockPath)
  await page.getByRole('button', { name: '開始模擬考' }).click()

  const keys = await page.evaluate(() => JSON.parse(localStorage.getItem('rent-exam-session-v1')!).questionKeys as string[])
  expect(keys).toHaveLength(100)
  expect(keys).not.toContain('c2-s1-q5')
  expect(keys).not.toContain('c2-s1-q23')
})

test('只有答案題庫檢查答案後不提供詳解按鈕', async ({ page }) => {
  await page.goto(homePath)
  await chooseQuestionBank(page, '只有答案題庫', withoutLawUrl)

  await page.locator('[data-option]').first().click()
  await page.locator('[data-action="check-practice"]').click()

  await expect(page.getByText(/正確答案：[A-D]/)).toBeVisible()
  await expect(page.locator('[data-action="toggle-explanation"]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /查看詳解|收合詳解/ })).toHaveCount(0)
})

test.describe('選擇有詳解題庫後的練習功能', () => {
  test.beforeEach(async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    page.on('pageerror', (error) => consoleErrors.push(error.message))
    await page.goto(homePath)
    await chooseQuestionBank(page, '有詳解題庫', withLawUrl)
    expect(consoleErrors).toEqual([])
  })

  test('全題庫隨機練習先檢查答案，再由使用者展開詳解', async ({ page }) => {
    await expect(page.getByText('全題庫隨機練習').first()).toBeVisible()
    await page.locator('[data-option]').first().click()
    const checkButton = page.locator('[data-action="check-practice"]')
    await checkButton.scrollIntoViewIfNeeded()
    await checkButton.click()

    await expect(page.getByText(/正確答案：[A-D]/)).toBeVisible()
    await expect(page.locator('.explanation')).toHaveCount(0)
    await expect(page.getByRole('button', { name: '查看詳解' })).toBeVisible()
    await page.locator('[data-action="toggle-explanation"]').click()
    await expect(page.locator('.explanation')).toBeVisible()
    await page.locator('[data-action="toggle-explanation"]').click()
    await expect(page.locator('.explanation')).toHaveCount(0)
  })

  test('可選擇章節開始該章隨機練習', async ({ page }) => {
    await openPrimaryNavigation(page)
    await page.getByRole('link', { name: '章節練習' }).click()
    await expect(page).toHaveURL(chapterPath)
    await page.locator('[data-action="chapter-select"]').selectOption('1')

    await expect(page.getByText('第 1 章隨機練習').first()).toBeVisible()
    await expect(page.locator('[data-question-key]')).toBeVisible()
  })

  test('模擬考建立固定一百題並提示未答後交卷', async ({ page }) => {
    await openPrimaryNavigation(page)
    await page.getByRole('link', { name: '模擬考' }).click()
    await expect(page).toHaveURL(mockPath)
    await page.getByRole('button', { name: '開始模擬考' }).click()

    await expect(page.getByText('第 1 / 100 題')).toBeVisible()
    await expect(page.locator('[data-exam-index]')).toHaveCount(100)
    await expect(page.locator('[data-timer]')).toContainText('120:')

    await page.locator('[data-action="submit-mock"]').click()
    await expect(page.getByText('尚有 100 題未作答')).toBeVisible()
    await page.locator('[data-action="confirm-submit-mock"]').click()
    await expect(page.getByRole('heading', { name: '模擬考成績' })).toBeVisible()
    await expect(page.getByText('第 1 章：')).toBeVisible()
    await expect(page.locator('.result-item .explanation')).toHaveCount(100)
    const firstExplanation = page.locator('.result-item').first().locator('.explanation')
    await expect(firstExplanation.getByText('說明', { exact: true })).toBeVisible()
    await expect(firstExplanation.locator('p')).not.toHaveText('')
  })
})

const renewPath = '/renew/'
const renewPracticePath = '/renew/practice/'
const renewChapterPath = '/renew/practice/chapter/'
const renewWrongPath = '/renew/wrong/'

async function selectRenewBank(page: import('@playwright/test').Page, label = '有詳解題庫'): Promise<void> {
  await page.goto(renewPath)
  await page.getByRole('button', { name: label }).click()
  await expect(page).toHaveURL(renewPracticePath)
  await expect(page.locator('[data-question-key]')).toBeVisible()
}

test('根目錄可選擇初訓或換證 profile，並保留 PWA metadata', async ({ page }) => {
  await page.goto(rootPath)
  await expect(page.getByRole('heading', { name: '選擇練習題庫' })).toBeVisible()
  await expect(page.getByRole('link', { name: '初訓題庫' })).toHaveAttribute('href', homePath)
  await expect(page.getByRole('link', { name: '換證題庫' })).toHaveAttribute('href', renewPath)
  for (const [path, manifest] of [[rootPath, '/manifest.webmanifest'], [homePath, '/manifest-init.webmanifest'], [renewPath, '/manifest-renew.webmanifest'], [aboutPath, '/manifest.webmanifest']] as const) {
    await page.goto(path)
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/favicon.svg')
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', manifest)
  }
})

test('換證兩版本各建立 379 題 session，且只有有詳解版本提供詳解', async ({ page }) => {
  for (const bank of ['有詳解題庫', '只有答案題庫']) {
    await selectRenewBank(page, bank)
    await page.locator('[data-option]').first().click()
    await page.locator('[data-action="check-practice"]').click()
    await expect(page.locator('[data-action="toggle-explanation"]')).toHaveCount(bank === '有詳解題庫' ? 1 : 0)
    const session = await page.evaluate(() => JSON.parse(localStorage.getItem('rent-exam-renew-session-v1')!))
    expect(session.questionKeys).toHaveLength(379)
  }
})

test('換證只有三章，錯題回顧支援指定章節錯題練習', async ({ page }) => {
  await selectRenewBank(page)
  await page.goto(renewChapterPath)
  await expect(page.locator('[data-action="chapter-select"] option')).toHaveCount(4)
  await page.locator('[data-action="chapter-select"]').selectOption('3')
  await expect(page.getByText('第 3 章隨機練習').first()).toBeVisible()
  await page.evaluate(() => localStorage.setItem('rent-exam-renew-history-v1', JSON.stringify({ version: 2, answered: 2, correct: 1, wrongKeys: ['c2-s1-q1'], recordedExamIds: [], chapterStats: { '2': { answered: 2, correct: 1 } }, mockAttempts: [] })))
  await page.goto(renewWrongPath)
  await expect(page.locator('[data-wrong-chapter-summary]')).toHaveCount(3)
  const chapter = page.locator('[data-wrong-chapter-summary="2"]')
  await expect(chapter).toContainText('目前錯題 1 題')
  await chapter.getByRole('button', { name: '練習第 2 章錯題' }).click()
  await expect(page.locator('[data-question-key]')).toHaveAttribute('data-question-key', /^c2-/)
})

test('初訓與換證的 session 與歷史完全隔離，且換證 reload 可恢復', async ({ page }) => {
  await selectBankAtEntry(page)
  const initKey = await page.locator('[data-question-key]').getAttribute('data-question-key')
  await selectRenewBank(page)
  const renewKey = await page.locator('[data-question-key]').getAttribute('data-question-key')
  await page.reload()
  await expect(page.locator('[data-question-key]')).toHaveAttribute('data-question-key', renewKey!)
  await page.goto(homePath)
  await page.getByRole('link', { name: '繼續上次練習' }).click()
  await expect(page.locator('[data-question-key]')).toHaveAttribute('data-question-key', initKey!)
  await page.goto(renewPath)
  await page.getByRole('button', { name: '放棄這次進度' }).click()
  await expect(page.getByRole('link', { name: '繼續上次練習' })).toHaveCount(0)
  await page.goto(homePath)
  await expect(page.getByRole('link', { name: '繼續上次練習' })).toBeVisible()
})

test('換證不顯示或生成模擬考，legacy 練習 URLs 保留對應初訓目的地', async ({ page }) => {
  await selectRenewBank(page)
  await openPrimaryNavigation(page)
  await expect(page.getByRole('link', { name: '模擬考' })).toHaveCount(0)
  expect(existsSync(resolve(process.cwd(), 'dist/renew/mock/index.html'))).toBe(false)
  for (const [oldPath, destination] of [['/practice/', practicePath], ['/practice/chapter/', chapterPath], ['/mock/', mockPath], ['/wrong/', wrongPath]] as const) {
    await page.goto(oldPath, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('meta[http-equiv="refresh"]')).toHaveAttribute('content', `2;url=${destination}`)
    await expect(page.getByRole('link')).toHaveAttribute('href', destination)
  }
})

test('localStorage 受限時，初訓與換證各自以 sessionStorage 恢復所選題庫', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { configurable: true, get: () => ({
      getItem: () => { throw new Error('restricted') }, setItem: () => { throw new Error('restricted') }, removeItem: () => { throw new Error('restricted') },
    }) })
  })
  await page.goto(homePath)
  await page.getByRole('button', { name: '有詳解題庫' }).click()
  await expect(page.locator('.brand small')).toContainText('初訓・有詳解題庫')
  await page.goto(renewPath)
  await page.getByRole('button', { name: '只有答案題庫' }).click()
  await expect(page.locator('.brand small')).toContainText('換證・只有答案題庫')
  await page.goto(practicePath)
  await expect(page.locator('.brand small')).toContainText('初訓・有詳解題庫')
  await page.goto(renewPracticePath)
  await expect(page.locator('.brand small')).toContainText('換證・只有答案題庫')
})

test('換證載入與註記失敗均 fail closed 並可返回換證入口', async ({ page }) => {
  await page.route('**/data/renew/questions_with_law.json', route => route.fulfill({ status: 503, body: 'unavailable' }))
  await page.goto(renewPath)
  await page.getByRole('button', { name: '有詳解題庫' }).click()
  await expect(page.getByRole('alert')).toContainText('目前無法載入')
  await expect(page.getByRole('link', { name: '返回入口' })).toHaveAttribute('href', renewPath)
  await page.unroute('**/data/renew/questions_with_law.json')
  await page.route('**/data/renew/question_annotations.json', route => route.fulfill({ status: 503, body: 'unavailable' }))
  await page.goto(renewPath)
  await page.getByRole('button', { name: '有詳解題庫' }).click()
  await expect(page.getByRole('alert')).toContainText('目前無法載入')
  await expect(page.locator('[data-question-key]')).toHaveCount(0)
})

test('只生成共用 About route，且同頁說明換證題數、雙軌隔離與不提供模擬考', async ({ page, request }) => {
  for (const legacyPath of ['/init/about/', '/renew/about/']) {
    expect(existsSync(resolve(process.cwd(), `dist${legacyPath}index.html`))).toBe(false)
    const response = await request.get(legacyPath, { maxRedirects: 0 })
    expect(response.status() < 300 || response.status() > 399).toBe(true)
    expect(response.headers().location).toBeUndefined()
    expect(await response.text()).not.toContain('class="about-page"')
  }

  await page.goto(aboutPath)
  await expect(page.getByRole('heading', { name: '關於本站' })).toBeVisible()
  const renewalSource = page.locator('.about-source-list dd').nth(1)
  await expect(renewalSource).toContainText('官方更新日期：2026-02-06')
  await expect(renewalSource).toContainText('本站最後更新／轉檔日期：2026-08-03')
  await expect(renewalSource).toContainText('共 379 題')
  await expect(page.getByText(/兩種題庫的選擇、進度與學習紀錄彼此分開/)).toBeVisible()
  await expect(page.getByText('換證目前不提供模擬考')).toBeVisible()
})
