import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import type { Pool } from '@/types/database';

type PoolRow = Pool & { member_count: number; is_creator: boolean };

export default function LeagueScreen() {
  const user = useAuthStore((s) => s.user);
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pools, setPools] = useState<PoolRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;

    const { data: memberships } = await supabase
      .from('pool_members')
      .select('pool_id')
      .eq('user_id', user.id);

    const poolIds = (memberships ?? []).map((m) => m.pool_id);
    if (poolIds.length === 0) {
      setPools([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const { data: poolRows } = await supabase.from('pools').select('*').in('id', poolIds);

    const enriched = await Promise.all(
      (poolRows ?? []).map(async (pool) => {
        const { count } = await supabase
          .from('pool_members')
          .select('*', { count: 'exact', head: true })
          .eq('pool_id', pool.id);
        return {
          ...pool,
          member_count: count ?? 0,
          is_creator: pool.created_by === user.id,
        };
      }),
    );

    setPools(enriched);
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const createPool = async () => {
    setBusy(true);
    setMessage(null);
    const { data, error } = await supabase.rpc('create_pool');
    setBusy(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    const result = Array.isArray(data) ? data[0] : data;
    Alert.alert('League created', `Invite code: ${result?.invite_code ?? '—'}`);
    load();
  };

  const joinPool = async () => {
    const code = inviteCode.trim().toUpperCase();
    if (!code) {
      setMessage('Enter an invite code.');
      return;
    }
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.rpc('join_pool', { p_invite_code: code });
    setBusy(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setInviteCode('');
    setMessage('Joined league successfully.');
    load();
  };

  const startBracket = async (pool: PoolRow) => {
    if (pool.member_count % 2 !== 0) {
      setMessage('Need an even number of members to start the bracket.');
      return;
    }

    setBusy(true);
    setMessage(null);
    const { error } = await supabase.rpc('start_pool_bracket', { p_pool_id: pool.id });
    setBusy(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage('Bracket started. Matchups are live.');
    load();
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#52b788" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load();
          }}
          tintColor="#52b788"
        />
      }>
      <Text style={styles.title}>League</Text>
      <Text style={styles.lede}>
        Create a pool or join with an invite code. Start only when members are even.
      </Text>

      <Pressable style={styles.primaryButton} onPress={createPool} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Create League</Text>}
      </Pressable>

      <View style={styles.row}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          autoCapitalize="characters"
          placeholder="Invite code"
          placeholderTextColor="#8a8a8a"
          value={inviteCode}
          onChangeText={setInviteCode}
        />
        <Pressable style={styles.secondaryButton} onPress={joinPool} disabled={busy}>
          <Text style={styles.secondaryText}>Join</Text>
        </Pressable>
      </View>

      {message ? <Text style={styles.message}>{message}</Text> : null}

      <Text style={styles.section}>Your pools</Text>
      {pools.length === 0 ? (
        <Text style={styles.muted}>No leagues yet.</Text>
      ) : (
        pools.map((pool) => {
          const canStart =
            pool.is_creator && !pool.is_active && pool.member_count >= 2 && pool.member_count % 2 === 0;

          return (
            <View key={pool.id} style={styles.card}>
              <Text style={styles.cardTitle}>{pool.invite_code}</Text>
              <Text style={styles.muted}>
                {pool.member_count} members · {pool.is_active ? 'Active bracket' : 'Not started'}
              </Text>
              {pool.is_creator && !pool.is_active ? (
                <Pressable
                  style={[styles.startButton, !canStart && styles.startDisabled]}
                  disabled={!canStart || busy}
                  onPress={() => startBracket(pool)}>
                  <Text style={styles.primaryText}>
                    {pool.member_count % 2 !== 0
                      ? 'Need even member count'
                      : pool.member_count < 2
                        ? 'Need at least 2 members'
                        : 'Start Bracket'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1419' },
  content: { padding: 20, paddingBottom: 40 },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f1419',
  },
  title: { fontSize: 28, fontWeight: '800', color: '#f4f4f0', marginBottom: 8 },
  lede: { fontSize: 15, color: '#a8b0b8', marginBottom: 20, lineHeight: 22 },
  primaryButton: {
    backgroundColor: '#2d6a4f',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  row: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  input: {
    backgroundColor: '#1a222b',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#f4f4f0',
    borderWidth: 1,
    borderColor: '#2a3440',
  },
  secondaryButton: {
    backgroundColor: '#1a222b',
    borderRadius: 10,
    paddingHorizontal: 18,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#52b788',
  },
  secondaryText: { color: '#52b788', fontWeight: '700' },
  message: { color: '#52b788', marginBottom: 12 },
  section: { fontSize: 18, fontWeight: '700', color: '#f4f4f0', marginTop: 12, marginBottom: 10 },
  muted: { color: '#a8b0b8', fontSize: 14 },
  card: {
    backgroundColor: '#1a222b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2a3440',
  },
  cardTitle: { color: '#f4f4f0', fontSize: 20, fontWeight: '700', marginBottom: 4 },
  startButton: {
    marginTop: 12,
    backgroundColor: '#2d6a4f',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  startDisabled: { opacity: 0.45 },
});
