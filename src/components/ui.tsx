import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import React, { ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  ScrollViewProps,
  StyleProp,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { settingsStore } from '@/lib/storage';
import { mono, radius, space, useColors } from './theme';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

// ─── Feedback ───────────────────────────────────────────────────────────────
export const feedback = {
  success() {
    if (settingsStore.get().haptics) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  },
  error() {
    if (settingsStore.get().haptics) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  },
  tap() {
    if (settingsStore.get().haptics) Haptics.selectionAsync().catch(() => {});
  },
};

export async function copy(text: string, label = 'Copied') {
  await Clipboard.setStringAsync(text);
  feedback.tap();
  Alert.alert(label, text.length > 120 ? text.slice(0, 120) + '…' : text);
}

export function confirm(title: string, message: string, action: string, destructive = false): Promise<boolean> {
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: action, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ]),
  );
}

// ─── Layout ─────────────────────────────────────────────────────────────────
export function Screen({ children, contentStyle, ...rest }: ScrollViewProps & { children: ReactNode; contentStyle?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={[{ padding: space.lg, paddingBottom: 48, gap: space.lg }, contentStyle]}
      keyboardShouldPersistTaps="handled"
      contentInsetAdjustmentBehavior="automatic"
      {...rest}
    >
      {children}
    </ScrollView>
  );
}

export function Card({ children, style, padded = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  const c = useColors();
  return (
    <View
      style={[
        { backgroundColor: c.card, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
        padded && { padding: space.lg },
        { overflow: 'hidden' },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: -space.sm, paddingHorizontal: 4 }}>
      <Text style={{ color: c.textDim, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 }}>{children}</Text>
      {right}
    </View>
  );
}

export function Txt({ children, dim, faint, size = 15, weight, style, selectable, numberOfLines, monospace }: {
  children: ReactNode;
  dim?: boolean;
  faint?: boolean;
  size?: number;
  weight?: '400' | '500' | '600' | '700' | '800';
  style?: any;
  selectable?: boolean;
  numberOfLines?: number;
  monospace?: boolean;
}) {
  const c = useColors();
  return (
    <Text
      selectable={selectable}
      numberOfLines={numberOfLines}
      style={[{ color: faint ? c.textFaint : dim ? c.textDim : c.text, fontSize: size, fontWeight: weight, lineHeight: size * 1.35 }, monospace && mono, style]}
    >
      {children}
    </Text>
  );
}

// ─── Buttons ────────────────────────────────────────────────────────────────
type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

export function Button({ title, onPress, icon, variant = 'primary', disabled, loading, style, compact }: {
  title: string;
  onPress: () => void;
  icon?: IconName;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}) {
  const c = useColors();
  const palette = {
    primary: { bg: c.primary, fg: c.primaryText, border: c.primary },
    secondary: { bg: c.primarySoft, fg: c.primary, border: c.primarySoft },
    danger: { bg: c.dangerSoft, fg: c.danger, border: c.dangerSoft },
    ghost: { bg: 'transparent', fg: c.primary, border: c.border },
  }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        feedback.tap();
        onPress();
      }}
      disabled={disabled || loading}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: space.sm,
          backgroundColor: palette.bg,
          borderColor: palette.border,
          borderWidth: 1,
          borderRadius: radius.md,
          paddingVertical: compact ? 9 : 14,
          paddingHorizontal: compact ? 12 : 18,
          opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={palette.fg} /> : icon ? <Ionicons name={icon} size={compact ? 16 : 19} color={palette.fg} /> : null}
      <Text style={{ color: palette.fg, fontSize: compact ? 14 : 16, fontWeight: '600' }}>{title}</Text>
    </Pressable>
  );
}

export function IconButton({ icon, onPress, color, label }: { icon: IconName; onPress: () => void; color?: string; label: string }) {
  const c = useColors();
  return (
    <Pressable accessibilityLabel={label} hitSlop={10} onPress={onPress} style={({ pressed }) => ({ padding: 6, opacity: pressed ? 0.5 : 1 })}>
      <Ionicons name={icon} size={20} color={color ?? c.textDim} />
    </Pressable>
  );
}

