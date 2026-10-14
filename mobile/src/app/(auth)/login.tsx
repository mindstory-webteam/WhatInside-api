import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/AuthContext';
import { AuthShell, AuthSwitch } from '@/features/auth/AuthShell';
import { LoginForm } from '@/features/auth/LoginForm';

export default function Login() {
  const { t } = useTranslation();
  const { signIn } = useAuth();
  return (
    <AuthShell title={t('auth.welcomeBack')} subtitle={t('auth.loginSubtitle')}
               footer={<AuthSwitch text={t('auth.noAccountShort')} action={t('auth.createOne')}
                                   onPress={() => router.replace('/register')} />}>
      <LoginForm onSubmit={signIn} onForgot={() => router.push('/forgot-password')} />
    </AuthShell>
  );
}
