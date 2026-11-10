import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';
import { Icon, type KaelSessionSummary } from '@/features/shared';
import { ConversationMenu, type ConversationMenuItem } from './conversation-menu';
import { RecentSessionRow, type RecentSession } from './recent-session';
import { relativeTimeLabel } from './request-views';
import { SessionDeleteDialog, SessionRenameDialog } from './session-dialogs';
import type { KaelSessionActionResult, KaelSessionsStatus } from './use-kael-sessions';

const metrics = horizonLayout.sessionsPanel;
const colors = horizonColors.sessionsPanel;
const searchDelay = 300;

export type KaelSessionsPanel = {
  pinned: readonly KaelSessionSummary[];
  items: readonly KaelSessionSummary[];
  hasMore: boolean;
  status: KaelSessionsStatus;
  loadingMore: boolean;
  search: string;
  archivedView: boolean;
  activeId: string | null;
  now: Date;
  onSearch: (value: string) => void;
  onArchivedView: (value: boolean) => void;
  onOpen: (id: string) => void;
  onRetry: () => void;
  onLoadMore: () => void;
  onRename: (id: string, title: string) => Promise<KaelSessionActionResult>;
  onPin: (id: string, pinned: boolean) => Promise<KaelSessionActionResult>;
  onArchive: (id: string, archived: boolean) => Promise<KaelSessionActionResult>;
  onDelete: (id: string) => Promise<KaelSessionActionResult>;
};

export const sessionMessages = {
  failed: 'Chưa thực hiện được. Vui lòng thử lại.',
  notFound: 'Cuộc trò chuyện này không còn nữa.',
  busy: 'Kael đang trả lời trong cuộc trò chuyện này. Hãy đợi Kael trả lời xong rồi xóa.',
  unresolvedEffect: 'Cuộc trò chuyện này có thao tác trên tài khoản chưa được đối soát nên chưa thể xóa. Hãy mở lại và kiểm tra kết quả trước.',
} as const;

export function sessionFailureMessage(result: KaelSessionActionResult): string | null {
  switch (result) {
    case 'ok':
    case 'deleted':
      return null;
    case 'busy':
      return sessionMessages.busy;
    case 'unresolved_effect':
      return sessionMessages.unresolvedEffect;
    case 'not_found':
      return sessionMessages.notFound;
    case 'failed':
      return sessionMessages.failed;
  }
}

export function toSessionRow(session: KaelSessionSummary, now: Date): RecentSession {
  const preview = session.busy ? 'Kael đang trả lời…' : session.attention ? 'Cần bạn xem lại' : session.preview || 'Chưa có tin nhắn';
  return { id: session.id, title: session.title, preview, timeLabel: relativeTimeLabel(session.updatedAt, now), phase: null, pinned: session.pinned };
}

type Dialog = { kind: 'rename' | 'delete'; session: KaelSessionSummary } | null;

