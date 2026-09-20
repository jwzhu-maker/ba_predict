import { useMemo, useState, type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { RADIUS, usePalette, type Palette } from "../theme";

/** Shared chrome. Kept in one file so the two clients look like one product. */

export function Card({
  title,
  subtitle,
  children,
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const p = usePalette();
  const s = useStyles(p);
  return (
    <View style={s.card}>
      {title ? (
        <View>
          <Text style={s.cardTitle}>{title}</Text>
          {subtitle ? <Text style={s.cardSubtitle}>{subtitle}</Text> : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function Btn({
  label,
  onPress,
  variant = "default",
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: "default" | "primary" | "danger";
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const p = usePalette();
  const s = useStyles(p);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        variant === "primary" && s.buttonPrimary,
        disabled && s.disabled,
        pressed && !disabled && s.pressed,
        style,
      ]}
    >
      <Text
        style={[
          s.buttonText,
          variant === "primary" && { color: p.accentInk },
          variant === "danger" && { color: p.danger },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const p = usePalette();
  const s = useStyles(p);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[s.chip, active && { borderColor: p.accent, backgroundColor: `${p.accent}22` }]}
    >
      <Text style={[s.chipText, active && { color: p.accent }]}>{label}</Text>
    </Pressable>
  );
}

export function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad" | "muted";
  hint?: string;
}) {
  const p = usePalette();
  const s = useStyles(p);
  const colour =
    tone === "good" ? p.accent : tone === "bad" ? p.danger : tone === "muted" ? p.muted : p.text;
  return (
    <View style={s.stat}>
      <Text style={s.statLabel}>{label.toUpperCase()}</Text>
      <Text style={[s.statValue, { color: colour }]}>{value}</Text>
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: "row", flexWrap: "wrap", gap: 8 }, style]}>{children}</View>;
}

export function Hint({ children, tone }: { children: ReactNode; tone?: "warn" }) {
  const p = usePalette();
  const s = useStyles(p);
  return <Text style={[s.hint, tone === "warn" && { color: p.warn }]}>{children}</Text>;
}

export function Prose({ children }: { children: ReactNode }) {
  const p = usePalette();
  const s = useStyles(p);
  return <Text style={s.prose}>{children}</Text>;
}

export function Notice({ children, tone }: { children: ReactNode; tone: "info" | "warn" }) {
  const p = usePalette();
  const s = useStyles(p);
  const colour = tone === "warn" ? p.warn : p.accent;
  return (
    <View style={[s.notice, { borderColor: `${colour}88`, backgroundColor: `${colour}14` }]}>
      <Text style={[s.noticeText, { color: tone === "warn" ? p.warn : p.text }]}>{children}</Text>
    </View>
  );
}

/**
 * A numeric field that keeps its own text while being edited.
 *
 * Driving a TextInput straight from a parsed number makes it impossible to
 * clear the field or type "0.0" — every keystroke is reformatted underneath
 * the cursor.
 */
export function NumberInput({
  label,
  value,
  hint,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  hint?: string;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  const p = usePalette();
  const s = useStyles(p);
  const [text, setText] = useState(String(value));
  const [editing, setEditing] = useState(false);

  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label.toUpperCase()}</Text>
      <TextInput
        style={s.input}
        value={editing ? text : String(value)}
        keyboardType="numeric"
        inputMode="decimal"
        placeholderTextColor={p.muted}
        onFocus={() => {
          setText(String(value));
          setEditing(true);
        }}
        onChangeText={setText}
        onBlur={() => {
          setEditing(false);
          const parsed = Number.parseFloat(text);
          if (!Number.isFinite(parsed)) return;
          let next = parsed;
          if (min !== undefined) next = Math.max(min, next);
          if (max !== undefined) next = Math.min(max, next);
          onChange(next);
        }}
      />
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

export function SwitchRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const p = usePalette();
  const s = useStyles(p);
  return (
    <View style={s.switchRow}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.switchLabel}>{label}</Text>
        {hint ? <Text style={s.hint}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: p.surface2, true: `${p.accent}66` }}
        thumbColor={value ? p.accent : p.muted}
      />
    </View>
  );
}

export function Picker<T extends string>({
  label,
  value,
  options,
  hint,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  hint?: string;
  onChange: (value: T) => void;
}) {
  const p = usePalette();
  const s = useStyles(p);
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label.toUpperCase()}</Text>
      <Row>
        {options.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            active={option.value === value}
            onPress={() => onChange(option.value)}
          />
        ))}
      </Row>
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

export function useStyles(p: Palette) {
  return useMemo(
    () =>
      StyleSheet.create({
        card: {
          backgroundColor: p.surface,
          borderColor: p.border,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: RADIUS,
          padding: 14,
          gap: 12,
        },
        cardTitle: { color: p.text, fontSize: 15, fontWeight: "600" },
        cardSubtitle: { color: p.muted, fontSize: 12, marginTop: 2 },
        button: {
          minHeight: 44,
          paddingHorizontal: 14,
          paddingVertical: 11,
          borderRadius: 10,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: p.border,
          backgroundColor: p.surface2,
          alignItems: "center",
          justifyContent: "center",
          flexGrow: 1,
        },
        buttonPrimary: { backgroundColor: p.accent, borderColor: p.accent },
        buttonText: { color: p.text, fontWeight: "600", fontSize: 14 },
        disabled: { opacity: 0.45 },
        pressed: { opacity: 0.75 },
        chip: {
          minHeight: 38,
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 999,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: p.border,
          backgroundColor: p.surface2,
          justifyContent: "center",
        },
        chipText: { color: p.muted, fontSize: 13, fontWeight: "600" },
        stat: {
          backgroundColor: p.surface2,
          borderRadius: 10,
          paddingHorizontal: 10,
          paddingVertical: 9,
          gap: 1,
          flexGrow: 1,
          flexBasis: 96,
        },
        statLabel: { color: p.muted, fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
        statValue: { fontSize: 17, fontWeight: "700" },
        hint: { color: p.muted, fontSize: 12, lineHeight: 17 },
        prose: { color: p.muted, fontSize: 13, lineHeight: 20 },
        notice: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, padding: 10 },
        noticeText: { fontSize: 12, lineHeight: 18 },
        field: { gap: 4 },
        fieldLabel: { color: p.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
        input: {
          minHeight: 44,
          borderRadius: 10,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: p.border,
          backgroundColor: p.surface2,
          color: p.text,
          paddingHorizontal: 12,
          fontSize: 15,
        },
        switchRow: { flexDirection: "row", alignItems: "center", gap: 12 },
        switchLabel: { color: p.text, fontSize: 14, fontWeight: "600" },
      }),
    [p],
  );
}
