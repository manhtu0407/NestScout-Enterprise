import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

import type { IntakeField } from './service-catalog';

const metrics = horizonLayout.supportScreens;
const colors = horizonColors.supportScreens;
const webInputStyle = { outlineStyle: 'solid', outlineWidth: 0 } as const;

type Props = { field: IntakeField; value: string; error?: string; onChange: (value: string) => void };

export function IntakeFieldInput({ field, value, error, onChange }: Props) {
  const optionalNote = field.required ? '' : ' (không bắt buộc)';
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{`${field.label}${optionalNote}`}</Text>
      {field.kind === 'choice' ? (
        <View accessibilityRole="radiogroup" accessibilityLabel={field.label} style={styles.chips}>
          {(field.options ?? []).map(option => {
            const selected = option === value;
            return (
              <Pressable key={option} accessibilityRole="radio" accessibilityLabel={option} accessibilityState={{ checked: selected }} onPress={() => onChange(selected ? '' : option)} style={[styles.chip, selected && styles.chipSelected]}>
                <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{option}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View style={[styles.box, field.kind === 'multiline' && styles.boxMultiline]}>
          <TextInput
            accessibilityLabel={field.label}
            style={[styles.input, field.kind === 'multiline' && styles.inputMultiline, webInputStyle]}
            value={value}
            onChangeText={onChange}
            placeholder={field.placeholder}
            placeholderTextColor={colors.searchPlaceholder}
            multiline={field.kind === 'multiline'}
            maxLength={field.maxLength}
            keyboardType={field.kind === 'count' ? 'number-pad' : 'default'}
            autoCorrect={field.kind !== 'count'}
          />
        </View>
      )}
      {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: metrics.fieldGap },
  label: { color: colors.sectionTitle, fontSize: metrics.fieldLabelSize, fontWeight: metrics.fieldLabelWeight, marginBottom: metrics.fieldLabelGap, marginLeft: metrics.sectionTitleInset },
  box: { minHeight: metrics.fieldHeight, borderRadius: metrics.fieldRadius, paddingHorizontal: metrics.fieldPaddingHorizontal, backgroundColor: colors.searchFill, justifyContent: 'center' },
  boxMultiline: { paddingVertical: metrics.consentPadding },
  input: { color: horizonColors.text, fontSize: metrics.fieldFontSize, minHeight: metrics.fieldHeight },
  inputMultiline: { minHeight: metrics.supportBodyMinHeight, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: metrics.skillChipGap },
  chip: { minHeight: metrics.buttonHeight, paddingHorizontal: metrics.skillChipPaddingHorizontal, borderRadius: metrics.buttonRadius, backgroundColor: colors.secondaryFill, justifyContent: 'center' },
  chipSelected: { backgroundColor: colors.primaryFill },
  chipLabel: { color: colors.secondaryLabel, fontSize: metrics.skillChipSize },
  chipLabelSelected: { color: colors.primaryLabel },
  error: { color: colors.danger, fontSize: metrics.fieldHintSize, lineHeight: metrics.rowDetailLineHeight, marginTop: metrics.fieldHintGap, marginLeft: metrics.sectionTitleInset },
});
