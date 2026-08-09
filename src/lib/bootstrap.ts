import { initRentApp } from './app'
import { validateQuestionAnnotations } from './question-annotations'
import { validateQuestionBank, type Question } from './questions'
import type { BankKey } from './session'
import { getExamProfile, routesForProfile, type ExamView, type TrackKey } from './exam-profiles'
import { readSelectedBank } from './selected-bank'

export type { ExamView } from './exam-profiles'

const escapeHtml = (value: string) => value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]!)

export async function bootstrapExamPage(root: HTMLElement, track: TrackKey, initialView: ExamView): Promise<void> {
  const profile = getExamProfile(track)
  const routes = routesForProfile(profile)
  if (initialView === 'mock' && !profile.mockExam.enabled) { window.location.replace(routes.practice); return }
  const bankKey = readSelectedBank(profile.storage.selectedBank)
  if (!bankKey || !(bankKey in profile.questionBanks)) { window.location.replace(routes.home); return }
  const bank = profile.questionBanks[bankKey]
  root.innerHTML = `<p class="loading">正在載入${bank.label}…</p>`
  try {
    const historicalBankKeys: BankKey[] = initialView === 'mock' ? ['withLaw', 'withoutLaw'] : [bankKey]
    const [bankPayloads, annotationsResponse] = await Promise.all([
      Promise.all(historicalBankKeys.map(async (key) => {
        try {
          const response = await fetch(profile.questionBanks[key].path)
          if (!response.ok) throw new Error(`${profile.questionBanks[key].label}讀取失敗（${response.status}）`)
          return [key, validateQuestionBank(await response.json())] as const
        } catch (error) {
          if (key === bankKey) throw error
          return null
        }
      })),
      fetch(profile.annotationPath),
    ])
    if (!annotationsResponse.ok) throw new Error(`題目註記讀取失敗（${annotationsResponse.status}）`)
    const availableBankPayloads = bankPayloads.filter((payload): payload is readonly [BankKey, Question[]] => payload !== null)
    const historicalQuestionBanks: Partial<Record<BankKey, Question[]>> = Object.fromEntries(availableBankPayloads)
    const questions = historicalQuestionBanks[bankKey]
    if (!questions) throw new Error(`${bank.label}讀取失敗`)
    const annotations = validateQuestionAnnotations(await annotationsResponse.json(), questions)
    initRentApp(root, questions, { profile, routes, bankLabel: `${profile.label}・${bank.label}`, bankKey, initialView, annotations, historicalQuestionBanks })
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知錯誤'
    root.innerHTML = `<section class="load-error"><p role="alert">${escapeHtml(bank.label)}目前無法載入：${escapeHtml(message)}</p><a class="button" href="${routes.home}">返回入口</a></section>`
  }
}
