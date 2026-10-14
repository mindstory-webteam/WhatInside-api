import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { errorMessage } from '@/api/client';
import { authApi } from '@/api/endpoints';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { InlineError } from '@/components/States';
import { TextField } from '@/components/TextField';
import { Txt } from '@/components/Txt';

/** For older email accounts only. Opened from the email deep link whatinside://reset-password?uid=…&token=… or by entering the code. */
export default function ResetPassword() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ uid?: string; token?: string }>();
  const [uid, setUid] = useState(params.uid ?? '');
  const [token, setToken] = useState(params.token ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (password.length < 8) return setError(t('validation.minPassword'));
    setBusy(true);
    setError(null);
    try {
      await authApi.confirmPasswordResetEmail(uid.trim(), token.trim(), password);
      setDone(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen back title={t('auth.resetTitle')} banner={false}>
      <InlineError message={error} />
      {done ? (
        <>
          <Txt style={{ fontWeight: '600' }}>{t('auth.resetDone')}</Txt>
          <Button title={t('auth.login')} onPress={() => router.replace('/login')} />
        </>
      ) : (
        <>
          {!params.uid ? (
            <>
              <TextField label={t('auth.resetCode')} value={uid} onChangeText={setUid} autoCapitalize="none" />
              <TextField label={t('auth.resetToken')} value={token} onChangeText={setToken} autoCapitalize="none" />
            </>
          ) : null}
          <TextField label={t('auth.newPassword')} value={password} onChangeText={setPassword} secureTextEntry
                     hint={t('auth.passwordHint')} />
          <Button title={t('common.save')} onPress={submit} loading={busy} />
        </>
      )}
    </Screen>
  );
}
