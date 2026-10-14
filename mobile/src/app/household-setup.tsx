import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { errorMessage } from '@/api/client';
import { householdApi } from '@/api/endpoints';
import { householdStore } from '@/api/householdStore';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Logo } from '@/components/Logo';
import { Screen } from '@/components/Screen';
import { InlineError } from '@/components/States';
import { TextField } from '@/components/TextField';
import { Txt } from '@/components/Txt';
import { spacing } from '@/theme/tokens';

/** Shown after sign-up until the user creates or joins a household. */
export default function HouseholdSetup() {
  const { t } = useTranslation();
  const { user, reload, signOut } = useAuth();
  const [name, setName] = useState(user ? `${user.name.split(' ')[0]}'s Home` : '');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (kind: 'create' | 'join') => {
    setError(null);
    if (kind === 'create' && !name.trim()) return setError(t('validation.required'));
    if (kind === 'join' && !code.trim()) return setError(t('validation.required'));
    setBusy(kind);
    try {
      const tz = user?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
      const h = kind === 'create' ? await householdApi.create(name.trim(), tz) : await householdApi.join(code.trim());
      await householdStore.set(h.id); // reload() selects it
      await reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen banner={false}>
      <View style={{ alignItems: 'center', marginVertical: spacing.lg }}><Logo size={40} /></View>
      <Txt variant="title" accessibilityRole="header">{t('household.setupTitle')}</Txt>
      <InlineError message={error} />
      <Card style={{ gap: spacing.sm }}>
        <Txt variant="heading">{t('household.create')}</Txt>
        <TextField label={t('household.name')} value={name} onChangeText={setName} />
        <Button title={t('household.createCta')} loading={busy === 'create'} onPress={() => run('create')} icon="home-plus-outline" />
      </Card>
      <Card style={{ gap: spacing.sm }}>
        <Txt variant="heading">{t('household.join')}</Txt>
        <TextField label={t('household.code')} value={code} onChangeText={setCode} autoCapitalize="none" />
        <Button title={t('household.joinCta')} variant="outline" loading={busy === 'join'} onPress={() => run('join')}
                icon="account-multiple-plus-outline" />
      </Card>
      <Button title={t('auth.logout')} variant="ghost" onPress={signOut} />
    </Screen>
  );
}