// ─── Rows ───────────────────────────────────────────────────────────────────
export function IconBadge({ icon, color, bg, size = 36 }: { icon: IconName; color?: string; bg?: string; size?: number }) {
  const c = useColors();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 3.2, backgroundColor: bg ?? c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={icon} size={size * 0.52} color={color ?? c.primary} />
    </View>
  );
}

export function ListItem({ icon, title, subtitle, onPress, right, danger, last, iconColor, iconBg }: {
  icon?: IconName;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: ReactNode;
  danger?: boolean;
  last?: boolean;
  iconColor?: string;
  iconBg?: string;
}) {
  const c = useColors();
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
        backgroundColor: pressed ? c.cardAlt : 'transparent',
        borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
        borderBottomColor: c.border,
      })}
    >
      {icon && <IconBadge icon={icon} color={danger ? c.danger : iconColor} bg={danger ? c.dangerSoft : iconBg} />}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: danger ? c.danger : c.text, fontSize: 16, fontWeight: '500' }}>{title}</Text>
        {!!subtitle && (
          <Text style={{ color: c.textDim, fontSize: 13 }} numberOfLines={2}>
            {subtitle}
          </Text>
        )}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={c.textFaint} /> : null)}
    </Pressable>
  );
}

export function KV({ label, value, monospace, onCopy, last }: { label: string; value?: string | number | null; monospace?: boolean; onCopy?: boolean; last?: boolean }) {
  const c = useColors();
  if (value === undefined || value === null || value === '') return null;
  const v = String(value);
  return (
    <Pressable
      disabled={!onCopy}
      onLongPress={() => copy(v)}
      onPress={() => onCopy && copy(v)}
      style={{
        flexDirection: 'row',
        paddingVertical: 10,
        gap: space.md,
        borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
        borderBottomColor: c.border,
      }}
    >
      <Text style={{ color: c.textDim, fontSize: 14, width: 110 }}>{label}</Text>
      <Text selectable style={[{ color: c.text, fontSize: 14, flex: 1 }, monospace && mono]}>
        {v}
      </Text>
      {onCopy && <Ionicons name="copy-outline" size={15} color={c.textFaint} />}
    </Pressable>
  );
}

export function ToggleRow({ title, subtitle, value, onValueChange, last }: { title: string; subtitle?: string; value: boolean; onValueChange: (v: boolean) => void; last?: boolean }) {
  const c = useColors();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
        borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
        borderBottomColor: c.border,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: c.text, fontSize: 16 }}>{title}</Text>
        {!!subtitle && <Text style={{ color: c.textDim, fontSize: 13 }}>{subtitle}</Text>}
      </View>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ true: c.primary }} />
    </View>
  );
}

// ─── Inputs ─────────────────────────────────────────────────────────────────
export function Field({ label, help, error, ...props }: TextInputProps & { label?: string; help?: string; error?: string | null }) {
  const c = useColors();
  return (
    <View style={{ gap: 6 }}>
      {!!label && <Text style={{ color: c.textDim, fontSize: 13, fontWeight: '600' }}>{label}</Text>}
      <TextInput
        placeholderTextColor={c.textFaint}
        {...props}
        style={[
          {
            color: c.text,
            backgroundColor: c.cardAlt,
            borderColor: error ? c.danger : c.border,
            borderWidth: 1,
            borderRadius: radius.md,
            paddingHorizontal: 14,
            paddingVertical: 12,
            fontSize: 16,
            minHeight: props.multiline ? 90 : undefined,
            textAlignVertical: props.multiline ? 'top' : 'center',
          },
          props.style,
        ]}
      />
      {!!error && <Text style={{ color: c.danger, fontSize: 13 }}>{error}</Text>}
      {!!help && !error && <Text style={{ color: c.textFaint, fontSize: 12 }}>{help}</Text>}
    </View>
  );
}

