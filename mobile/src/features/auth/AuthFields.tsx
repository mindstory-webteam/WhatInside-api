import { forwardRef, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { Icon } from '@/components/Icon';
import { FieldChrome } from '@/components/TextField';
import { Txt } from '@/components/Txt';
import { COUNTRY_CODE, formatNational, nationalDigits } from '@/lib/phone';
import { colors, fonts, radius, spacing, TAP } from '@/theme/tokens';

/** Mobile number with a fixed +91 prefix. ``value`` holds the 10 national digits. */
export const PhoneField = forwardRef<TextInput, {
  label: string; value: string; onChange: (digits: string) => void; error?: string; hint?: string;
  onSubmitEditing?: () => void; testID?: string; autoFocus?: boolean; editable?: boolean;
}>(function PhoneField({ label, value, onChange, error, hint, onSubmitEditing, testID, autoFocus, editable = true }, ref) {
  const [focused, setFocused] = useState(false);
  return (
    <FieldChrome label={label} error={error} hint={hint}>
      <View style={[styles.box, focused && styles.focused, !!error && styles.errorBox, !editable && styles.disabled]}>
        <View style={styles.prefix}>
          <Txt style={styles.flag}>🇮🇳</Txt>
          <Txt style={styles.prefixText}>{COUNTRY_CODE}</Txt>
        </View>
        <TextInput
          ref={ref}
          value={formatNational(value)}
          onChangeText={(t) => onChange(nationalDigits(t))}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          maxLength={11}
          placeholder="98765 43210"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={onSubmitEditing}
          returnKeyType="next"
          accessibilityLabel={label}
          testID={testID}
          autoFocus={autoFocus}
          editable={editable}
          maxFontSizeMultiplier={1.4}
        />
      </View>
    </FieldChrome>
  );
});

/** Password with a show/hide toggle. */
export const PasswordField = forwardRef<TextInput, TextInputProps & { label: string; error?: string; hint?: string }>(
  function PasswordField({ label, error, hint, style, ...rest }, ref) {
    const [visible, setVisible] = useState(false);
    const [focused, setFocused] = useState(false);
    return (
      <FieldChrome label={label} error={error} hint={hint}>
        <View style={[styles.box, focused && styles.focused, !!error && styles.errorBox]}>
          <View style={styles.leading}><Icon name="lock-outline" size={20} color={colors.textMuted} /></View>
          <TextInput
            ref={ref}
            secureTextEntry={!visible}
            autoCapitalize="none"
            autoCorrect={false}
            placeholderTextColor={colors.textMuted}
            accessibilityLabel={label}
            maxFontSizeMultiplier={1.4}
            {...rest}
            onFocus={(e) => { setFocused(true); rest.onFocus?.(e); }}
            onBlur={(e) => { setFocused(false); rest.onBlur?.(e); }}
            style={[styles.input, style]}
          />
          <Pressable onPress={() => setVisible((v) => !v)} hitSlop={10} style={styles.trailing}
                     accessibilityRole="button" accessibilityLabel={visible ? 'Hide password' : 'Show password'}>
            <Icon name={visible ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textMuted} />
          </Pressable>
        </View>
      </FieldChrome>
    );
  },
);

/** Six boxes backed by one hidden input, so paste and SMS autofill both work. */
export function OtpField({ value, onChange, length = 6, error, autoFocus = true, testID }: {
  value: string; onChange: (code: string) => void; length?: number; error?: string; autoFocus?: boolean; testID?: string;
}) {
  const input = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const digits = value.split('');
  return (
    <View style={{ gap: spacing.sm }}>
      <Pressable style={styles.otpRow} onPress={() => input.current?.focus()} accessibilityLabel="Verification code">
        {Array.from({ length }).map((_, i) => {
          const active = focused && (i === value.length || (i === length - 1 && value.length === length));
          return (
            <View key={i} style={[styles.otpBox, !!digits[i] && styles.otpFilled, active && styles.focused,
              !!error && styles.errorBox]}>
              <Txt style={styles.otpDigit}>{digits[i] ?? ''}</Txt>
            </View>
          );
        })}
      </Pressable>
      <TextInput
        ref={input}
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, length))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={length}
        autoFocus={autoFocus}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={styles.hidden}
        caretHidden
        testID={testID}
        accessibilityLabel="Verification code"
      />
      {error ? <Txt variant="caption" style={{ color: colors.danger }} accessibilityLiveRegion="polite">{error}</Txt> : null}
    </View>
  );
}

