import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { EmailSignUpForm, useAccess, type SignInRole } from '@/features/access';
import { getSupabaseClient } from '@/lib/supabase-client';
import { horizonLayout, layout, typography } from '@/theme/layout';
import { horizonColors as colors } from '@/theme/palette';
import { HorizonRoute } from './horizon-entry';

export function HostedKaelPreview() {
  const access = useAccess();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [signUp, setSignUp] = useState(false);
  const [role, setRole] = useState<SignInRole>('client');
  const signedIn = (access.phase === 'client' || access.phase === 'worker') && access.identity === 'verified';

  const showAccount = () => { setError(false); setOpen(true); };
  const openSignUp = () => { setOpen(false); setSignUp(true); };
  const changeRole = (next: SignInRole) => { access.setIntent(next); setRole(next); };
  const closeAccount = () => { setPassword(''); setOpen(false); };
  async function signIn() {
    setBusy(true);
    setError(false);
    try {
      const { error: refused } = await getSupabaseClient().auth.signInWithPassword({ email: email.trim(), password });
      if (refused) setError(true);
      else { setEmail(''); closeAccount(); }
    } catch {
      setError(true);
    } finally {
      setPassword('');
      setBusy(false);
    }
  }

  return <SafeAreaProvider>
    <HorizonRoute onPreviewMenu={showAccount}/>
    <View pointerEvents="box-none" style={styles.banner}>
      <Pressable accessibilityRole="button" onPress={showAccount} style={styles.control}>
        <Text style={styles.label}>Kael Preview · {signedIn ? 'Tài khoản' : 'Đăng nhập'}</Text>
      </Pressable>
    </View>
    <Modal visible={open} transparent onRequestClose={closeAccount}>
      <View style={styles.backdrop}>
        <View accessibilityViewIsModal style={styles.card}>
          <Text accessibilityRole="header" style={styles.label}>Kael Preview · NestScout Production</Text>
          <Text style={styles.label}>Chỉ dùng tài khoản kiểm thử đã được cấp quyền. Tác vụ nghiệp vụ đang tắt.</Text>
          {signedIn ? <Pressable accessibilityRole="button" onPress={() => { void access.signOut(); closeAccount(); }} style={styles.control}>
            <Text style={styles.label}>Đăng xuất Preview</Text>
          </Pressable> : <>
            <TextInput accessibilityLabel="Email kiểm thử" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" value={email} onChangeText={setEmail} style={styles.input}/>
            <TextInput accessibilityLabel="Mật khẩu kiểm thử" secureTextEntry value={password} onChangeText={setPassword} style={styles.input}/>
            <Pressable accessibilityRole="button" disabled={busy || !email.trim() || !password} onPress={() => { void signIn(); }} style={styles.control}>
              <Text style={styles.label}>{busy ? 'Đang đăng nhập…' : 'Đăng nhập Preview'}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={openSignUp} style={styles.control}>
              <Text style={styles.label}>Tạo tài khoản bằng Email</Text>
            </Pressable>
          </>}
          {error && <Text accessibilityRole="alert" style={styles.label}>Đăng nhập Preview không thành công.</Text>}
          <Pressable accessibilityRole="button" onPress={closeAccount} style={styles.control}><Text style={styles.label}>Đóng</Text></Pressable>
        </View>
      </View>
    </Modal>
    <Modal visible={signUp && !signedIn} animationType="slide" onRequestClose={() => setSignUp(false)}>
      <EmailSignUpForm role={role} onRoleChange={changeRole} onBack={() => setSignUp(false)} />
    </Modal>
  </SafeAreaProvider>;
}

const styles = StyleSheet.create({
  banner: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center' },
  control: { minHeight: layout.control.minHeight, justifyContent: 'center', padding: layout.spacing.sm, backgroundColor: colors.modePicker.iconSurface, borderRadius: layout.radius.small },
  label: { ...typography.caption, color: colors.label },
  backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: layout.spacing.lg, backgroundColor: colors.bg },
  card: { width: horizonLayout.hostedKaelPreview.cardWidth, maxWidth: horizonLayout.hostedKaelPreview.cardMaxWidth, gap: layout.spacing.sm, padding: layout.spacing.md },
  input: { ...typography.caption, color: colors.label, backgroundColor: colors.modePicker.iconSurface, padding: layout.spacing.sm, borderRadius: layout.radius.small },
});
