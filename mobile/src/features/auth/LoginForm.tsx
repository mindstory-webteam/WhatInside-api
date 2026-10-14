import { zodResolver } from '@hookform/resolvers/zod';
import { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Pressable, type TextInput, View } from 'react-native';

import { ApiError, errorMessage } from '@/api/client';
import { Button } from '@/components/Button';
import { InlineError } from '@/components/States';
import { TextField } from '@/components/TextField';
import { Txt } from '@/components/Txt';
import { colors, spacing } from '@/theme/tokens';
import { emailLoginSchema, loginSchema } from '@/validation/schemas';

import { PasswordField, PhoneField } from './AuthFields';

type Values = { phone: string; email: string; password: string };

/**
 * Mobile number + password. Accounts created before mobile sign-up can switch to email.
 * Presentational (no routing) so it can be unit-tested.
 */
export function LoginForm({ onSubmit, onForgot }: {
  onSubmit: (identifier: string, password: string) => Promise<void>; onForgot?: () => void;
}) {
  const { t } = useTranslation();
  const [mode, setModeState] = useState<'phone' | 'email'>('phone');
  const modeRef = useRef(mode); // the resolver reads the current mode through this
  const setMode = (m: 'phone' | 'email') => { modeRef.current = m; setModeState(m); };
  const [serverError, setServerError] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);
  const { control, handleSubmit, formState: { errors, isSubmitting }, clearErrors } = useForm<Values>({
    resolver: (values, ctx, opts) => (modeRef.current === 'phone'
      ? zodResolver(loginSchema)(values, ctx, opts as never)
      : zodResolver(emailLoginSchema)(values, ctx, opts as never)) as never,
    defaultValues: { phone: '', email: '', password: '' },
  });

  const submit = handleSubmit(async (v) => {
    setServerError(null);
    try {
      await onSubmit(mode === 'phone' ? v.phone : v.email, v.password);
    } catch (e) {
      setServerError(e instanceof ApiError && e.kind === 'auth' ? t('auth.invalidLogin') : errorMessage(e));
    }
  });

  return (
    <View style={{ gap: spacing.xs }}>
      <InlineError message={serverError} />
      {mode === 'phone' ? (
        <Controller control={control} name="phone" render={({ field }) => (
          <PhoneField label={t('auth.phone')} value={field.value} onChange={field.onChange} testID="login-phone"
                      error={errors.phone?.message && t(errors.phone.message)}
                      onSubmitEditing={() => passwordRef.current?.focus()} />
        )} />
      ) : (
        <Controller control={control} name="email" render={({ field }) => (
          <TextField label={t('auth.email')} value={field.value} onChangeText={field.onChange} onBlur={field.onBlur}
                     autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress"
                     error={errors.email?.message && t(errors.email.message)} testID="login-email" />
        )} />
      )}
      <Controller control={control} name="password" render={({ field }) => (
        <PasswordField ref={passwordRef} label={t('auth.password')} value={field.value} onChangeText={field.onChange}
                       onBlur={field.onBlur} autoComplete="password" textContentType="password"
                       placeholder="••••••••" returnKeyType="go"
                       error={errors.password?.message && t(errors.password.message)} testID="login-password"
                       onSubmitEditing={submit} />
      )} />
      {onForgot ? (
        <Pressable onPress={onForgot} hitSlop={8} style={{ alignSelf: 'flex-end', paddingVertical: spacing.xs }}
                   accessibilityRole="button" testID="login-forgot">
          <Txt variant="label" style={{ color: colors.primary }}>{t('auth.forgot')}</Txt>
        </Pressable>
      ) : null}
      <Button title={t('auth.login')} onPress={submit} loading={isSubmitting} testID="login-submit"
              style={{ marginTop: spacing.sm }} />
      <Pressable onPress={() => { clearErrors(); setServerError(null); setMode(mode === 'phone' ? 'email' : 'phone'); }}
                 hitSlop={8} style={{ alignSelf: 'center', paddingVertical: spacing.md }} accessibilityRole="button"
                 testID="login-mode">
        <Txt variant="muted" style={{ textAlign: 'center' }}>{mode === 'phone' ? t('auth.useEmail') : t('auth.usePhone')}</Txt>
      </Pressable>
    </View>
  );
}
