import type { IntakeAnswers } from './service-intake';

const drafts = new Map<string, IntakeAnswers>();

const slot = (userId: string, categoryId: string) => `${userId}|${categoryId}`;

export function readIntakeDraft(userId: string, categoryId: string): IntakeAnswers {
  return drafts.get(slot(userId, categoryId)) ?? {};
}

export function writeIntakeDraft(userId: string, categoryId: string, answers: IntakeAnswers): void {
  if (Object.values(answers).every(value => value.trim() === '')) drafts.delete(slot(userId, categoryId));
  else drafts.set(slot(userId, categoryId), answers);
}

export function clearIntakeDraft(userId: string, categoryId: string): void {
  drafts.delete(slot(userId, categoryId));
}