export function KaelSessionsSection({ panel }: { panel: KaelSessionsPanel }) {
  const { onSearch } = panel;
  const [draft, setDraft] = useState(panel.search);
  const [menu, setMenu] = useState<KaelSessionSummary | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (draft === panel.search) return;
    const timer = setTimeout(() => onSearch(draft), searchDelay);
    return () => clearTimeout(timer);
  }, [draft, onSearch, panel.search]);

  const all = useMemo(() => [...panel.pinned, ...panel.items], [panel.items, panel.pinned]);
  const searching = panel.search.trim() !== '';
  const row = (session: KaelSessionSummary) => <RecentSessionRow
    key={session.id}
    session={toSessionRow(session, panel.now)}
    active={session.id === panel.activeId}
    onPress={() => panel.onOpen(session.id)}
    onMore={() => setMenu(session)}
    onTogglePin={() => { setNotice(null); void panel.onPin(session.id, !session.pinned).then(result => setNotice(sessionFailureMessage(result))); }}/>;

  const closeDialog = () => { if (!busy) { setDialog(null); setDialogError(null); } };
  const runDialog = async (action: () => Promise<KaelSessionActionResult>) => {
    setBusy(true);
    setDialogError(null);
    const result = await action();
    setBusy(false);
    const message = sessionFailureMessage(result);
    if (message === null) setDialog(null);
    else setDialogError(message);
  };

  const menuItems = (session: KaelSessionSummary): readonly ConversationMenuItem[] => [
    { id: 'rename', label: 'Đổi tên', icon: 'compose', onPress: () => { setDialogError(null); setDialog({ kind: 'rename', session }); } },
    ...(session.archived ? [] : [{ id: 'pin', label: session.pinned ? 'Bỏ ghim' : 'Ghim', icon: 'pin' as const, onPress: () => { setNotice(null); void panel.onPin(session.id, !session.pinned).then(result => setNotice(sessionFailureMessage(result))); } }]),
    { id: 'archive', label: session.archived ? 'Bỏ lưu trữ' : 'Lưu trữ', icon: 'archive', onPress: () => { setNotice(null); void panel.onArchive(session.id, !session.archived).then(result => setNotice(sessionFailureMessage(result))); } },
    { id: 'delete', label: 'Xóa', icon: 'trash', destructive: true, onPress: () => { setDialogError(null); setDialog({ kind: 'delete', session }); } },
  ];

  return <View>
    <View style={styles.search}>
      <Icon name="search" size={metrics.searchIconSize} color={colors.placeholder}/>
      <TextInput
        accessibilityLabel="Tìm cuộc trò chuyện"
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={80}
        onChangeText={setDraft}
        placeholder="Tìm cuộc trò chuyện"
        placeholderTextColor={colors.placeholder}
        returnKeyType="search"
        style={styles.searchInput}
        value={draft}
      />
      {draft !== '' && <Pressable accessibilityRole="button" accessibilityLabel="Xóa từ khóa tìm kiếm" hitSlop={metrics.chipGap} onPress={() => { setDraft(''); onSearch(''); }}><Icon name="close" size={metrics.searchIconSize} color={colors.placeholder}/></Pressable>}
    </View>
    <View style={styles.chips}>
      <Pressable accessibilityRole="button" accessibilityLabel="Cuộc trò chuyện đang dùng" accessibilityState={{ selected: !panel.archivedView }} onPress={() => panel.onArchivedView(false)} style={[styles.chip, !panel.archivedView && styles.chipActive]}><Text style={[styles.chipText, !panel.archivedView && styles.chipTextActive]}>Đang dùng</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Cuộc trò chuyện đã lưu trữ" accessibilityState={{ selected: panel.archivedView }} onPress={() => panel.onArchivedView(true)} style={[styles.chip, panel.archivedView && styles.chipActive]}><Text style={[styles.chipText, panel.archivedView && styles.chipTextActive]}>Đã lưu trữ</Text></Pressable>
    </View>
    {notice !== null && <Text accessibilityLiveRegion="polite" style={styles.error}>{notice}</Text>}
    {panel.status === 'error' && <View>
      <Text accessibilityLiveRegion="polite" style={styles.error}>Chưa tải được danh sách cuộc trò chuyện.</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Tải lại danh sách cuộc trò chuyện" onPress={panel.onRetry} style={styles.link}><Text style={styles.linkText}>Thử lại</Text></Pressable>
    </View>}
    {panel.status === 'idle' && all.length === 0 && <Text accessibilityLiveRegion="polite" style={styles.status}>Đang tải cuộc trò chuyện…</Text>}
    {panel.status === 'ready' && all.length === 0 && <Text style={styles.status}>
      {searching ? 'Không có cuộc trò chuyện nào khớp từ khóa.' : panel.archivedView ? 'Chưa có cuộc trò chuyện nào được lưu trữ.' : 'Chưa có cuộc trò chuyện nào. Bấm Chat để bắt đầu với Kael.'}
    </Text>}
    {panel.pinned.length > 0 && <View>
      <Text accessibilityRole="header" style={styles.groupTitle}>Đã ghim</Text>
      {panel.pinned.map(row)}
    </View>}
    {panel.items.length > 0 && <View>
      <Text accessibilityRole="header" style={styles.groupTitle}>{panel.archivedView ? 'Đã lưu trữ' : 'Gần đây'}</Text>
      {panel.items.map(row)}
    </View>}
    {panel.hasMore && <Pressable accessibilityRole="button" accessibilityLabel="Xem thêm cuộc trò chuyện" accessibilityState={{ busy: panel.loadingMore }} disabled={panel.loadingMore} onPress={panel.onLoadMore} style={styles.link}><Text style={styles.linkText}>{panel.loadingMore ? 'Đang tải…' : 'Xem thêm'}</Text></Pressable>}
    {menu !== null && <Modal transparent visible animationType="none" onRequestClose={() => setMenu(null)} statusBarTranslucent>
      <ConversationMenu title={menu.title} items={menuItems(menu)} onClose={() => setMenu(null)}/>
    </Modal>}
    {dialog?.kind === 'rename' && <SessionRenameDialog title={dialog.session.title} busy={busy} error={dialogError} onClose={closeDialog} onSubmit={title => { const id = dialog.session.id; void runDialog(() => panel.onRename(id, title)); }}/>}
    {dialog?.kind === 'delete' && <SessionDeleteDialog title={dialog.session.title} busy={busy} error={dialogError} onClose={closeDialog} onConfirm={() => { const id = dialog.session.id; void runDialog(() => panel.onDelete(id)); }}/>}
  </View>;
}

const styles = StyleSheet.create({
  search: { minHeight: metrics.searchHeight, borderRadius: metrics.searchRadius, backgroundColor: colors.searchFill, paddingHorizontal: metrics.searchPaddingHorizontal, flexDirection: 'row', alignItems: 'center', gap: metrics.searchGap, marginBottom: metrics.searchMarginBottom },
  searchInput: { flex: 1, color: colors.searchText, fontSize: metrics.searchFontSize, minHeight: metrics.searchHeight },
  chips: { flexDirection: 'row', gap: metrics.chipGap, marginBottom: metrics.chipMarginBottom },
  chip: { minHeight: metrics.chipHeight, borderRadius: metrics.chipRadius, paddingHorizontal: metrics.chipPaddingHorizontal, backgroundColor: colors.chipFill, justifyContent: 'center' },
  chipActive: { backgroundColor: colors.chipActiveFill },
  chipText: { color: colors.chipText, fontSize: metrics.chipFontSize, fontWeight: metrics.chipFontWeight },
  chipTextActive: { color: colors.chipActiveText },
  groupTitle: { color: horizonColors.text, fontSize: horizonLayout.sidebarList.groupTitleFontSize, fontWeight: horizonLayout.sidebarList.groupTitleFontWeight, marginTop: horizonLayout.sidebarList.groupMarginTop, marginBottom: horizonLayout.sidebarList.groupTitleMarginBottom },
  status: { color: horizonColors.mutedSecondary, fontSize: metrics.statusFontSize, lineHeight: metrics.statusLineHeight, paddingVertical: metrics.chipGap },
  error: { color: colors.error, fontSize: metrics.statusFontSize, lineHeight: metrics.statusLineHeight, paddingVertical: metrics.chipGap },
  link: { minHeight: metrics.linkMinHeight, justifyContent: 'center' },
  linkText: { color: colors.link, fontSize: metrics.linkFontSize, fontWeight: metrics.linkFontWeight },
});
