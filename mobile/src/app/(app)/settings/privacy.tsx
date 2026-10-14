import { useTranslation } from 'react-i18next';

import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';

export default function Privacy() {
  const { t } = useTranslation();
  return (
    <Screen back title={t('settings.privacy')}>
      <Card><Txt>{t('privacy.body')}</Txt></Card>
    </Screen>
  );
}
