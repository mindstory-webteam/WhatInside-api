import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { errorMessage } from '@/api/client';
import { authApi } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthContext';
import { tokenStorage } from '@/auth/tokenStorage';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { InlineError } from '@/components/States';
import { TextField } from '@/components/TextField';
import { Txt } from '@/components/Txt';
import { colors } from '@/theme/tokens';

export default function DeleteAccount() {
  const { t } = useTranslation();
  const { signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await authApi.deleteAccount(password);
      await tokenStorage.clear();
      await signOut();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen back title={t('settings.deleteAccount')}>
      <Card style={{ backgroundColor: colors.dangerSoft }}><Txt>{t('settings.deleteWarning')}</Txt></Card>
      <InlineError message={error} />
      <TextField label={t('settings.deleteConfirm')} value={password} onChangeText={setPassword} secureTextEntry />
      <Button title={t('settings.deleteAccount')} variant="danger" loading={busy} disabled={!password} onPress={remove} />
    </Screen>
  );
}
