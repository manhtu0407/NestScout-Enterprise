import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Alert, Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';
import MarkdownIt from 'markdown-it';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

const metrics = horizonLayout.kaelRichReply;
const markdown = new MarkdownIt({ html: false, breaks: true, linkify: false });
type Token = ReturnType<typeof markdown.parse>[number];

function safeLink(href: string | number | null): string | null {
  if (typeof href !== 'string' || !/^https:\/\//i.test(href)) return null;
  try {
    const url = new URL(href);
    return url.hostname && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export function kaelMarkdown(text: string, streaming = false): Token[] {
  const source = streaming ? text.replace(/[\uD800-\uDBFF]$/, '') : text;
  const tokens = markdown.parse(source, {});
  if (streaming && !source.endsWith('\n')) {
    const last = tokens.at(-1);
    if (last?.type === 'fence' && last.map?.[0] === source.split('\n').length - 1) tokens.pop();
    const inline = tokens.findLast(token => token.type === 'inline');
    const tail = inline?.children?.at(-1);
    if (last?.type !== 'fence' && tail?.type === 'text') {
      tail.content = tail.content.replace(/!?\[[^\]\n]*(?:\]\([^\n)]*)?$/, '').replace(/(^|\s)[*_~`]{1,3}(?=\S)|[*_~`]{1,3}$/g, '$1');
    }
  }
  return tokens;
}

type Node = { token: Token; children: Node[] };

function toTree(tokens: readonly Token[]): Node[] {
  const root: Node[] = [];
  const stack = [root];
  for (const token of tokens) {
    if (token.nesting < 0) { if (stack.length > 1) stack.pop(); continue; }
    const node = { token, children: token.children ? toTree(token.children) : [] };
    stack.at(-1)?.push(node);
    if (token.nesting > 0) stack.push(node.children);
  }
  return root;
}

function openLink(url: string) {
  void Linking.openURL(url).catch(() => Alert.alert('Không thể mở liên kết'));
}

function inline(nodes: readonly Node[]): ReactNode[] {
  return nodes.map(({ token, children }, key) => {
    switch (token.type) {
      case 'text': return token.content;
      case 'softbreak':
      case 'hardbreak': return '\n';
      case 'code_inline': return <Text key={key} style={styles.mono}>{token.content}</Text>;
      case 'strong_open': return <Text key={key} style={styles.bold}>{inline(children)}</Text>;
      case 'em_open': return <Text key={key} style={styles.emphasis}>{inline(children)}</Text>;
      case 's_open': return <Text key={key} style={styles.strike}>{inline(children)}</Text>;
      case 'image': return inline(children);
      case 'link_open': {
        const url = safeLink(token.attrGet('href'));
        return <Text key={key} accessibilityRole={url ? 'link' : undefined} onPress={url ? () => openLink(url) : undefined} style={url ? styles.link : undefined}>{inline(children)}</Text>;
      }
      default: return inline(children);
    }
  });
}

function blocks(nodes: readonly Node[], style: StyleProp<TextStyle>): ReactNode[] {
  return nodes.map(({ token, children }, key) => {
    switch (token.type) {
      case 'heading_open':
        return <Text key={key} accessibilityRole="header" selectable style={[style, styles.bold, token.tag === 'h1' && styles.title]}>{inline(children)}</Text>;
      case 'inline': return inline(children);
      case 'paragraph_open': return <Text key={key} selectable style={style}>{inline(children)}</Text>;
      case 'fence':
      case 'code_block': return <ScrollView key={key} horizontal style={styles.code}><Text selectable style={[style, styles.mono]}>{token.content.replace(/\n$/, '')}</Text></ScrollView>;
      case 'blockquote_open': return <View key={key} style={styles.quote}>{blocks(children, style)}</View>;
      case 'hr': return <View key={key} style={styles.rule}/>;
      case 'bullet_list_open':
      case 'ordered_list_open':
        return <View key={key} style={styles.list}>{children.map((item, index) => <View key={index} style={styles.row}>
          <Text style={style}>{token.type === 'bullet_list_open' ? '•' : `${Number(token.attrGet('start') ?? 1) + index}.`}</Text>
          <View style={styles.item}>{blocks(item.children, style)}</View>
        </View>)}</View>;
      case 'table_open': return <ScrollView key={key} horizontal><View style={styles.table}>{blocks(children, style)}</View></ScrollView>;
      case 'thead_open':
      case 'tbody_open': return <View key={key}>{blocks(children, style)}</View>;
      case 'tr_open': return <View key={key} style={styles.row}>{blocks(children, style)}</View>;
      case 'th_open':
      case 'td_open': return <Text key={key} selectable accessibilityRole={token.type === 'th_open' ? 'header' : undefined} style={[style, styles.cell, token.type === 'th_open' && styles.bold]}>{inline(children)}</Text>;
      default: return null;
    }
  });
}

type Props = { text: string; style?: StyleProp<TextStyle>; streaming?: boolean; incomplete?: boolean };

export const KaelStreamingText = memo(function KaelStreamingText({ text, style, streaming = false, incomplete = false }: Props) {
  const [preview, setPreview] = useState(text);
  const latest = useRef(text);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    latest.current = text;
    if (!streaming) {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
      setPreview(text);
    } else if (timer.current === null) {
      timer.current = setTimeout(() => {
        timer.current = null;
        setPreview(latest.current);
      }, metrics.refreshMs);
    }
  }, [streaming, text]);
  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current);
  }, []);
  const shown = streaming ? preview : text;
  const nodes = useMemo(() => toTree(kaelMarkdown(shown, streaming || incomplete)), [shown, streaming, incomplete]);
  return <View style={styles.blocks}>{blocks(nodes, style)}</View>;
});

const styles = StyleSheet.create({
  blocks: { gap: metrics.blockGap },
  bold: { fontWeight: metrics.boldWeight },
  emphasis: { fontStyle: 'italic' },
  strike: { textDecorationLine: 'line-through' },
  link: { textDecorationLine: 'underline' },
  title: { fontSize: metrics.titleSize, lineHeight: metrics.titleLineHeight },
  mono: { fontFamily: Platform.select({ ios: metrics.iosMonoFont, default: metrics.monoFont }) },
  code: { padding: metrics.codePadding, borderWidth: StyleSheet.hairlineWidth, borderColor: horizonColors.workerSidebar.hairline },
  rule: { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: horizonColors.workerSidebar.hairline },
  quote: { borderLeftWidth: metrics.quoteRule, borderColor: horizonColors.workerSidebar.hairline, paddingLeft: metrics.quoteInset, gap: metrics.quoteGap },
  list: { gap: metrics.listGap },
  row: { flexDirection: 'row', gap: metrics.rowGap },
  item: { flex: 1, gap: metrics.listGap },
  table: { borderWidth: StyleSheet.hairlineWidth, borderColor: horizonColors.workerSidebar.hairline },
  cell: { width: metrics.cellWidth, padding: metrics.cellPadding, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: horizonColors.workerSidebar.hairline },
});
