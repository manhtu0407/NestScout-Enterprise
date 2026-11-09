import { useEffect, useRef, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SignInGate, authMessages, codeLength, formatNational, signInCopy, type SignInRole } from '@/features/access';
import { horizonLayout } from '@/theme/layout';

const previewCode = '123456';
const previewDelay = horizonLayout.signIn.previewDelay;

type Props = { initialRole: SignInRole; onDone: (role: SignInRole) => void; onClose: () => void };

export function SignInPreview({ initialRole, onDone, onClose }: Props) {
  const [role, setRole] = useState(initialRole);
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [digits, setDigits] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const later = (action: () => void, delay: number) => {
    timers.current.push(setTimeout(action, delay));
  };

  const sendCode = () => {
    if (busy) return;
    setBusy(true);
    later(() => {
      setBusy(false);
      setStep('code');
    }, previewDelay);
  };

  const verify = (value: string) => {
    if (busy || success) return;
    setBusy(true);
    later(() => {
      setBusy(false);
      if (value === previewCode) {
        setSuccess(true);
        later(() => onDone(role), horizonLayout.signIn.previewSuccessHold);
        return;
      }
      setCodeError(authMessages.invalid_code);
      setShakeKey((key) => key + 1);
      setCode('');
    }, previewDelay);
  };

  const changeCode = (next: string) => {
    setCode(next);
    setCodeError(null);
    if (next.length === codeLength) verify(next);
  };

  return (
    <SafeAreaProvider>
      <SignInGate
        role={role}
        onRoleChange={setRole}
        onSocialSignIn={() => undefined}
        step={step}
        digits={digits}
        onDigitsChange={setDigits}
        code={code}
        onCodeChange={changeCode}
        maskedPhone={`+84 ${formatNational(digits.replace(/^0/, ''))}`}
        busy={busy}
        success={success}
        phoneError={null}
        codeError={codeError}
        failure={null}
        shakeKey={shakeKey}
        resendSeconds={0}
        onSubmitPhone={sendCode}
        onSubmitCode={() => verify(code)}
        onResend={() => setCode('')}
        onChangeNumber={() => { setStep('phone'); setCode(''); setCodeError(null); }}
        onBack={step === 'code' ? () => { setStep('phone'); setCode(''); setCodeError(null); } : onClose}
        note={signInCopy.previewNote}
      />
    </SafeAreaProvider>
  );
}
