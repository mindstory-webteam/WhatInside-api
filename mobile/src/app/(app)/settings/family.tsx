import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Share, StyleSheet, View } from 'react-native';

import { errorMessage } from '@/api/client';
import { householdApi } from '@/api/endpoints';
import { useMembers } from '@/api/hooks';
import type { Member } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { ConfirmDialog } from '@/components/Dialogs';
import { Screen } from '@/components/Screen';
import { InlineError, LoadingState } from '@/components/States';
import { TextField } from '@/components/TextField';
import { Txt } from '@/components/Txt';
import { spacing } from '@/theme/tokens';

export default function Family() {
  const { t } = useTranslation();
  const { household, user, reload } = useAuth();
  const members = useMembers();
  const qc = useQueryClient();
  const role = household?.my_role;
  const isAdmin = role === 'owner' || role === 'admin';
  const invites = useQuery({ queryKey: ['invitations', household?.id], queryFn: () => householdApi.invitations(household!.id),
    enabled: !!household && isAdmin });
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'member' | 'admin'>('member');
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [leaving, setLeaving] = useState(false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['members'] });
    qc.invalidateQueries({ queryKey: ['invitations'] });
  };

  const invite = async () => {
    if (!household) return;
    setError(null);
    try {
      const inv = await householdApi.invite(household.id, { email: email.trim() || undefined, role: inviteRole });
      setEmail('');
      refresh();
      await Share.share({ message: `Join our home "${household.name}" on WhatInside with code: ${inv.code}` });
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Screen back title={t('settings.family')}>
      <Txt variant="caption">{t('settings.permissionsHelp')}</Txt>
      <InlineError message={error} />
      {members.isLoading ? <LoadingState /> : members.data?.map((m) => (
        <Card key={m.id} style={styles.member}>
          <View style={{ flex: 1 }}>
            <Txt variant="label">{m.name}{m.user === user?.id ? ' (you)' : ''}</Txt>
            <Txt variant="caption">{m.phone || m.email || ''} · {t(`settings.role_${m.role}`)}</Txt>
          </View>
          {role === 'owner' && m.role !== 'owner' ? (
            <Button compact variant="outline" title={m.role === 'admin' ? t('settings.makeMember') : t('settings.makeAdmin')}
                    onPress={() => act(() => householdApi.setRole(household!.id, m.id, m.role === 'admin' ? 'member' : 'admin'))} />
          ) : null}
          {isAdmin && m.role !== 'owner' && m.user !== user?.id && (role === 'owner' || m.role === 'member') ? (
            <Button compact variant="danger" title={t('settings.remove')} onPress={() => setRemoving(m)} />
          ) : null}
        </Card>
      ))}
      {isAdmin ? (
        <Card style={{ gap: spacing.sm }}>
          <Txt variant="heading">{t('settings.invite')}</Txt>
          <TextField label={`${t('auth.email')} (${t('common.optional')})`} value={email} onChangeText={setEmail}
                     autoCapitalize="none" keyboardType="email-address" />
          <View style={styles.chips}>
            <Chip label={t('settings.role_member')} selected={inviteRole === 'member'} onPress={() => setInviteRole('member')} />
            <Chip label={t('settings.role_admin')} selected={inviteRole === 'admin'} onPress={() => setInviteRole('admin')} />
          </View>
          <Button title={t('settings.invite')} icon="share-variant" onPress={invite} />
          {invites.data?.map((i) => (
            <Txt key={i.id} variant="caption">{t('settings.inviteCode', { code: i.code })}{i.email ? ` · ${i.email}` : ''}</Txt>
          ))}
        </Card>
      ) : null}
      {role !== 'owner' ? <Button title={t('settings.leave')} variant="danger" onPress={() => setLeaving(true)} /> : null}
      <ConfirmDialog visible={!!removing} title={t('settings.remove')} message={removing?.name} destructive
                     onCancel={() => setRemoving(null)}
                     onConfirm={() => {
                       const m = removing!;
                       setRemoving(null);
                       act(() => householdApi.removeMember(household!.id, m.id));
                     }} />
      <ConfirmDialog visible={leaving} title={t('settings.leave')} destructive onCancel={() => setLeaving(false)}
                     onConfirm={() => {
                       setLeaving(false);
                       act(async () => {
                         await householdApi.leave(household!.id);
                         await reload();
                       });
                     }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  member: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  chips: { flexDirection: 'row', gap: spacing.sm },
});
