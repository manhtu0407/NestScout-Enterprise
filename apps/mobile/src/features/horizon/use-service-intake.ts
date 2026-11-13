import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useRef, useState } from 'react';

import { clearPendingRequest, isDefinitiveFailure, loadPendingRequest, savePendingRequest, submitRequest, type PendingRequest, type WorkflowError } from '@/features/shared';
import { AuthSessionError } from '@/lib/authenticated-rest';

import { dispatchServiceFor, type ServiceCategory } from './service-catalog';
import { clearIntakeDraft, readIntakeDraft, writeIntakeDraft } from './service-intake-drafts';
import { composeSubmission, validateIntake, type IntakeAnswers, type IntakeErrors } from './service-intake';

export type IntakePhase = 'form' | 'review' | 'submitting' | 'submitted' | 'uncertain';

export type IntakeStorage = 'loading' | 'ready' | 'unreadable';

export type IntakeDeps = {
  submit: typeof submitRequest;
  load: typeof loadPendingRequest;
  save: typeof savePendingRequest;
  clear: typeof clearPendingRequest;
  newKey: () => string;
};

const defaultDeps: IntakeDeps = { submit: submitRequest, load: loadPendingRequest, save: savePendingRequest, clear: clearPendingRequest, newKey: () => Crypto.randomUUID() };

export const intakeMessages = {
  uncertain: 'Chưa xác nhận được yêu cầu đã được gửi hay chưa (có thể do mạng). Hãy bấm Gửi lại để kiểm tra. Hệ thống dùng cùng một mã gửi nên sẽ không tạo yêu cầu trùng.',
  pending: 'Có một yêu cầu trước đó chưa xác nhận được kết quả gửi. Hãy bấm Gửi lại để đối soát trước khi tạo yêu cầu mới. Hệ thống dùng cùng một mã gửi nên sẽ không tạo yêu cầu trùng.',
  forbidden: 'Tài khoản này chưa được phép gửi yêu cầu. Hãy đăng nhập lại bằng tài khoản khách hàng rồi thử lại.',
  rejected: 'Máy chủ không nhận nội dung này. Hãy kiểm tra mô tả và địa điểm rồi thử lại. Yêu cầu chưa được tạo.',
  session: 'Phiên đăng nhập đã thay đổi nên yêu cầu chưa được gửi. Hãy đăng nhập lại rồi thử lại.',
  missing: 'Còn thông tin cần bổ sung trước khi xem lại yêu cầu.',
  storage: 'Không đọc được bản nháp chưa gửi trên thiết bị này. Hãy thử đọc lại trước khi gửi yêu cầu mới.',
  storageWrite: 'Không lưu được mã gửi trên thiết bị nên yêu cầu chưa được gửi. Hãy thử lại.',
} as const;

function definitiveMessage(error: unknown): string | null {
  if (error instanceof AuthSessionError) return intakeMessages.session;
  if (!isDefinitiveFailure(error)) return null;
  return (error as WorkflowError).failure === 'forbidden' ? intakeMessages.forbidden : intakeMessages.rejected;
}

type State = {
  phase: IntakePhase;
  answers: IntakeAnswers;
  errors: IntakeErrors;
  message: string | null;
  requestId: string | null;
  pending: PendingRequest | null;
  storage: IntakeStorage;
  clearsDraft: boolean;
};