export function Chips<T extends string>({ label, options, value, onChange }: {
  label?: string;
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const c = useColors();
  return (
    <View style={{ gap: 6 }}>
      {!!label && <Text style={{ color: c.textDim, fontSize: 13, fontWeight: '600' }}>{label}</Text>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map((o) => {
          const active = o.value === value;
          return (
            <Pressable
              key={o.value}
              onPress={() => {
                feedback.tap();
                onChange(o.value);
              }}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: active ? c.primary : c.cardAlt,
                borderWidth: 1,
                borderColor: active ? c.primary : c.border,
              }}
            >
              <Text style={{ color: active ? c.primaryText : c.text, fontSize: 14, fontWeight: active ? '600' : '400' }}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ─── Misc ───────────────────────────────────────────────────────────────────
export function Notice({ tone = 'info', icon, children }: { tone?: 'info' | 'warning' | 'danger' | 'success'; icon?: IconName; children: ReactNode }) {
  const c = useColors();
  const p = {
    info: { bg: c.primarySoft, fg: c.primary, i: 'information-circle' as IconName },
    warning: { bg: c.warningSoft, fg: c.warning, i: 'warning' as IconName },
    danger: { bg: c.dangerSoft, fg: c.danger, i: 'alert-circle' as IconName },
    success: { bg: c.successSoft, fg: c.success, i: 'checkmark-circle' as IconName },
  }[tone];
  return (
    <View style={{ flexDirection: 'row', gap: 10, padding: space.md, borderRadius: radius.md, backgroundColor: p.bg, alignItems: 'flex-start' }}>
      <Ionicons name={icon ?? p.i} size={18} color={p.fg} style={{ marginTop: 1 }} />
      <Text style={{ color: c.text, fontSize: 14, flex: 1, lineHeight: 20 }}>{children}</Text>
    </View>
  );
}

export function Empty({ icon, title, subtitle, children }: { icon: IconName; title: string; subtitle?: string; children?: ReactNode }) {
  const c = useColors();
  return (
    <View style={{ alignItems: 'center', paddingVertical: 48, gap: space.md }}>
      <IconBadge icon={icon} size={64} />
      <Text style={{ color: c.text, fontSize: 18, fontWeight: '600' }}>{title}</Text>
      {!!subtitle && <Text style={{ color: c.textDim, fontSize: 14, textAlign: 'center', maxWidth: 300 }}>{subtitle}</Text>}
      {children}
    </View>
  );
}

export function Pill({ text, tone = 'info' }: { text: string; tone?: 'info' | 'success' | 'danger' | 'warning' | 'neutral' }) {
  const c = useColors();
  const p = {
    info: [c.primarySoft, c.primary],
    success: [c.successSoft, c.success],
    danger: [c.dangerSoft, c.danger],
    warning: [c.warningSoft, c.warning],
    neutral: [c.cardAlt, c.textDim],
  }[tone];
  return (
    <View style={{ backgroundColor: p[0], borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}>
      <Text style={{ color: p[1], fontSize: 12, fontWeight: '600' }}>{text}</Text>
    </View>
  );
}

export function Meter({ used, total }: { used: number; total: number }) {
  const c = useColors();
  const pct = total > 0 ? Math.min(1, used / total) : 0;
  const color = pct > 0.9 ? c.danger : pct > 0.7 ? c.warning : c.primary;
  return (
    <View style={{ gap: 6 }}>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: c.cardAlt, overflow: 'hidden' }}>
        <View style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: color }} />
      </View>
      <Text style={{ color: c.textDim, fontSize: 12 }}>
        {used} / {total} bytes used ({Math.round(pct * 100)}%)
      </Text>
    </View>
  );
}

export function MonoBlock({ text }: { text: string }) {
  const c = useColors();
  return (
    <Pressable onLongPress={() => copy(text)}>
      <Text selectable style={[mono, { color: c.mono, fontSize: 12, lineHeight: 18, backgroundColor: c.cardAlt, padding: space.md, borderRadius: radius.md }]}>
        {text}
      </Text>
    </Pressable>
  );
}
