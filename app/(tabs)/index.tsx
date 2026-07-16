import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { supabase } from '@/lib/supabase';
import { formatEastern } from '@/lib/timezone';
import { useAuthStore } from '@/stores/authStore';
import type { Pool, Season } from '@/types/database';

type PoolWithMeta = Pool & {
  member_count: number;
};

export default function HomeScreen() {
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [displayName, setDisplayName] = useState('Athlete');
  const [season, setSeason] = useState<Season | null>(null);
  const [pools, setPools] = useState<PoolWithMeta[]>([]);

  const load = useCallback(async () => {
    if (!user) return;

    const today = new Date().toISOString().slice(0, 10);

    const [{ data: profile }, { data: seasons }, { data: memberships }] = await Promise.all([
      supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle(),
      supabase
        .from('seasons')
        .select('*')
        .lte('start_date', today)
        .gte('end_date', today)
        .order('start_date', { ascending: false })
        .limit(1),
      supabase.from('pool_members').select('pool_id').eq('user_id', user.id),
    ]);

    if (profile?.display_name) setDisplayName(profile.display_name);
    const activeSeason = seasons?.[0] ?? null;
    setSeason(activeSeason);

    const poolIds = (memberships ?? []).map((m) => m.pool_id);
    if (poolIds.length === 0) {
      setPools([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const { data: poolRows } = await supabase.from('pools').select('*').in('id', poolIds);

    const withCounts = await Promise.all(
      (poolRows ?? []).map(async (pool) => {
        const { count } = await supabase
          .from('pool_members')
          .select('*', { count: 'exact', head: true })
          .eq('pool_id', pool.id);
        return { ...pool, member_count: count ?? 0 };
      }),
    );

    setPools(withCounts);
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

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
      <Text style={styles.greeting}>Hey, {displayName}</Text>
      <Text style={styles.lede}>Weekly head-to-head fitness matchups. Flat 5 points per rep.</Text>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Current season</Text>
        {season ? (
          <Text style={styles.cardValue}>
            {formatEastern(season.start_date + 'T12:00:00', 'MMM d')} –{' '}
            {formatEastern(season.end_date + 'T12:00:00', 'MMM d, yyyy')}
          </Text>
        ) : (
          <Text style={styles.cardMuted}>No active season yet. One will be created automatically.</Text>
        )}
      </View>

      <Text style={styles.sectionTitle}>Your leagues</Text>
      {pools.length === 0 ? (
        <Text style={styles.cardMuted}>Join or create a league from the League tab.</Text>
      ) : (
        pools.map((pool) => (
          <View key={pool.id} style={styles.card}>
            <Text style={styles.cardValue}>Code: {pool.invite_code}</Text>
            <Text style={styles.cardMuted}>
              {pool.member_count} members · {pool.is_active ? 'Bracket live' : 'Waiting to start'}
            </Text>
          </View>
        ))
      )}

      <Pressable style={styles.signOut} onPress={signOut}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
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
  greeting: {
    fontSize: 28,
    fontWeight: '800',
    color: '#f4f4f0',
    marginBottom: 8,
  },
  lede: {
    fontSize: 15,
    color: '#a8b0b8',
    marginBottom: 24,
    lineHeight: 22,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f4f4f0',
    marginBottom: 12,
    marginTop: 8,
  },
  card: {
    backgroundColor: '#1a222b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2a3440',
  },
  cardLabel: {
    color: '#6b7380',
    fontSize: 13,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  cardValue: {
    color: '#f4f4f0',
    fontSize: 17,
    fontWeight: '600',
  },
  cardMuted: {
    color: '#a8b0b8',
    fontSize: 14,
    marginTop: 4,
  },
  signOut: {
    marginTop: 24,
    alignItems: 'center',
    padding: 12,
  },
  signOutText: {
    color: '#e76f51',
    fontWeight: '600',
  },
});
