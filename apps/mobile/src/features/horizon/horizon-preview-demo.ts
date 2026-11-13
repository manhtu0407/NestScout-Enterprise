import type { KaelQuestion, NotificationKind } from '@/features/shared';

import { preferredOptions, serviceCategories, serviceCategoryFor, type ServiceCategoryId } from './service-catalog';

export const demoReplyLabel = '_Bản mô phỏng giao diện — không phải câu trả lời của Kael thật, không gửi yêu cầu nào._';

type Awaiting = 'describe' | 'problem' | 'purpose' | 'location' | 'time' | null;

export type DemoFacts = { problem: string | null; location: string | null; time: string | null };

export type DemoState = {
  category: ServiceCategoryId | null;
  booking: boolean;
  awaiting: Awaiting;
  facts: DemoFacts;
  turn: number;
};

export type DemoTurn = { state: DemoState; reply: string; question: KaelQuestion | null };

export const initialDemoState: DemoState = { category: null, booking: false, awaiting: null, facts: { problem: null, location: null, time: null }, turn: 0 };

const keywords: readonly [ServiceCategoryId, RegExp][] = [
  ['aircon', /máy lạnh|điều hoà|điều hòa/],
  ['sofa-cleaning', /sofa|ghế nỉ|ghế da/],
  ['house-cleaning', /dọn|vệ sinh (nhà|căn hộ|phòng)|lau nhà|tổng vệ sinh/],
  ['electric', /điện|ổ cắm|công tắc|aptomat|cầu dao|bóng đèn|chập/],
  ['plumbing', /nước|vòi|ống|bồn|tắc|cống|rò/],
  ['minor-repair', /treo|lắp|kệ|khoan|bản lề|tủ/],
];

const problemChoices: Record<ServiceCategoryId, { prompt: string; options: readonly string[] }> = {
  electric: { prompt: 'Bạn đang gặp vấn đề gì về điện vậy?', options: ['Mất điện một phần', 'Nhảy aptomat', 'Ổ cắm hoặc công tắc hỏng', 'Có mùi khét hoặc tia lửa'] },
  plumbing: { prompt: 'Bạn đang gặp vấn đề gì với nước vậy: rò rỉ, tắc nghẽn hay vấn đề khác?', options: ['Rò rỉ', 'Tắc nghẽn', 'Nước yếu'] },
  aircon: { prompt: 'Máy lạnh của bạn đang thế nào?', options: ['Không mát', 'Chảy nước', 'Kêu to', 'Muốn vệ sinh định kỳ'] },
  'house-cleaning': { prompt: 'Bạn cần dọn kiểu nào?', options: ['Dọn định kỳ', 'Tổng vệ sinh', 'Sau sửa chữa'] },
  'sofa-cleaning': { prompt: 'Sofa của bạn đang cần xử lý gì?', options: ['Vết bẩn đồ uống', 'Có mùi', 'Vệ sinh định kỳ'] },
  'minor-repair': { prompt: 'Bạn cần lắp hoặc sửa gì vậy?', options: ['Treo kệ hoặc tranh', 'Lắp thiết bị', 'Sửa đồ gỗ'] },
  other: { prompt: 'Bạn muốn làm hoặc sửa việc gì ở nhà vậy? Cứ mô tả bằng lời của bạn nhé, mình sẽ giúp tìm nhóm phù hợp nếu NestScout có hỗ trợ.', options: [] },
};

const purposeOptions = ['Hướng dẫn cách xử lý', 'Cần tìm thợ'] as const;

const stopPattern = /chỉ (muốn )?hỏi|không (cần|đặt|tìm) (thợ|dịch vụ)|không cần nữa|thôi không/;
const explicitBookPattern = /cần (tìm )?thợ|tìm thợ|tìm người|đặt (thợ|dịch vụ|lịch)|muốn đặt|thợ (đến|tới|qua)|đến (nhà|sửa|làm)|tới nhà/;
const taskBookPattern = /cần (dọn|vệ sinh|sửa|lắp|treo)/;
const infoPattern = /\?|bao nhiêu|giá|chi phí|tại sao|vì sao|do đâu|có cần|thế nào|cách|bao lâu|hướng dẫn/;

function wantsWorker(lower: string): boolean {
  return explicitBookPattern.test(lower) || (taskBookPattern.test(lower) && !infoPattern.test(lower));
}

