import { demoKaelTurn, demoReplyLabel, initialDemoState, workerDemoTurn, type DemoState, type DemoTurn } from './horizon-preview-demo';
import { serviceCategoryFor } from './service-catalog';

const opening = (id: string) => serviceCategoryFor(id)?.kaelOpening ?? '';

function play(...texts: string[]) {
  let state: DemoState = initialDemoState;
  return texts.map(text => {
    const turn = demoKaelTurn(state, text);
    state = turn.state;
    return turn;
  });
}

function last(...texts: string[]): DemoTurn {
  const turn = play(...texts).at(-1);
  if (turn === undefined) throw new Error('no turn played');
  return turn;
}

test('every demo reply is labelled as a simulation that sends nothing', () => {
  for (const turn of play(opening('plumbing'), 'Rò rỉ', 'Cần tìm thợ', '12 Lê Lợi, Quận 1', 'Ngày mai')) {
    expect(turn.reply.startsWith(demoReplyLabel)).toBe(true);
  }
});

test('an unmodified opening gets one clarifying question with at most five short choices', () => {
  const turn = last(opening('plumbing'));
  expect(turn.question?.prompt).toMatch(/rò rỉ, tắc nghẽn hay vấn đề khác/);
  expect(turn.reply).not.toContain(turn.question?.prompt ?? '');
  expect(turn.question?.options).toEqual(['Rò rỉ', 'Tắc nghẽn', 'Nước yếu']);
  expect(turn.state.booking).toBe(false);
  for (const id of ['electric', 'plumbing', 'aircon', 'house-cleaning', 'sofa-cleaning', 'minor-repair']) {
    expect(last(opening(id)).question?.options.length ?? 0).toBeLessThanOrEqual(5);
  }
});

test('a price question is answered without numbers, booking or asking for an address', () => {
  const turn = last('Thay vòi nước mất bao nhiêu tiền?');
  expect(turn.reply).toMatch(/chưa có bảng giá chính thức/);
  expect(turn.reply).not.toMatch(/\d{3}/);
  expect(turn.reply).not.toMatch(/địa chỉ/);
  expect(turn.state.booking).toBe(false);
});

test('a request with problem, place and time is summarised without asking again and nothing is submitted', () => {
  const turn = last('Vòi bếp chảy nước liên tục, mình cần thợ tới nhà 22 Lê Văn A, Quận 7, sáng mai.');
  expect(turn.reply).toMatch(/Mình tóm tắt để bạn xem lại/);
  expect(turn.reply).toMatch(/Quận 7/);
  expect(turn.reply).toMatch(/sáng mai/);
  expect(turn.reply).not.toMatch(/Thợ cần đến địa chỉ nào/);
  expect(turn.reply).toMatch(/không tạo và không gửi yêu cầu/);
  expect(turn.question).toBeNull();
});

test('known details are kept and only the missing one is asked', () => {
  const turn = last('Mình cần vệ sinh căn hộ 2 phòng ngủ sáng thứ bảy');
  expect(turn.state.facts.time).toBe('sáng thứ bảy');
  expect(turn.reply).toMatch(/Thợ cần đến địa chỉ nào/);
  expect(turn.reply).not.toMatch(/Bạn muốn thợ đến vào khoảng nào/);
  const next = last('Mình cần vệ sinh căn hộ 2 phòng ngủ sáng thứ bảy', '5 Nguyễn Huệ, Quận 1');
  expect(next.reply).toMatch(/Mình tóm tắt để bạn xem lại/);
});

test('a later correction of the place replaces the earlier one', () => {
  const turn = last('Cần thợ sửa vòi bếp ở 22 Lê Văn A, Quận 3', 'À địa chỉ là Quận 7');
  expect(turn.state.facts.location).toBe('Quận 7');
  expect(turn.reply).toMatch(/cập nhật địa điểm thành Quận 7/);
});

test('saying it is only a question stops the intake without creating anything', () => {
  const turn = last('Cần thợ sửa vòi bếp', 'Không cần thợ nữa, mình chỉ hỏi thôi.');
  expect(turn.state.booking).toBe(false);
  expect(turn.reply).toMatch(/Chưa có yêu cầu nào được tạo hay gửi/);
});

test('an unrelated message is not pulled into a service flow', () => {
  const turn = last('Mình muốn luyện tiếng Trung.');
  expect(turn.reply).toMatch(/không chuyển sang luồng dịch vụ/);
  expect(turn.state.booking).toBe(false);
  expect(turn.question).toBeNull();
});

test('the other category classifies a known job and is honest about an unsupported one', () => {
  expect(last(opening('other')).question).toBeNull();
  const sofa = last(opening('other'), 'Mình muốn giặt ghế sofa ba chỗ bị bẩn.');
  expect(sofa.question?.prompt).toBe('Việc này thuộc nhóm Vệ sinh sofa. Bạn muốn hỏi cách xử lý hay cần tìm người đến làm giúp?');
  expect(sofa.state.booking).toBe(false);
  expect(sofa.reply).not.toMatch(/địa chỉ/);
  const bees = last(opening('other'), 'Nhà mình có ong làm tổ');
  expect(bees.reply).toMatch(/chưa nằm trong 6 nhóm dịch vụ/);
  expect(bees.reply).toMatch(/114/);
  expect(bees.state.booking).toBe(false);
});

test('danger signs get safety advice first and no promise of a worker', () => {
  const turn = last('Ổ cắm có tia lửa và mùi khét');
  expect(turn.reply).toMatch(/Trước hết vì an toàn/);
  expect(turn.question?.prompt).toBe('Bạn muốn mình hướng dẫn thêm hay cần tìm thợ kiểm tra?');
  expect(turn.reply).toMatch(/chưa cam kết thời gian có thợ/);
  expect(turn.state.booking).toBe(false);
});

test('worker mode never uses the customer booking path', () => {
  const turn = workerDemoTurn(initialDemoState, 'Cần thợ sửa vòi bếp ở Quận 7 sáng mai');
  expect(turn.state.booking).toBe(false);
  expect(turn.reply).toMatch(/không dùng công cụ đặt dịch vụ của khách hàng/);
});

test('a general maintenance question stays advice even when it mentions cleaning', () => {
  const turn = last('Máy lạnh có cần vệ sinh mỗi tháng không?');
  expect(turn.state.booking).toBe(false);
  expect(turn.reply).not.toMatch(/địa chỉ/);
  expect(turn.question?.options).toEqual(['Hướng dẫn cách xử lý', 'Cần tìm thợ']);
});

test('an address or time typed in answer to a question is kept exactly as written', () => {
  const turn = last(serviceCategoryFor('plumbing')?.kaelOpening ?? '', 'Rò rỉ', 'Cần tìm thợ', '22 Lê Văn A, Quận 7', 'Ngày mai');
  expect(turn.state.facts).toEqual({ problem: 'Sửa nước: Rò rỉ', location: '22 Lê Văn A, Quận 7', time: 'Ngày mai' });
  expect(turn.reply).toMatch(/Mình tóm tắt để bạn xem lại/);
});

test('a full request in one message keeps the street address', () => {
  const turn = last('Vòi bếp chảy nước liên tục, mình cần thợ tới nhà 22 Lê Văn A, Quận 7, sáng mai.');
  expect(turn.state.facts.location).toBe('22 Lê Văn A, Quận 7');
  expect(turn.state.facts.time).toBe('sáng mai');
});
