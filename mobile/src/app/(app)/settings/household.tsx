import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { errorMessage } from '@/api/client';
import { householdApi } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { Screen } from '@/components/Screen';
import { SelectField } from '@/components/SelectField';
import { InlineError } from '@/components/States';
import { TextField } from '@/components/TextField';
import { Txt } from '@/components/Txt';
import { TIMEZONES } from '@/lib/timezones';
import { spacing } from '@/theme/tokens';

export default function HouseholdSettings() {
  const { t } = useTranslation();
  const { household, households, reload, selectHousehold } = useAuth();
  const [name, setName] = useState(household?.name ?? '');
  const [tz, setTz] = useState(household?.timezone ?? 'Asia/Kolkata');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const canEdit = household?.my_role === 'owner' || household?.my_role === 'admin';

  const save = async () => {
    if (!household) return;
    try {
      await householdApi.update(household.id, { name: name.trim(), timezone: tz });
      await reload();
      setSaved(true);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Screen back title={t('settings.household')}>
      <InlineError message={error} />
      {saved ? <Txt variant="muted">{t('settings.saved')}</Txt> : null}
      <Card>
        <TextField label={t('household.name')} value={name} onChangeText={setName} editable={canEdit} />
        <SelectField label={t('household.timezone')} value={tz} onChange={setTz}
                     hint="Expiry status and reminders use this timezone."
                     options={TIMEZONES.map((z) => ({ value: z, label: z }))} />
        {canEdit ? <Button title={t('common.save')} onPress={save} /> : <Txt variant="caption">{t('settings.permissionsHelp')}</Txt>}
      </Card>
      {households.length > 1 ? (
        <Card style={{ gap: spacing.sm }}>
          <Txt variant="heading">{t('settings.switchHousehold')}</Txt>
          {households.map((h) => (
            <Chip key={h.id} label={h.name} selected={h.id === household?.id} onPress={() => selectHousehold(h.id)} />
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