const pricePattern = /bao nhiêu|giá|chi phí|tốn/;
const safetyPattern = /khét|tia lửa|giật|khói|cháy|nước[^.]*(ổ cắm|ổ điện)|(ổ cắm|ổ điện)[^.]*nước|tổ ong|ong làm tổ/;
const locationPattern = /(?:\d+[^,.;\n]*,\s*|\d+[^,.;\n]*?\s)?(?:quận|huyện|phường|tp\.?|thủ đức|bình thạnh|gò vấp|tân bình|phú nhuận|q\.?\s?\d)[^,.;\n]*/;
const timePattern = /(?:(?:sáng|chiều|tối|trưa)\s+)?(?:hôm nay|ngày mai|mai|thứ (?:hai|ba|tư|năm|sáu|bảy)|chủ nhật|cuối tuần|càng sớm càng tốt|linh hoạt|chưa biết)(?:\s+(?:sáng|chiều|tối|trưa))?/;

function classify(text: string): ServiceCategoryId | null {
  return keywords.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
}

function titleOf(id: ServiceCategoryId | null): string {
  return id === null ? 'dịch vụ' : (serviceCategoryFor(id)?.title ?? 'dịch vụ');
}

function categoryOfOpening(text: string): ServiceCategoryId | null {
  return serviceCategories.find(category => category.kaelOpening === text.trim())?.id ?? null;
}

function question(id: string, prompt: string, options: readonly string[], turn: number): KaelQuestion | null {
  return options.length === 0 ? null : { id: `demo-${turn}-${id}`, prompt, options: options.slice(0, 5), date: false };
}

function withLabel(body: string): string {
  return `${demoReplyLabel}\n\n${body}`;
}

const safetyAdvice = 'Trước hết vì an toàn: nếu có thể làm an toàn, hãy ngắt cầu dao hoặc khoá van nguồn, không chạm vào ổ cắm hay khu vực ướt và tránh xa chỗ nguy hiểm. Nếu có cháy, khói hoặc người bị thương, gọi 114 ngay. NestScout không phải dịch vụ cấp cứu và chưa cam kết thời gian có thợ.';

function nextBookingStep(state: DemoState, lead: string[]): DemoTurn {
  const { facts } = state;
  const known = [
    facts.problem ? `vấn đề: ${facts.problem.replace(/[.!?\s]+$/, '')}` : null,
    facts.location ? `địa điểm: ${facts.location}` : null,
    facts.time ? `thời gian mong muốn: ${facts.time}` : null,
  ].filter((item): item is string => item !== null);
  const ack = known.length > 0 ? `Mình đã có ${known.join('; ')}.` : '';
  const turn = state.turn;
  if (facts.problem === null) {
    const choice = problemChoices[state.category ?? 'other'];
    return { state: { ...state, awaiting: 'problem' }, reply: withLabel([...lead, ack, choice.prompt].filter(Boolean).join('\n\n')), question: question('problem', choice.prompt, choice.options, turn) };
  }
  if (facts.location === null) {
    return { state: { ...state, awaiting: 'location' }, reply: withLabel([...lead, ack, 'Thợ cần đến địa chỉ nào? Bạn ghi số nhà, đường và quận nhé.'].filter(Boolean).join('\n\n')), question: null };
  }
  if (facts.time === null) {
    const prompt = 'Bạn muốn thợ đến vào khoảng nào? Đây chỉ là mong muốn, chưa phải lịch hẹn đã xác nhận.';
    return { state: { ...state, awaiting: 'time' }, reply: withLabel([...lead, ack, prompt].filter(Boolean).join('\n\n')), question: question('time', prompt, preferredOptions, turn) };
  }
  const summary = [
    'Mình tóm tắt để bạn xem lại:',
    `- Vấn đề: ${facts.problem}`,
    `- Địa điểm: ${facts.location}`,
    `- Thời gian mong muốn: ${facts.time} (chưa phải lịch hẹn đã xác nhận)`,
    '',
    'Trong app thật, Kael chuẩn bị bản nháp và app hiện nút để bạn tự xác nhận gửi; chưa có thợ, giá hay lịch hẹn nào được xác nhận. Bản mô phỏng này không tạo và không gửi yêu cầu.',
  ].join('\n');
  return { state: { ...state, awaiting: null }, reply: withLabel([...lead, summary].join('\n\n')), question: null };
}

