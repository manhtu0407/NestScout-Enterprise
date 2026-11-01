import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';

import { authMessages, signInCopy } from '../auth/auth-messages';
import { otpLength, usePhoneSignIn } from '../auth/use-phone-sign-in';
import { maskPhone } from '../phone/vietnam-phone';
import { SignInGate } from '../sign-in/sign-in-gate';
import { parseSignInRole } from '../sign-in/sign-in-types';
import { useAccess } from '../state/access-provider';

export function OtpVerificationScreen() {
  const router = useRouter();
  const access = useAccess();
  const signIn = usePhoneSignIn();
  const { role: roleParam } = useLocalSearchParams<{ role?: string }>();
  const role = parseSignInRole(roleParam);
  const [code, setCode] = useState('');
  const [success, setSuccess] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const submitting = useRef(false);

  if (access.otpPhone === null) return <Redirect href={{ pathname: '/phone', params: { role } }} />;

  const verify = (value: string) => {
    if (submitting.current) return;
    submitting.current = true;
    void signIn.submitCode(value).then((ok) => {
      submitting.current = false;
      if (ok) {
        setSuccess(true);
        return;
      }
      setShakeKey((key) => key + 1);
      setCode('');
    });
  };

  const changeCode = (next: string) => {
    setCode(next);
    if (next.length === otpLength) verify(next);
  };

  const changeNumber = () => {
    signIn.cancel();
    router.replace({ pathname: '/phone', params: { role } });
  };

  return (
    <SignInGate
      role={role}
      onRoleChange={() => undefined}
      step="code"
      digits=""
      onDigitsChange={() => undefined}
      code={code}
      onCodeChange={changeCode}
      maskedPhone={maskPhone(access.otpPhone)}
      busy={signIn.busy}
      success={success}
      phoneError={null}
      codeError={signIn.codeInvalid ? signInCopy.enterAllDigits : null}
      failure={signIn.failure ? authMessages[signIn.failure] : null}
      shakeKey={shakeKey}
      resendSeconds={signIn.resendSeconds}
      onSubmitPhone={() => undefined}
      onSubmitCode={() => verify(code)}
      onResend={() => void signIn.resend()}
      onChangeNumber={changeNumber}
      onBack={changeNumber}
    />
  );
}
