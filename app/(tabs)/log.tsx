import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useActiveMatchup } from '@/hooks/useActiveMatchup';
import { supabase } from '@/lib/supabase';
import { formatCountdownToCutoff, isPastWeeklyCutoff } from '@/lib/timezone';
import { useAuthStore } from '@/stores/authStore';

export default function LogScreen() {
  const user = useAuthStore((s) => s.user);
  const { matchup, loading, refresh } = useActiveMatchup();
  const [exercise, setExercise] = useState('');
  const [reps, setReps] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const submit = useCallback(async () => {
    setError(null);
    setMessage(null);

    if (!user || !matchup) {
      setError('No active matchup. Join a league and start the bracket first.');
      return;
    }

    if (isPastWeeklyCutoff(matchup.week_end)) {
      setError('This week is closed. Late logs are rejected after Sunday 11:59 PM ET.');
      return;
    }

    const repsNum = Number(reps);
    if (!exercise.trim() || !Number.isFinite(repsNum) || repsNum <= 0 || !Number.isInteger(repsNum)) {
      setError('Enter an exercise name and a positive whole number of reps.');
      return;
    }

    setBusy(true);
    const { error: insertError } = await supabase.from('workouts').insert({
      user_id: user.id,
      matchup_id: matchup.matchup_id,
      exercise_name: exercise.trim(),
      reps: repsNum,
    });
    setBusy(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setExercise('');
    setReps('');
    setMessage(`Logged ${repsNum} reps · ${repsNum * 5} points (server-calculated).`);
    refresh();
  }, [user, matchup, exercise, reps, refresh]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#52b788" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Log Workout</Text>
      <Text style={styles.lede}>Points are always reps × 5, calculated by the database — not the app.</Text>

      {matchup ? (
        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>vs {matchup.opponent_name}</Text>
          <Text style={styles.bannerMuted}>{formatCountdownToCutoff(matchup.week_end)}</Text>
        </View>
      ) : (
        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>No active matchup</Text>
          <Text style={styles.bannerMuted}>Create or join a league, then start the bracket.</Text>
        </View>
      )}

      <TextInput
        style={styles.input}
        placeholder="Exercise (e.g. Push-ups)"
        placeholderTextColor="#8a8a8a"
        value={exercise}
        onChangeText={setExercise}
      />
      <TextInput
        style={styles.input}
        placeholder="Reps"
        placeholderTextColor="#8a8a8a"
        keyboardType="number-pad"
        value={reps}
        onChangeText={setReps}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {message ? <Text style={styles.success}>{message}</Text> : null}

      <Pressable
        style={[styles.button, (!matchup || busy) && styles.buttonDisabled]}
        onPress={submit}
        disabled={!matchup || busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Submit</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1419', padding: 20 },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f1419',
  },
  title: { fontSize: 28, fontWeight: '800', color: '#f4f4f0', marginBottom: 8 },
  lede: { fontSize: 15, color: '#a8b0b8', marginBottom: 20, lineHeight: 22 },
  banner: {
    backgroundColor: '#1a222b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#2a3440',
  },
  bannerTitle: { color: '#f4f4f0', fontSize: 17, fontWeight: '700' },
  bannerMuted: { color: '#a8b0b8', marginTop: 4 },
  input: {
    backgroundColor: '#1a222b',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: '#f4f4f0',
    fontSize: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2a3440',
  },
  button: {
    backgroundColor: '#2d6a4f',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  error: { color: '#e76f51', marginBottom: 8 },
  success: { color: '#52b788', marginBottom: 8 },
});