function captureFacts(state: DemoState, text: string, lower: string): { state: DemoState; notes: string[] } {
  const notes: string[] = [];
  const location = text.match(new RegExp(locationPattern.source, 'i'))?.[0].trim() ?? null;
  const time = lower.match(timePattern)?.[0].trim() ?? null;
  const facts = { ...state.facts };
  if (location !== null) {
    if (facts.location !== null && facts.location.toLowerCase() !== location.toLowerCase()) notes.push(`Mình cập nhật địa điểm thành ${location}.`);
    facts.location = location;
  }
  if (time !== null) facts.time = time;
  return { state: { ...state, facts }, notes };
}

function demoTurn(previous: DemoState, rawText: string): DemoTurn {
  const text = rawText.trim();
  const lower = text.toLowerCase();
  const base: DemoState = { ...previous, turn: previous.turn + 1 };
  const opening = categoryOfOpening(text);

  if (opening !== null) {
    const choice = problemChoices[opening];
    const intro = opening === 'other' ? '' : `Mình sẵn sàng giúp về ${titleOf(opening).toLowerCase()}.`;
    return {
      state: { ...initialDemoState, turn: base.turn, category: opening, awaiting: opening === 'other' ? 'describe' : 'problem' },
      reply: withLabel([intro, choice.prompt].filter(Boolean).join(' ')),
      question: question('problem', choice.prompt, choice.options, base.turn),
    };
  }

  if (stopPattern.test(lower)) {
    return { state: { ...base, booking: false, awaiting: null }, reply: withLabel('Được, mình dừng phần tìm thợ. Chưa có yêu cầu nào được tạo hay gửi. Bạn cứ hỏi tiếp nhé.'), question: null };
  }

  const lead = safetyPattern.test(lower) ? [safetyAdvice] : [];

  if ((base.awaiting === 'location' || base.awaiting === 'time') && text !== '') {
    const captured = captureFacts(base, text, lower);
    const correctsOther = base.awaiting === 'time' ? captured.state.facts.location !== base.facts.location && captured.state.facts.time === base.facts.time : false;
    if (correctsOther) return nextBookingStep(captured.state, [...lead, ...captured.notes]);
    return nextBookingStep({ ...captured.state, facts: { ...captured.state.facts, [base.awaiting]: text } }, lead);
  }
  if (base.awaiting === 'purpose') {
    if (/tìm thợ|cần thợ|đặt|người đến/.test(lower)) {
      const captured = captureFacts({ ...base, booking: true }, text, lower);
      return nextBookingStep(captured.state, [...lead, ...captured.notes]);
    }
    if (/hướng dẫn|hỏi|cách/.test(lower)) return { state: { ...base, awaiting: null }, reply: withLabel([...lead, 'Mình sẽ hướng dẫn các bước kiểm tra cơ bản, an toàn và nói rõ phần nào nên để thợ làm. Kael thật trả lời chi tiết ở đây; bản mô phỏng chỉ minh hoạ là không có yêu cầu nào được tạo.'].join('\n\n')), question: null };
  }

  const detected = classify(lower);
  const answersProblem = base.awaiting === 'problem' && (detected !== null || problemChoices[base.category ?? 'other'].options.includes(text));
  const category = detected ?? base.category;

  if (base.awaiting === 'describe') {
    if (detected === null) {
      return {
        state: { ...base, awaiting: null, category: 'other' },
        reply: withLabel([...lead, 'Việc này chưa nằm trong 6 nhóm dịch vụ của NestScout và mình chưa xác minh được có thợ phù hợp, nên chưa tạo yêu cầu nào. Mình vẫn có thể tư vấn chung cho bạn.'].join('\n\n')),
        question: null,
      };
    }
    const next = { ...base, category: detected, facts: { ...base.facts, problem: text } };
    if (wantsWorker(lower)) {
      const captured = captureFacts({ ...next, booking: true }, text, lower);
      return nextBookingStep(captured.state, [...lead, `Việc này thuộc nhóm ${titleOf(detected)}.`, ...captured.notes]);
    }
    const prompt = `Việc này thuộc nhóm ${titleOf(detected)}. Bạn muốn hỏi cách xử lý hay cần tìm người đến làm giúp?`;
    return { state: { ...next, awaiting: 'purpose' }, reply: withLabel([...lead, prompt].join('\n\n')), question: question('purpose', prompt, purposeOptions, base.turn) };
  }

  if (answersProblem) {
    const next = { ...base, category, facts: { ...base.facts, problem: `${titleOf(category)}: ${text}` } };
    if (base.booking || wantsWorker(lower)) {
      const captured = captureFacts({ ...next, booking: true }, text, lower);
      return nextBookingStep(captured.state, [...lead, ...captured.notes]);
    }
    const prompt = 'Bạn muốn mình hướng dẫn cách xử lý hay cần tìm thợ đến làm?';
    return { state: { ...next, awaiting: 'purpose' }, reply: withLabel([...lead, prompt].join('\n\n')), question: question('purpose', prompt, purposeOptions, base.turn) };
  }

  if (base.booking || wantsWorker(lower)) {
    const withProblem = detected !== null || base.facts.problem === null ? { ...base, category, facts: { ...base.facts, problem: base.facts.problem ?? (detected !== null ? text : null) } } : base;
    const captured = captureFacts({ ...withProblem, booking: true }, text, lower);
    return nextBookingStep(captured.state, [...lead, ...captured.notes]);
  }

  if (detected === null && lead.length === 0) {
    return { state: { ...base, awaiting: null }, reply: withLabel('Kael thật sẽ trả lời câu hỏi này như một trợ lý thông thường và không chuyển sang luồng dịch vụ.'), question: null };
  }

  if (lead.length > 0) {
    const prompt = 'Bạn muốn mình hướng dẫn thêm hay cần tìm thợ kiểm tra?';
    return { state: { ...base, category, awaiting: 'purpose', facts: { ...base.facts, problem: base.facts.problem ?? text } }, reply: withLabel([...lead, prompt].join('\n\n')), question: question('purpose', prompt, purposeOptions, base.turn) };
  }

  if (infoPattern.test(lower)) {
    const body = pricePattern.test(lower)
      ? 'Chi phí thường phụ thuộc vào tình trạng thực tế, vật tư cần thay và công thợ. NestScout chưa có bảng giá chính thức nên mình không đưa ra con số.'
      : `Mình sẽ giải thích chung về ${titleOf(category).toLowerCase()} và nói rõ chỗ nào chưa chắc chắn. Kael thật trả lời chi tiết ở đây.`;
    const prompt = 'Bạn muốn mình hướng dẫn thêm hay cần tìm thợ hỗ trợ?';
    return { state: { ...base, category, awaiting: 'purpose' }, reply: withLabel(`${body}\n\n${prompt}`), question: question('purpose', prompt, purposeOptions, base.turn) };
  }

  const choice = problemChoices[category ?? 'other'];
  return { state: { ...base, category, awaiting: category === 'other' ? 'describe' : 'problem' }, reply: withLabel(choice.prompt), question: question('problem', choice.prompt, choice.options, base.turn) };
}

