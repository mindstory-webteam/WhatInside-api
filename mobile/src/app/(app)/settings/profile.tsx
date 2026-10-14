import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { errorMessage } from '@/api/client';
import { authApi } from '@/api/endpoints';
import type { DateFormat } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { SelectField } from '@/components/SelectField';
import { InlineError } from '@/components/States';
import { TextField } from '@/components/TextField';
import { Txt } from '@/components/Txt';
import { LANGUAGES, setLanguage, type LanguageCode } from '@/i18n';
import { formatPhone } from '@/lib/phone';
import { TIMEZONES } from '@/lib/timezones';
import { spacing } from '@/theme/tokens';

export default function Profile() {
  const { t } = useTranslation();
  const { user, setUser, signOut } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [lang, setLang] = useState<LanguageCode>((user?.preferred_language as LanguageCode) ?? 'en');
  const [tz, setTz] = useState(user?.timezone ?? 'Asia/Kolkata');
  const [fmt, setFmt] = useState<DateFormat>(user?.date_format ?? 'DD/MM/YYYY');
  const [units, setUnits] = useState<'metric' | 'imperial'>(user?.unit_system ?? 'metric');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim()) return setError(t('validation.required'));
    setBusy(true);
    setError(null);
    try {
      const u = await authApi.updateMe({ name: name.trim(), email: email.trim() || null, preferred_language: lang, timezone: tz, date_format: fmt, unit_system: units });
      setUser(u);
      await setLanguage(lang);
      setSaved(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async () => {
    if (next.length < 8) return setError(t('validation.minPassword'));
    try {
      await authApi.changePassword(current, next);
      await signOut(); // server revoked all sessions
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Screen back title={t('settings.profile')}>
      <InlineError message={error} />
      {saved ? <Txt variant="muted">{t('settings.saved')}</Txt> : null}
      <Card>
        <TextField label={t('auth.name')} value={name} onChangeText={(v) => { setName(v); setSaved(false); }} />
        <TextField label={t('auth.phone')} value={formatPhone(user?.phone) || '—'} editable={false} />
        <TextField label={`${t('auth.email')} (${t('common.optional')})`} value={email} autoCapitalize="none"
                   keyboardType="email-address" onChangeText={(v) => { setEmail(v); setSaved(false); }} />
        <SelectField label={t('settings.language')} value={lang} onChange={setLang}
                     options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))} />
        <SelectField label={t('settings.timezone')} value={tz} onChange={setTz}
                     options={TIMEZONES.map((z) => ({ value: z, label: z }))} />
        <SelectField label={t('settings.dateFormat')} value={fmt} onChange={setFmt}
                     options={(['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'] as DateFormat[]).map((f) => ({ value: f, label: f }))} />
        <SelectField label={t('settings.units')} value={units} onChange={setUnits}
                     options={[{ value: 'metric' as const, label: 'Metric (g, kg, ml, l)' }, { value: 'imperial' as const, label: 'Imperial (oz, lb)' }]} />
        <Button title={t('common.save')} loading={busy} onPress={save} />
      </Card>
      <Card style={{ gap: spacing.sm }}>
        <Txt variant="heading">{t('settings.changePassword')}</Txt>
        <TextField label={t('settings.currentPassword')} value={current} onChangeText={setCurrent} secureTextEntry />
        <TextField label={t('auth.newPassword')} value={next} onChangeText={setNext} secureTextEntry hint={t('auth.passwordHint')} />
        <Button title={t('settings.changePassword')} variant="outline" onPress={changePassword} />
      </Card>
    </Screen>
  );
}
