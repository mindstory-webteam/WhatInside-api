import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { type TextInput, View } from 'react-native';

import { ApiError, errorMessage } from '@/api/client';
import { authApi } from '@/api/endpoints';
import type { OtpResponse } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { InlineError } from '@/components/States';
import { FieldChrome, TextField } from '@/components/TextField';
import { Txt } from '@/components/Txt';
import { DevCodeNotice, OtpField, PasswordField, PhoneField, ResendTimer } from '@/features/auth/AuthFields';
import { AuthShell, AuthSwitch } from '@/features/auth/AuthShell';
import i18n, { LANGUAGES, setLanguage, type LanguageCode } from '@/i18n';
import { formatPhone, toE164 } from '@/lib/phone';
import { spacing } from '@/theme/tokens';
import { otpSchema, registerSchema, type RegisterForm } from '@/validation/schemas';

/** Sign-up in two steps: details → SMS code. The account is created only after the code checks out. */
export default function Register() {
  const { t } = useTranslation();
  const { signUp } = useAuth();
  const [step, setStep] = useState<'details' | 'verify'>('details');
  const [lang, setLang] = useState<LanguageCode>(i18n.language as LanguageCode);
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState<string | undefined>();
  const [sent, setSent] = useState<OtpResponse | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const phoneRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const { control, handleSubmit, setError, getValues, formState: { errors } } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', phone: '', password: '' },
  });

  const sendCode = async () => {
    setServerError(null);
    setBusy(true);
    try {
      const res = await authApi.sendOtp(toE164(getValues('phone')), 'register');
      setSent({ ...res, resend_in: res.resend_in || 30 });
      setOtp('');
      setOtpError(undefined);
      setStep('verify');
    } catch (e) {
      if (e instanceof ApiError && (e.code === 'phone_taken' || e.kind === 'validation')) {
        setError('phone', { message: e.fieldErrors().phone ?? e.message });
        setStep('details');
      } else setServerError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const onDetails = handleSubmit(sendCode);

  const onVerify = async () => {
    const ok = otpSchema.safeParse(otp);
    if (!ok.success) return setOtpError(t('validation.otp'));
    setServerError(null);
    setOtpError(undefined);
    setBusy(true);
    try {
      const v = getValues();
      await signUp({ phone: v.phone, otp: ok.data, name: v.name, password: v.password, language: lang });
    } catch (e) {
      if (e instanceof ApiError && e.code.startsWith('otp_')) setOtpError(e.message);
      else if (e instanceof ApiError && e.kind === 'validation') {
        const f = e.fieldErrors();
        (['name', 'phone', 'password'] as const).forEach((k) => f[k] && setError(k, { message: f[k] }));
        setStep('details');
        setServerError(e.message);
      } else setServerError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (step === 'verify') {
    const phone = formatPhone(toE164(getValues('phone')));
    return (
      <AuthShell title={t('auth.verifyTitle')} subtitle={t('auth.verifySubtitle', { phone })} icon="message-text-outline"
                 step={{ current: 2, total: 2 }} onBack={() => setStep('details')}>
        <InlineError message={serverError} />
        <DevCodeNotice code={sent?.dev_code} label={t('auth.devCode')} useLabel={t('auth.useCode')} onUse={setOtp} />
        <OtpField value={otp} onChange={(c) => { setOtp(c); setOtpError(undefined); }} error={otpError}
                  testID="register-otp" />
        <Button title={t('auth.verify')} onPress={onVerify} loading={busy} disabled={otp.length < 6}
                testID="register-verify" style={{ marginTop: spacing.sm }} />
        <ResendTimer seconds={sent?.resend_in ?? 30} onResend={sendCode} busy={busy} label={t('auth.resend')}
                     waitingLabel={(time) => t('auth.resendIn', { time })} />
        <Button title={t('auth.changeNumber')} variant="ghost" icon="pencil-outline" onPress={() => setStep('details')} />
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t('auth.register')} subtitle={t('auth.registerSubtitle')} step={{ current: 1, total: 2 }}
               footer={<AuthSwitch text={t('auth.haveAccountShort')} action={t('auth.signInLink')}
                                   onPress={() => router.replace('/login')} />}>
      <InlineError message={serverError} />
      <FieldChrome label={t('auth.language')}>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {LANGUAGES.map((l) => (
            <Chip key={l.code} label={l.label} selected={lang === l.code} onPress={() => {
              setLang(l.code);
              setLanguage(l.code);
            }} />
          ))}
        </View>
      </FieldChrome>
      <Controller control={control} name="name" render={({ field }) => (
        <TextField label={t('auth.name')} value={field.value} onChangeText={field.onChange} autoComplete="name"
                   textContentType="name" placeholder="Rauf" returnKeyType="next" testID="register-name"
                   onSubmitEditing={() => phoneRef.current?.focus()}
                   error={errors.name?.message && t(errors.name.message)} />
      )} />
      <Controller control={control} name="phone" render={({ field }) => (
        <PhoneField ref={phoneRef} label={t('auth.phone')} value={field.value} onChange={field.onChange}
                    hint={t('auth.phoneHint')} testID="register-phone"
                    onSubmitEditing={() => passwordRef.current?.focus()}
                    error={errors.phone?.message && (errors.phone.message.startsWith('validation.')
                      ? t(errors.phone.message) : errors.phone.message)} />
      )} />
      <Controller control={control} name="password" render={({ field }) => (
        <PasswordField ref={passwordRef} label={t('auth.password')} value={field.value} onChangeText={field.onChange}
                       autoComplete="new-password" textContentType="newPassword" hint={t('auth.passwordHint')}
                       returnKeyType="go" onSubmitEditing={onDetails} testID="register-password"
                       error={errors.password?.message && (errors.password.message.startsWith('validation.')
                         ? t(errors.password.message) : errors.password.message)} />
      )} />
      <Button title={t('auth.sendCode')} icon="message-text-outline" onPress={onDetails} loading={busy}
              testID="register-send" />
      <Txt variant="caption" style={{ textAlign: 'center' }}>{t('auth.terms')}</Txt>
    </AuthShell>
  );
}