export function workerDemoTurn(previous: DemoState, rawText: string): DemoTurn {
  const state = { ...previous, turn: previous.turn + 1, awaiting: null, booking: false };
  return { state, reply: withLabel(`Ở chế độ Thợ, Kael hỗ trợ công việc của thợ và không dùng công cụ đặt dịch vụ của khách hàng. Bạn vừa hỏi: “${rawText.trim()}”.`), question: null };
}

export function demoKaelTurn(previous: DemoState, rawText: string): DemoTurn {
  const turn = demoTurn(previous, rawText);
  if (turn.question === null) return turn;
  const body = turn.reply.slice(demoReplyLabel.length).replace(turn.question.prompt, '').trim();
  return { ...turn, reply: body === '' ? demoReplyLabel : withLabel(body) };
}

export type DemoBannerNotice = { id: string; kind: NotificationKind; phase: string; title: string; body: string };

const customerLabel = 'Yêu cầu “Sửa vòi nước bồn rửa”';
const workerLabel = 'Việc “Sửa ống thoát nước”';

export const demoBannerNotices: Readonly<Record<'client' | 'worker', readonly DemoBannerNotice[]>> = {
  client: [
    { id: 'c-quote', kind: 'quote_received', phase: 'Báo giá', title: 'Báo giá mới', body: `${customerLabel} có báo giá mới đang chờ bạn quyết định.` },
    { id: 'c-dispatch-none', kind: 'dispatch_exhausted', phase: 'Dispatch', title: 'Chưa có thợ nhận việc', body: `${customerLabel} chưa có thợ nhận. Bạn có thể mời lại hoặc hủy trong Yêu cầu của tôi.` },
    { id: 'c-dispatch-limit', kind: 'dispatch_exhausted', phase: 'Dispatch', title: 'Đã hết lượt tìm thợ tự động', body: `${customerLabel} đã hết lượt tìm thợ tự động. Bạn có thể mời lại hoặc hủy trong Yêu cầu của tôi.` },
    { id: 'c-assigned', kind: 'job_assigned', phase: 'Nhận việc', title: 'Đã có thợ nhận việc', body: `${customerLabel} đã có thợ nhận việc.` },
    { id: 'c-en-route', kind: 'job_en_route', phase: 'Thực hiện', title: 'Công việc có cập nhật', body: `${customerLabel} có thợ đang trên đường tới.` },
    { id: 'c-arrived', kind: 'job_arrived', phase: 'Thực hiện', title: 'Công việc có cập nhật', body: `${customerLabel} có thợ đã đến nơi.` },
    { id: 'c-working', kind: 'job_working', phase: 'Thực hiện', title: 'Công việc có cập nhật', body: `${customerLabel} đang được thực hiện.` },
    { id: 'c-paused', kind: 'job_paused', phase: 'Thực hiện', title: 'Công việc có cập nhật', body: `${customerLabel} đang tạm dừng.` },
    { id: 'c-scope', kind: 'scope_proposed', phase: 'Đổi phạm vi', title: 'Đề xuất đổi phạm vi', body: `${customerLabel} có đề xuất thay đổi phạm vi đang chờ bạn quyết định.` },
    { id: 'c-change-asked', kind: 'change_requested', phase: 'Đổi lịch / huỷ', title: 'Có đề nghị đổi lịch', body: `${customerLabel} có đề nghị thay đổi đang chờ bạn phản hồi.` },
    { id: 'c-change-agreed', kind: 'change_decided', phase: 'Đổi lịch / huỷ', title: 'Đề nghị thay đổi được đồng ý', body: `${customerLabel} đã được bên kia đồng ý đề nghị thay đổi.` },
    { id: 'c-change-refused', kind: 'change_decided', phase: 'Đổi lịch / huỷ', title: 'Đề nghị thay đổi bị từ chối', body: `${customerLabel} đã bị bên kia từ chối đề nghị thay đổi.` },
    { id: 'c-submitted', kind: 'work_submitted', phase: 'Nghiệm thu', title: 'Thợ đã gửi kết quả', body: `${customerLabel} đang chờ bạn nghiệm thu.` },
    { id: 'c-completed', kind: 'job_completed', phase: 'Hoàn tất', title: 'Việc đã hoàn tất', body: `${customerLabel} đã hoàn tất.` },
    { id: 'c-released-replaced', kind: 'job_released', phase: 'Recovery', title: 'Thợ đã rút khỏi việc', body: 'Thợ trước đã rút khỏi yêu cầu “Sửa vòi nước bồn rửa”. Một thợ khác đã nhận việc thay.' },
    { id: 'c-released-invited', kind: 'job_released', phase: 'Recovery', title: 'Thợ đã rút khỏi việc', body: 'Thợ trước đã rút khỏi yêu cầu “Sửa vòi nước bồn rửa”. Hệ thống đã mời thợ khác; bạn sẽ được báo khi có thợ nhận.' },
    { id: 'c-released-none', kind: 'job_released', phase: 'Recovery', title: 'Thợ đã rút khỏi việc', body: 'Thợ trước đã rút khỏi yêu cầu “Sửa vòi nước bồn rửa” và chưa có thợ khác phù hợp. Bạn có thể mời lại hoặc hủy trong Yêu cầu của tôi.' },
    { id: 'c-resolved-proceed', kind: 'escalation_resolved', phase: 'Escalation', title: 'Sự cố đã được xử lý', body: 'Sự cố ở yêu cầu “Sửa vòi nước bồn rửa” đã được xem xét. Thợ sẽ tiếp tục công việc.' },
    { id: 'c-resolved-closed', kind: 'escalation_resolved', phase: 'Escalation', title: 'Sự cố đã được xử lý', body: 'Sự cố ở yêu cầu “Sửa vòi nước bồn rửa” đã được xem xét và đóng, chưa cần xử lý thêm.' },
    { id: 'c-resolved-replaced', kind: 'escalation_resolved', phase: 'Escalation', title: 'Sự cố đã được xử lý', body: 'Sự cố ở yêu cầu “Sửa vòi nước bồn rửa” đã được xem xét. Một thợ khác đã nhận việc thay.' },
    { id: 'c-operator', kind: 'escalation_received', phase: 'Escalation (operator)', title: 'Có sự cố cần xem xét', body: 'Khách báo thợ đã đến nhưng chưa bắt đầu việc “Sửa vòi nước bồn rửa”. Mở Xử lý sự cố để xem xét.' },
  ],
  worker: [
    { id: 'w-offered', kind: 'job_offered', phase: 'Dispatch', title: 'Có việc mới', body: `${workerLabel} đang chờ bạn phản hồi.` },
    { id: 'w-auto', kind: 'job_auto_accepted', phase: 'Nhận việc', title: 'Kael đã nhận việc giúp bạn', body: `${workerLabel} khớp hồ sơ của bạn nên Kael đã nhận. Bạn có thể xem trong Đã nhận việc.` },
    { id: 'w-scope-ok', kind: 'scope_approved', phase: 'Đổi phạm vi', title: 'Khách đồng ý đổi phạm vi', body: `${workerLabel} có đề xuất phạm vi đã được khách đồng ý.` },
    { id: 'w-scope-no', kind: 'scope_rejected', phase: 'Đổi phạm vi', title: 'Khách từ chối đổi phạm vi', body: `${workerLabel} có đề xuất phạm vi bị khách từ chối.` },
    { id: 'w-resume', kind: 'resume_agreed', phase: 'Đổi phạm vi', title: 'Khách đồng ý làm tiếp', body: `${workerLabel} được khách đồng ý làm tiếp.` },
    { id: 'w-change-asked', kind: 'change_requested', phase: 'Đổi lịch / huỷ', title: 'Có đề nghị huỷ việc', body: `${workerLabel} có đề nghị thay đổi đang chờ bạn phản hồi.` },
    { id: 'w-change-agreed', kind: 'change_decided', phase: 'Đổi lịch / huỷ', title: 'Đề nghị thay đổi được đồng ý', body: `${workerLabel} đã được bên kia đồng ý đề nghị thay đổi.` },
    { id: 'w-change-refused', kind: 'change_decided', phase: 'Đổi lịch / huỷ', title: 'Đề nghị thay đổi bị từ chối', body: `${workerLabel} đã bị bên kia từ chối đề nghị thay đổi.` },
    { id: 'w-approved', kind: 'work_approved', phase: 'Nghiệm thu', title: 'Khách đã nghiệm thu', body: `${workerLabel} đã được khách nghiệm thu.` },
    { id: 'w-revision', kind: 'revision_requested', phase: 'Nghiệm thu', title: 'Khách yêu cầu chỉnh sửa', body: `${workerLabel} cần chỉnh sửa theo ghi chú của khách.` },
    { id: 'w-disputed', kind: 'work_disputed', phase: 'Nghiệm thu', title: 'Khách khiếu nại kết quả', body: `${workerLabel} đang có khiếu nại từ khách.` },
    { id: 'w-review', kind: 'review_received', phase: 'Hoàn tất', title: 'Bạn có đánh giá mới', body: `${workerLabel} đã được khách đánh giá.` },
    { id: 'w-withdrawn-customer', kind: 'job_withdrawn', phase: 'Recovery', title: 'Khách đã mời thợ khác', body: 'Khách đã mời thợ khác cho việc “Sửa ống thoát nước” vì chưa thấy bạn đến. Việc này không còn trong danh sách của bạn.' },
    { id: 'w-escalated', kind: 'job_escalated', phase: 'Recovery', title: 'Khách báo chưa thấy bạn bắt đầu', body: 'Khách báo bạn đã đến nhưng chưa bắt đầu việc “Sửa ống thoát nước”. Hãy bắt đầu việc hoặc báo sự cố; yêu cầu đã được chuyển để xử lý.' },
    { id: 'w-withdrawn-operator', kind: 'job_withdrawn', phase: 'Escalation', title: 'Việc đã được giao cho thợ khác', body: 'Sau khi xem xét báo cáo sự cố, việc “Sửa ống thoát nước” đã được giao cho thợ khác và không còn trong danh sách của bạn.' },
  ],
};
