import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { ApiError, errorMessage } from '@/api/client';
import { authApi } from '@/api/endpoints';
import type { OtpResponse } from '@/api/types';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { InlineError } from '@/components/States';
import { FieldChrome } from '@/components/TextField';
import { Txt } from '@/components/Txt';
import { DevCodeNotice, OtpField, PasswordField, PhoneField, ResendTimer } from '@/features/auth/AuthFields';
import { AuthShell, AuthSwitch } from '@/features/auth/AuthShell';
import { formatPhone, toE164 } from '@/lib/phone';
import { colors, spacing } from '@/theme/tokens';
import { phoneSchema, resetSchema, type ResetForm } from '@/validation/schemas';

/** Forgot password: mobile number → SMS code + new password. */
export default function ForgotPassword() {
  const { t } = useTranslation();
  const [step, setStep] = useState<'phone' | 'reset' | 'done'>('phone');
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string | undefined>();
  const [sent, setSent] = useState<OtpResponse | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { control, handleSubmit, setValue, setError, formState: { errors } } = useForm<ResetForm>({
    resolver: zodResolver(resetSchema),
    defaultValues: { otp: '', password: '', confirm: '' },
  });
  const tr = (m?: string) => (m ? (m.startsWith('validation.') ? t(m) : m) : undefined);

  const sendCode = async () => {
    const ok = phoneSchema.safeParse(phone);
    if (!ok.success) return setPhoneError(t(ok.error.issues[0].message));
    setPhoneError(undefined);
    setServerError(null);
    setBusy(true);
    try {
      const res = await authApi.requestPasswordReset(toE164(phone));
      setSent({ ...res, resend_in: res.resend_in || 30 });
      setStep('reset');
    } catch (e) {
      if (e instanceof ApiError && e.kind === 'validation') setPhoneError(e.fieldErrors().phone ?? e.message);
      else setServerError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const reset = handleSubmit(async (v) => {
    setServerError(null);
    setBusy(true);
    try {
      await authApi.confirmPasswordReset(toE164(phone), v.otp, v.password);
      setStep('done');
    } catch (e) {
      if (e instanceof ApiError && e.code.startsWith('otp_')) setError('otp', { message: e.message });
      else if (e instanceof ApiError && e.kind === 'validation') {
        const f = e.fieldErrors();
        if (f.new_password) setError('password', { message: f.new_password });
        else setServerError(e.message);
      } else setServerError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  });

  if (step === 'done') {
    return (
      <AuthShell title={t('auth.resetDoneTitle')} subtitle={t('auth.resetDone')} icon="shield-check-outline">
        <View style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl }}>
          <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: colors.secondarySoft,
            alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="check-circle" size={44} color={colors.primary} />
          </View>
          <Txt variant="muted" style={{ textAlign: 'center' }}>{t('auth.resetDone')}</Txt>
        </View>
        <Button title={t('auth.login')} onPress={() => router.replace('/login')} testID="reset-signin" />
      </AuthShell>
    );
  }

  if (step === 'reset') {
    return (
      <AuthShell title={t('auth.resetCodeTitle')} icon="key-outline" step={{ current: 2, total: 2 }}
                 subtitle={t('auth.resetCodeSubtitle', { phone: formatPhone(toE164(phone)) })}
                 onBack={() => setStep('phone')}>
        <InlineError message={serverError} />
        <DevCodeNotice code={sent?.dev_code} label={t('auth.devCode')} useLabel={t('auth.useCode')}
                       onUse={(c) => setValue('otp', c)} />
        <Controller control={control} name="otp" render={({ field }) => (
          <FieldChrome label={t('auth.code')}>
            <OtpField value={field.value} onChange={field.onChange} error={tr(errors.otp?.message)} testID="reset-otp" />
          </FieldChrome>
        )} />
        <ResendTimer seconds={sent?.resend_in ?? 30} onResend={sendCode} busy={busy} label={t('auth.resend')}
                     waitingLabel={(time) => t('auth.resendIn', { time })} />
        <Controller control={control} name="password" render={({ field }) => (
          <PasswordField label={t('auth.newPassword')} value={field.value} onChangeText={field.onChange}
                         autoComplete="new-password" textContentType="newPassword" hint={t('auth.passwordHint')}
                         error={tr(errors.password?.message)} testID="reset-password" />
        )} />
        <Controller control={control} name="confirm" render={({ field }) => (
          <PasswordField label={t('auth.confirmPassword')} value={field.value} onChangeText={field.onChange}
                         autoComplete="new-password" textContentType="newPassword" returnKeyType="go"
                         onSubmitEditing={reset} error={tr(errors.confirm?.message)} testID="reset-confirm" />
        )} />
        <Button title={t('auth.updatePassword')} onPress={reset} loading={busy} testID="reset-submit" />
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t('auth.resetTitle')} subtitle={t('auth.resetHelpPhone')} icon="lock-outline"
               step={{ current: 1, total: 2 }}
               footer={<AuthSwitch text={t('auth.rememberedIt')} action={t('auth.backToSignIn')}
                                   onPress={() => router.replace('/login')} />}>
      <InlineError message={serverError} />
      <PhoneField label={t('auth.phone')} value={phone} onChange={(d) => { setPhone(d); setPhoneError(undefined); }}
                  error={phoneError} onSubmitEditing={sendCode} autoFocus testID="forgot-phone" />
      <Button title={t('auth.sendCode')} icon="message-text-outline" onPress={sendCode} loading={busy}
              testID="forgot-send" />
    </AuthShell>
  );
}
