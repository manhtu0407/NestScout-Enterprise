import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import type { AuthFailure } from '../auth/auth-gateway';
import { authMessages, phoneMessages } from '../auth/auth-messages';
import { usePhoneSignIn } from '../auth/use-phone-sign-in';
import { useSocialSignIn } from '../auth/use-social-sign-in';
import { toDialable } from '../sign-in/phone-format';
import { SignInGate } from '../sign-in/sign-in-gate';
import { parseSignInRole, type SignInRole } from '../sign-in/sign-in-types';
import { useAccess } from '../state/access-provider';

export function PhoneEntryScreen() {
  const router = useRouter();
  const signIn = usePhoneSignIn();
  const social = useSocialSignIn();
  const { cancelHorizonTransfer, setIntent } = useAccess();
  const { role: roleParam } = useLocalSearchParams<{ role?: string }>();
  const role = parseSignInRole(roleParam);
  const [digits, setDigits] = useState('');

  useEffect(() => () => cancelHorizonTransfer(), [cancelHorizonTransfer]);

  const changeRole = (next: SignInRole) => {
    setIntent(next);
    router.setParams({ role: next });
  };

  const submit = () => {
    void signIn.submitPhone(toDialable(digits)).then((sent) => {
      if (sent) router.push({ pathname: '/verify', params: { role } });
    });
  };

  return (
    <SignInGate
      role={role}
      onRoleChange={changeRole}
      step="phone"
      digits={digits}
      onDigitsChange={setDigits}
      code=""
      onCodeChange={() => undefined}
      maskedPhone=""
      busy={signIn.busy || social.busy}
      success={false}
      phoneError={signIn.phoneError ? phoneMessages[signIn.phoneError] : null}
      codeError={null}
      failure={signIn.failure ?? social.failure ? authMessages[(signIn.failure ?? social.failure) as AuthFailure] : null}
      shakeKey={0}
      resendSeconds={0}
      onSubmitPhone={submit}
      onSocialSignIn={(provider) => void social.signIn(provider)}
      onEmailSignUp={() => router.push({ pathname: '/email', params: { role } })}
      onSubmitCode={() => undefined}
      onResend={() => undefined}
      onChangeNumber={() => undefined}
      onBack={() => router.back()}
    />
  );
}