/** "Resend code in 0:24" → "Resend code". */
export function ResendTimer({ seconds, onResend, label, waitingLabel, busy }: {
  seconds: number; onResend: () => void; label: string; waitingLabel: (s: string) => string; busy?: boolean;
}) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    setLeft(seconds);
    if (seconds <= 0) return undefined;
    const id = setInterval(() => setLeft((s) => (s <= 1 ? (clearInterval(id), 0) : s - 1)), 1000);
    return () => clearInterval(id);
  }, [seconds]);
  if (left > 0) {
    return <Txt variant="muted" style={{ textAlign: 'center' }}>{waitingLabel(`0:${String(left).padStart(2, '0')}`)}</Txt>;
  }
  return (
    <Pressable onPress={busy ? undefined : onResend} accessibilityRole="button" hitSlop={8} style={styles.resend}>
      <Icon name="refresh" size={16} color={colors.primary} />
      <Txt variant="label" style={{ color: colors.primary }}>{label}</Txt>
    </Pressable>
  );
}

/** Only shown while the server's testing switch is on — never with a real SMS provider. */
export function DevCodeNotice({ code, onUse, label, useLabel }: {
  code?: string; onUse: (c: string) => void; label: string; useLabel: string;
}) {
  if (!code) return null;
  return (
    <View style={styles.dev} testID="dev-code">
      <Icon name="information-outline" size={18} color={colors.info} />
      <Txt variant="muted" style={{ flex: 1, color: colors.info }}>{label} <Txt style={styles.devCode}>{code}</Txt></Txt>
      <Pressable onPress={() => onUse(code)} hitSlop={8} accessibilityRole="button">
        <Txt variant="label" style={{ color: colors.info }}>{useLabel}</Txt>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    minHeight: TAP + 6, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface,
    flexDirection: 'row', alignItems: 'center', overflow: 'hidden',
  },
  focused: { borderColor: colors.primary },
  errorBox: { borderColor: colors.danger },
  disabled: { backgroundColor: colors.surfaceMuted },
  prefix: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md, alignSelf: 'stretch',
    backgroundColor: colors.surfaceMuted, borderRightWidth: 1, borderRightColor: colors.border,
  },
  flag: { fontSize: 18, lineHeight: 22 },
  prefixText: { fontSize: 16.5, fontWeight: '600', color: colors.text },
  leading: { paddingLeft: spacing.md },
  trailing: { paddingHorizontal: spacing.md, alignSelf: 'stretch', justifyContent: 'center' },
  input: {
    flex: 1, paddingHorizontal: spacing.md, fontSize: 17, fontFamily: fonts.medium, color: colors.text, letterSpacing: 0.4,
    minHeight: TAP + 4,
  },
  otpRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  otpBox: {
    flex: 1, aspectRatio: 0.86, maxWidth: 56, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  otpFilled: { borderColor: colors.secondary, backgroundColor: colors.secondarySoft },
  otpDigit: { fontSize: 24, fontWeight: '700', color: colors.text },
  hidden: { position: 'absolute', opacity: 0, width: 1, height: 1 },
  resend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: spacing.sm },
  dev: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md,
    backgroundColor: colors.infoSoft,
  },
  devCode: { fontWeight: '800', letterSpacing: 2, color: colors.info },
});
