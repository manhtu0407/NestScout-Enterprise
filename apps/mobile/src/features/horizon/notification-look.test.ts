import { horizonLayout } from '@/theme/layout';

import { kaelExpressionImages } from './kael-assets';
import { glyphMotions, hapticForTone, lookFor } from './notification-look';

const label = 'Yêu cầu “Sửa vòi nước”';

test('each stage kind the database reports gets its own motion and progress badge', () => {
  const kinds = (['job_en_route', 'job_arrived', 'job_working', 'job_paused'] as const).map(kind => lookFor(kind, 'b'));
  expect(kinds.map(look => look.motion)).toEqual(['slide', 'drop', 'tap', 'settle']);
  expect(new Set(kinds.map(look => look.badge)).size).toBe(4);
  expect(kinds[3]).toMatchObject({ tone: 'attention', expression: 'calm' });
});

test('earlier progress rows without a stage kind still resolve from the notice wording', () => {
  const stages = ['có thợ đang trên đường tới.', 'có thợ đã đến nơi.', 'đang được thực hiện.', 'đang tạm dừng.'].map(ending => lookFor('job_progress', `${label} ${ending}`));
  expect(stages.map(stage => stage.motion)).toEqual(['slide', 'drop', 'tap', 'settle']);
  expect(new Set(stages.map(stage => stage.badge)).size).toBe(4);
  expect(stages.every(stage => stage.badge !== undefined)).toBe(true);
  expect(stages[3]).toMatchObject({ tone: 'attention', expression: 'calm' });
});

test('an unrecognised stage keeps the generic progress look', () => {
  expect(lookFor('job_progress', `${label} có cập nhật mới.`)).toMatchObject({ tone: 'info', motion: 'spin', expression: 'focus' });
});

test('a change decision takes its expression and tone from the outcome', () => {
  expect(lookFor('change_decided', 'Việc “A” đã được bên kia đồng ý đề nghị thay đổi.')).toMatchObject({ expression: 'happy', tone: 'success', motion: 'pop' });
  expect(lookFor('change_decided', 'Việc “A” đã bị bên kia từ chối đề nghị thay đổi.')).toMatchObject({ expression: 'calm', tone: 'attention', motion: 'shake' });
  expect(lookFor('change_decided', 'Việc “A” có kết quả mới.')).toMatchObject({ expression: 'calm', tone: 'info', motion: 'settle' });
});

test('completions are happy and pop in success green', () => {
  const completions = (['job_assigned', 'job_completed', 'work_approved', 'scope_approved'] as const).map(kind => lookFor(kind, 'b'));
  expect(completions.every(look => look.expression === 'happy' && look.motion === 'pop' && look.tone === 'success')).toBe(true);
});

test('disputes and incidents are alert and shake in critical red', () => {
  const incidents = (['work_disputed', 'job_escalated', 'escalation_received'] as const).map(kind => lookFor(kind, 'b'));
  expect(incidents.every(look => look.expression === 'alert' && look.motion === 'shake' && look.tone === 'critical')).toBe(true);
});

test('a new review shows Kael with a heart and Kael acting for the worker stays idle', () => {
  expect(lookFor('review_received', 'b')).toMatchObject({ expression: 'heart', tone: 'delight' });
  expect(lookFor('job_auto_accepted', 'b').expression).toBe('idle');
});

test('notices of unknown kind fall back to an idle Kael', () => {
  expect(lookFor(undefined, 'b')).toMatchObject({ expression: 'idle', tone: 'info' });
});

test('every look uses an existing Kael expression', () => {
  const kinds = ['quote_received', 'job_assigned', 'job_progress', 'job_en_route', 'job_arrived', 'job_working', 'job_paused', 'work_submitted', 'job_completed', 'scope_proposed', 'dispatch_exhausted', 'job_released', 'escalation_received', 'escalation_resolved', 'job_offered', 'work_approved', 'revision_requested', 'work_disputed', 'scope_approved', 'scope_rejected', 'resume_agreed', 'review_received', 'job_auto_accepted', 'job_withdrawn', 'job_escalated', 'change_requested', 'change_decided'] as const;
  for (const kind of kinds) expect(kaelExpressionImages[lookFor(kind, 'b').expression]).toBeDefined();
});

test('haptics follow the tone of the news', () => {
  expect(hapticForTone).toEqual({ info: 'light', delight: 'light', success: 'success', attention: 'warning', critical: 'warning' });
});

test('every motion springs from a configured spring', () => {
  for (const motion of Object.values(glyphMotions)) expect(horizonLayout.notificationGlyph.springs[motion.spring]).toBeDefined();
});