export function useServiceIntake(userId: string, category: ServiceCategory, deps: IntakeDeps = defaultDeps) {
  const [state, setState] = useState<State>(() => ({ phase: 'form', answers: readIntakeDraft(userId, category.id), errors: {}, message: null, requestId: null, pending: null, storage: 'loading', clearsDraft: true }));
  const [attempt, setAttempt] = useState(0);
  const inFlight = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    deps.load(userId).then(
      pending => {
        if (!active) return;
        setState(current => ({ ...current, storage: 'ready', pending, phase: pending === null ? current.phase : 'uncertain', message: pending === null ? current.message : intakeMessages.pending }));
      },
      () => {
        if (active) setState(current => ({ ...current, storage: 'unreadable', message: intakeMessages.storage }));
      },
    );
    return () => {
      active = false;
      mounted.current = false;
      controllerRef.current?.abort();
    };
  }, [attempt, deps, userId]);

  const { answers, phase, clearsDraft } = state;
  useEffect(() => {
    if (phase !== 'submitted') writeIntakeDraft(userId, category.id, answers);
    else if (clearsDraft) clearIntakeDraft(userId, category.id);
  }, [answers, category.id, clearsDraft, phase, userId]);

  const setAnswer = useCallback((id: string, value: string) => {
    setState(current => {
      if (current.phase === 'submitting' || current.phase === 'submitted' || current.pending !== null) return current;
      const { [id]: _removed, ...errors } = current.errors;
      return { ...current, answers: { ...current.answers, [id]: value }, errors };
    });
  }, []);

  const review = useCallback(() => {
    setState(current => {
      if (current.phase !== 'form' || current.pending !== null || current.storage !== 'ready') return current;
      const errors = validateIntake(category, current.answers);
      if (Object.keys(errors).length > 0) return { ...current, errors, message: intakeMessages.missing };
      return { ...current, errors: {}, message: null, phase: 'review' };
    });
  }, [category]);

  const edit = useCallback(() => {
    setState(current => (current.phase === 'review' ? { ...current, phase: 'form', message: null } : current));
  }, []);

  const submit = useCallback(async () => {
    if (inFlight.current) return;
    const snapshot = state;
    if (snapshot.storage !== 'ready' || (snapshot.phase !== 'review' && snapshot.phase !== 'uncertain')) return;
    const item: PendingRequest | null = snapshot.pending ?? (() => {
      if (Object.keys(validateIntake(category, snapshot.answers)).length > 0) return null;
      const { description, location } = composeSubmission(category, snapshot.answers);
      return { key: deps.newKey(), description, location, serviceId: dispatchServiceFor(category.id) };
    })();
    if (item === null) return;
    inFlight.current = true;
    const controller = new AbortController();
    controllerRef.current = controller;
    setState(current => ({ ...current, phase: 'submitting', message: null }));
    try {
      if (snapshot.pending === null) {
        try {
          await deps.save(userId, item);
        } catch {
          if (mounted.current) setState(current => ({ ...current, phase: 'review', message: intakeMessages.storageWrite }));
          return;
        }
      }
      if (controller.signal.aborted) return;
      setState(current => ({ ...current, pending: item }));
      const requestId = await deps.submit(userId, item.key, item.description, controller.signal, item.location, item.serviceId);
      await deps.clear(userId).catch(() => undefined);
      const own = composeSubmission(category, snapshot.answers);
      const clearsDraft = snapshot.pending === null || (snapshot.pending.description === own.description && snapshot.pending.location === own.location);
      if (mounted.current) setState(current => ({ ...current, phase: 'submitted', requestId, pending: null, message: null, clearsDraft }));
    } catch (error) {
      if (controller.signal.aborted || !mounted.current) return;
      const message = definitiveMessage(error);
      if (message === null) {
        setState(current => ({ ...current, phase: 'uncertain', message: intakeMessages.uncertain }));
        return;
      }
      if (!(error instanceof AuthSessionError)) await deps.clear(userId).catch(() => undefined);
      setState(current => ({ ...current, phase: snapshot.pending === null || error instanceof AuthSessionError ? 'review' : 'form', pending: error instanceof AuthSessionError ? current.pending : null, message }));
    } finally {
      inFlight.current = false;
    }
  }, [category, deps, state, userId]);

  const retryStorage = useCallback(() => {
    setState(current => ({ ...current, storage: 'loading', message: null }));
    setAttempt(count => count + 1);
  }, []);

  const discardUnreadable = useCallback(() => {
    void deps.clear(userId).then(
      () => { if (mounted.current) setAttempt(count => count + 1); },
      () => { if (mounted.current) setState(current => ({ ...current, message: intakeMessages.storage })); },
    );
  }, [deps, userId]);

  const startAnother = useCallback(() => {
    setState({ phase: 'form', answers: readIntakeDraft(userId, category.id), errors: {}, message: null, requestId: null, pending: null, storage: 'ready', clearsDraft: true });
  }, [category.id, userId]);

  return { ...state, setAnswer, review, edit, submit, retryStorage, discardUnreadable, startAnother };
}
