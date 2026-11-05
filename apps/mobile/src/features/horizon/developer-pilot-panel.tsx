import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAccess } from '@/features/access';
import { loadConfig } from '@/lib/config';
import { getSupabaseClient } from '@/lib/supabase-client';
import { layout, typography } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

export function developerPilotEnabled(): boolean {
  return __DEV__ && Platform.OS === 'web' && process.env.EXPO_PUBLIC_KAEL_DEVELOPER_PILOT === '1'
    && typeof window !== 'undefined' && /^http:\/\/(?:localhost|127\.0\.0\.1):8085$/.test(window.location.origin);
}

type PilotStatus = {
  budgets: { enabled: boolean; halted: boolean; cap_micro_usd: number; committed_micro_usd: number; charged_calls: number }[];
  calls: { run_id: string; thinking: boolean; requested_model: string; served_model: string | null; status: string; input_tokens: number | null; output_tokens: number | null; estimated_micro_usd: number | null }[];
  tools: { run_id: string; tool: string; outcome: string; error_code: string | null }[];
};

export function DeveloperPilotPanel() {
  const access = useAccess();
  const [expanded, setExpanded] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [status, setStatus] = useState<(PilotStatus & { ownerId: string; latestRun: string }) | null>(null);
  const signedIn = (access.phase === 'client' || access.phase === 'worker') && access.identity === 'verified';
  const userId = signedIn ? access.userId : null;
  useEffect(() => {
    let active = true;
    if (!userId) return;
    const ownerId = userId;
    const client = getSupabaseClient();
    async function refresh() {
      try {
        const [pilot, runs] = await Promise.all([
          client.rpc('kael_pilot_status'),
          client.from('kael_runs').select('id,status,error_code,provider,model').order('started_at', { ascending: false }).limit(1),
        ]);
        if (!active) return;
        if (pilot.error || runs.error) { setNotice('Chưa đọc được trạng thái local.'); return; }
        const run = runs.data?.[0];
        setStatus({ ...(pilot.data as PilotStatus), ownerId,
          latestRun: run ? `${run.id} · ${run.status} · ${run.error_code ?? run.model ?? 'chưa có model'}` : 'Chưa có lượt chat.' });
      } catch { if (active) setNotice('Chưa kết nối được trạng thái local.'); }
    }
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [userId]);
  async function signIn() {
    setBusy(true);
    setNotice('');
    try {
      const { error } = await getSupabaseClient().auth.signInWithPassword({ email: email.trim(), password });
      setNotice(error ? 'Đăng nhập local không thành công.' : 'Đã đăng nhập Supabase Auth local.');
      if (!error) setPassword('');
    } catch { setNotice('Auth local chưa khả dụng.'); }
    finally { setBusy(false); }
  }
  const ownStatus = status?.ownerId === userId ? status : null;
  const budget = ownStatus?.budgets[0];
  const call = ownStatus?.calls[0];
  return <View style={styles.panel}>
    <Pressable accessibilityRole="button" accessibilityLabel="Thông tin pilot local" onPress={() => setExpanded(value => !value)}>
      <Text style={styles.heading}>DEV 8085 · Auth/PostgreSQL local · {signedIn ? `${access.phase} xác thực` : 'chưa đăng nhập'} · effects OFF</Text>
    </Pressable>
    {expanded && <View style={styles.details}>
      <Text selectable style={styles.small}>{loadConfig().supabaseUrl} · Flash thường mặc định; “suy nghĩ kỹ” dùng Flash thinking. Không fallback.</Text>
      {!signedIn ? <View style={styles.form}>
        <TextInput accessibilityLabel="Email local" placeholder="Email tài khoản local" autoCapitalize="none" value={email} onChangeText={setEmail} style={styles.input}/>
        <TextInput accessibilityLabel="Mật khẩu local" placeholder="Mật khẩu local" secureTextEntry value={password} onChangeText={setPassword} style={styles.input}/>
        <Pressable accessibilityRole="button" disabled={busy || !email || !password} onPress={() => { void signIn(); }}><Text>Đăng nhập local</Text></Pressable>
      </View> : <View>
        <Text selectable style={styles.small}>User {userId} · {ownStatus?.latestRun ?? 'Đang đọc trạng thái local…'}</Text>
        <Text style={styles.small}>{budget ? `Ngân sách ${budget.enabled && !budget.halted ? 'được cấu hình' : 'khóa'} · giữ/chi ước tính $${(budget.committed_micro_usd / 1e6).toFixed(6)} / $${(budget.cap_micro_usd / 1e6).toFixed(2)} · ${budget.charged_calls} call` : 'Chưa có ủy quyền ngân sách local.'}</Text>
        <Text style={styles.small}>{call ? `${call.requested_model} → ${call.served_model ?? 'chưa xác nhận'} · ${call.thinking ? 'thinking: yêu cầu phân tích kỹ' : 'thường: mặc định tiết kiệm'} · ${call.status} · tokens ${call.input_tokens ?? '?'} / ${call.output_tokens ?? '?'}` : 'LIVE_PROVIDER_NOT_RUN · chưa có call được giữ ngân sách.'}</Text>
        {(ownStatus?.tools ?? []).slice(0, 3).map((tool, index) => <Text key={`${tool.run_id}-${index}`} style={styles.small}>{tool.tool}: {tool.outcome}{tool.error_code ? ` (${tool.error_code})` : ''}</Text>)}
        <Pressable accessibilityRole="button" onPress={() => { setStatus(null); void access.signOut(); }}><Text>Đăng xuất local</Text></Pressable>
      </View>}
      <Text style={styles.small}>Ảnh: IMAGE_NOT_CONNECTED. Feedback có lưu: chưa có hợp đồng dữ liệu. Formal review vẫn pending.</Text>
      {notice !== '' && <Text accessibilityRole="alert" style={styles.small}>{notice}</Text>}
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  panel: { backgroundColor: horizonColors.modePicker.iconSurface, paddingHorizontal: layout.spacing.md, paddingVertical: layout.spacing.sm },
  heading: { ...typography.caption, color: horizonColors.mint },
  details: { gap: layout.spacing.xs, paddingTop: layout.spacing.xs },
  small: { ...typography.caption, color: horizonColors.label },
  form: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: layout.spacing.sm },
  input: { backgroundColor: horizonColors.onFill, padding: layout.spacing.xs, borderRadius: layout.radius.small, fontSize: typography.caption.fontSize },
});
