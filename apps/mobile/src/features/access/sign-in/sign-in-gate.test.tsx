import { fireEvent, render, screen } from '@testing-library/react-native';

import { SignInGate, type SignInGateProps } from './sign-in-gate';

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View, SafeAreaProvider: View };
});

const base: SignInGateProps = {
  role: 'client',
  onRoleChange: jest.fn(),
  onSocialSignIn: jest.fn(),
  step: 'phone',
  digits: '',
  onDigitsChange: jest.fn(),
  code: '',
  onCodeChange: jest.fn(),
  maskedPhone: '+84 ••• ••• 678',
  busy: false,
  success: false,
  phoneError: null,
  codeError: null,
  failure: null,
  shakeKey: 0,
  resendSeconds: 0,
  onSubmitPhone: jest.fn(),
  onSubmitCode: jest.fn(),
  onResend: jest.fn(),
  onChangeNumber: jest.fn(),
};

async function renderGate(overrides: Partial<SignInGateProps> = {}) {
  const props = { ...base, onSubmitPhone: jest.fn(), onSubmitCode: jest.fn(), onRoleChange: jest.fn(), onResend: jest.fn(), onChangeNumber: jest.fn(), ...overrides };
  await render(<SignInGate {...props} />);
  return props;
}

describe('sign-in gate phone step', () => {
  test('keeps the send action disabled until the number is complete', async () => {
    const props = await renderGate({ digits: '91234' });
    const button = screen.getByRole('button', { name: 'Gửi mã xác thực' });
    expect(button.props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(button);
    expect(props.onSubmitPhone).not.toHaveBeenCalled();
  });

  test('sends once the number is complete', async () => {
    const props = await renderGate({ digits: '912345678' });
    await fireEvent.press(screen.getByRole('button', { name: 'Gửi mã xác thực' }));
    expect(props.onSubmitPhone).toHaveBeenCalledTimes(1);
  });

  test('switches role from the segmented control', async () => {
    const props = await renderGate();
    await fireEvent.press(screen.getByRole('radio', { name: 'Thợ' }));
    expect(props.onRoleChange).toHaveBeenCalledWith('worker');
    expect(screen.getByRole('radio', { name: 'Khách hàng' }).props.accessibilityState).toMatchObject({ checked: true });
  });

  test('shows the worker copy and reports rejected numbers', async () => {
    await renderGate({ role: 'worker', phoneError: 'Số không hợp lệ' });
    expect(screen.getByText('Sẵn sàng nhận việc')).toBeTruthy();
    expect(screen.getByText('Số không hợp lệ')).toBeTruthy();
  });
});

describe('sign-in gate code step', () => {
  test('names the masked destination and offers resend only after the cooldown', async () => {
    await renderGate({ step: 'code', resendSeconds: 42 });
    expect(screen.getByText('Mã gồm 6 chữ số đã được gửi tới +84 ••• ••• 678.')).toBeTruthy();
    expect(screen.getByText('Gửi lại mã sau 42s')).toBeTruthy();
  });

  test('verifies only when all digits are present', async () => {
    const incomplete = await renderGate({ step: 'code', code: '123' });
    await fireEvent.press(screen.getByRole('button', { name: 'Xác nhận' }));
    expect(incomplete.onSubmitCode).not.toHaveBeenCalled();
  });

  test('confirms with the complete code and surfaces failures', async () => {
    const props = await renderGate({ step: 'code', code: '123456', failure: 'Mã chưa đúng.' });
    await fireEvent.press(screen.getByRole('button', { name: 'Xác nhận' }));
    expect(props.onSubmitCode).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Mã chưa đúng.')).toBeTruthy();
  });

  test('locks the actions while verifying', async () => {
    await renderGate({ step: 'code', code: '123456', busy: true });
    expect(screen.getByRole('button', { name: 'Xác nhận' }).props.accessibilityState).toMatchObject({ disabled: true, busy: true });
  });
});
