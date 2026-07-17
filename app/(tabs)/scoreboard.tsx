import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useActiveMatchup } from '@/hooks/useActiveMatchup';
import { supabase } from '@/lib/supabase';
import { formatCountdownToCutoff, formatEastern } from '@/lib/timezone';
import type { Workout } from '@/types/database';

export default function ScoreboardScreen() {
  const { matchup, loading, refresh } = useActiveMatchup();
  const [feed, setFeed] = useState<Workout[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadFeed = useCallback(async () => {
    if (!matchup) {
      setFeed([]);
      return;
    }

    const { data } = await supabase
      .from('workouts')
      .select('*')
      .eq('matchup_id', matchup.matchup_id)
      .eq('user_id', matchup.opponent_id)
      .order('created_at', { ascending: false })
      .limit(10);

    setFeed(data ?? []);
  }, [matchup]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  useEffect(() => {
    if (!matchup) return;

    const channel = supabase
      .channel(`matchup-${matchup.matchup_id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'workouts',
          filter: `matchup_id=eq.${matchup.matchup_id}`,
        },
        () => {
          refresh();
          loadFeed();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchup?.matchup_id, refresh, loadFeed]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#52b788" />
      </View>
    );
  }

  if (!matchup) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Scoreboard</Text>
        <Text style={styles.lede}>No active matchup this week. Start a bracket from the League tab.</Text>
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
          onRefresh={async () => {
            setRefreshing(true);
            await refresh();
            await loadFeed();
            setRefreshing(false);
          }}
          tintColor="#52b788"
        />
      }>
      <Text style={styles.title}>Head to Head</Text>
      <Text style={styles.lede}>{formatCountdownToCutoff(matchup.week_end)} · Ends Sunday 11:59 PM ET</Text>

      <View style={styles.scoreRow}>
        <View style={styles.scoreCard}>
          <Text style={styles.scoreLabel}>You</Text>
          <Text style={styles.scoreValue}>{matchup.my_points}</Text>
        </View>
        <Text style={styles.vs}>VS</Text>
        <View style={styles.scoreCard}>
          <Text style={styles.scoreLabel}>{matchup.opponent_name}</Text>
          <Text style={styles.scoreValue}>{matchup.opponent_points}</Text>
        </View>
      </View>

      <Text style={styles.section}>Opponent activity</Text>
      {feed.length === 0 ? (
        <Text style={styles.muted}>No logs from your opponent yet this week.</Text>
      ) : (
        feed.map((item) => (
          <View key={item.id} style={styles.feedItem}>
            <Text style={styles.feedTitle}>
              {item.exercise_name} · {item.sets} sets × {item.reps_per_set} reps
            </Text>
            <Text style={styles.muted}>
              {item.reps} total reps · {item.points} pts · {formatEastern(item.created_at)}
            </Text>
          </View>
        ))
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
  lede: { fontSize: 15, color: '#a8b0b8', marginBottom: 24, lineHeight: 22 },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 28,
  },
  scoreCard: {
    flex: 1,
    backgroundColor: '#1a222b',
    borderRadius: 12,
    padding: 18,
    borderWidth: 1,
    borderColor: '#2a3440',
    alignItems: 'center',
  },
  scoreLabel: { color: '#a8b0b8', fontSize: 14, marginBottom: 8, textAlign: 'center' },
  scoreValue: { color: '#52b788', fontSize: 40, fontWeight: '800' },
  vs: { color: '#6b7380', fontWeight: '800', marginHorizontal: 10 },
  section: { fontSize: 18, fontWeight: '700', color: '#f4f4f0', marginBottom: 12 },
  muted: { color: '#a8b0b8', fontSize: 14 },
  feedItem: {
    backgroundColor: '#1a222b',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2a3440',
  },
  feedTitle: { color: '#f4f4f0', fontWeight: '600', marginBottom: 4 },
});
