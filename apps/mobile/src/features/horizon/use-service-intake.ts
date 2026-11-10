import { randomUUID } from 'expo-crypto';
import { useCallback, useEffect, useRef, useState } from 'react';

import { clearPendingRequest, isDefinitiveFailure, loadPendingRequest, savePendingRequest, submitRequest, type PendingRequest, WorkflowError, type WorkflowFailure } from '@/features/shared';

import type { ServiceKey } from './service-catalog';
import { composeIntake, emptyDraft, hasErrors, validateIntake, type IntakeDraft, type IntakeErrors } from './service-intake';

export type IntakeDeps = {
  submit: typeof submitRequest;
  load: typeof loadPendingRequest;
  save: typeof savePendingRequest;
  clear: typeof clearPendingRequest;
  newKey: () => string;
};

const defaultDeps: IntakeDeps = { submit: submitRequest, load: loadPendingRequest, save: savePendingRequest, clear: clearPendingRequest, newKey: randomUUID };

export type IntakePhase = 'loading' | 'unreadable' | 'pending' | 'edit' | 'review' | 'received';

export const intakeMessages = {
  unreadable: 'Chưa đọc được bản nháp đã lưu trên thiết bị này. Bạn có thể thử lại hoặc bỏ bản đã lưu.',
  notSaved: 'Thiết bị chưa lưu được bản gửi lại an toàn nên yêu cầu chưa được gửi. Vui lòng thử lại.',
  unknown: 'Chưa xác nhận được kết quả gửi. Yêu cầu đã được giữ lại trên thiết bị: hãy bấm Gửi lại để kiểm tra an toàn, không lo bị tạo trùng.',
  cleanup: 'Yêu cầu đã được ghi nhận nhưng thiết bị chưa xóa được bản chờ gửi. Bản đó sẽ không tạo thêm yêu cầu mới.',
  definitive: {
    forbidden: 'Tài khoản này chưa được phép gửi yêu cầu. Hãy đăng nhập bằng số điện thoại rồi thử lại.',
    stale: 'Thông tin đã thay đổi. Hãy xem lại rồi gửi lại.',
    expired: 'Thông tin đã hết hạn. Hãy xem lại rồi gửi lại.',
    unavailable: 'Chưa gửi được yêu cầu lúc này. Hãy thử lại sau.',
    invalid: 'Máy chủ không nhận nội dung này. Hãy kiểm tra mô tả và địa điểm rồi thử lại.',
    rejected: 'Máy chủ không nhận nội dung này. Hãy kiểm tra mô tả và địa điểm rồi thử lại.',
  } satisfies Record<Exclude<WorkflowFailure, 'unknown'>, string>,
} as const;

function definitiveMessage(error: unknown): string | null {
  return error instanceof WorkflowError && isDefinitiveFailure(error) ? intakeMessages.definitive[error.failure as Exclude<WorkflowFailure, 'unknown'>] : null;
}

export function useServiceIntake(userId: string, key: ServiceKey, deps: IntakeDeps = defaultDeps) {
  const [draft, setDraft] = useState<IntakeDraft>(() => emptyDraft(key));
  const [phase, setPhase] = useState<IntakePhase>('loading');
  const [errors, setErrors] = useState<IntakeErrors>({});
  const [pending, setPending] = useState<PendingRequest | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    deps.load(userId).then(
      item => {
        if (!active) return;
        setPending(item);
        setPhase(item === null ? 'edit' : 'pending');
      },
      () => {
        if (active) setPhase('unreadable');
      },
    );
    return () => {
      active = false;
      mounted.current = false;
      controller.current?.abort();
    };
  }, [deps, userId, attempt]);

  const setField = useCallback((field: 'description' | 'location' | 'preferredTime', value: string) => {
    setDraft(current => ({ ...current, [field]: value }));
    setErrors(current => (current[field] ? { ...current, [field]: undefined } : current));
    setMessage(null);
  }, []);

  const setAnswer = useCallback((id: string, value: string) => {
    setDraft(current => ({ ...current, answers: { ...current.answers, [id]: value } }));
    setErrors(current => (current[`answer:${id}`] ? { ...current, [`answer:${id}`]: undefined } : current));
    setMessage(null);
  }, []);

  const review = useCallback(() => {
    const found = validateIntake(draft);
    const visible = Object.fromEntries(Object.entries(found).filter(([, value]) => value !== undefined));
    setErrors(visible);
    if (hasErrors(visible)) {
      setMessage('Chưa gửi được: hãy bổ sung các mục được đánh dấu bên dưới.');
      return false;
    }
    setMessage(null);
    setPhase('review');
    return true;
  }, [draft]);

  const edit = useCallback(() => {
    if (inFlight.current) return;
    setMessage(null);
    setPhase('edit');
  }, []);

  const send = useCallback(async (item: PendingRequest, persist: boolean) => {
    if (inFlight.current) return;
    inFlight.current = true;
    const current = new AbortController();
    controller.current = current;
    setBusy(true);
    setMessage(null);
    try {
      if (persist) {
        try {
          await deps.save(userId, item);
        } catch {
          if (mounted.current) setMessage(intakeMessages.notSaved);
          return;
        }
      }
      if (!mounted.current || current.signal.aborted) return;
      setPending(item);
      let id: string;
      try {
        id = await deps.submit(userId, item.key, item.description, current.signal, item.location);
      } catch (error) {
        const definitive = definitiveMessage(error);
        if (definitive !== null) {
          await deps.clear(userId).catch(() => undefined);
          if (mounted.current) {
            setPending(null);
            setPhase('edit');
            setMessage(definitive);
          }
        } else if (mounted.current) {
          setPhase('pending');
          setMessage(intakeMessages.unknown);
        }
        return;
      }
      let cleaned = true;
      try {
        await deps.clear(userId);
      } catch {
        cleaned = false;
      }
      if (!mounted.current) return;
      setPending(null);
      setRequestId(id);
      setPhase('received');
      setMessage(cleaned ? null : intakeMessages.cleanup);
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }, [deps, userId]);

  const confirm = useCallback(() => {
    if (inFlight.current || phase !== 'review') return Promise.resolve();
    const composed = composeIntake(draft);
    return send({ key: deps.newKey(), description: composed.description, location: composed.location }, true);
  }, [deps, draft, phase, send]);

  const retryPending = useCallback(() => (pending === null ? Promise.resolve() : send(pending, false)), [pending, send]);

  const discardPending = useCallback(async () => {
    if (inFlight.current) return;
    try {
      await deps.clear(userId);
    } catch {
      if (mounted.current) setMessage('Chưa bỏ được bản đã lưu trên thiết bị này. Vui lòng thử lại.');
      return;
    }
    if (!mounted.current) return;
    setPending(null);
    setMessage(null);
    setPhase('edit');
  }, [deps, userId]);

  const reload = useCallback(() => { setPhase('loading'); setAttempt(value => value + 1); }, []);

  return { draft, phase, errors, pending, message, requestId, busy, setField, setAnswer, review, edit, confirm, retryPending, discardPending, reload };
}
