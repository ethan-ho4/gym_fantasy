import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useActiveMatchup } from '@/hooks/useActiveMatchup';
import { supabase } from '@/lib/supabase';
import { formatCountdownToCutoff, isPastWeeklyCutoff } from '@/lib/timezone';
import { useAuthStore } from '@/stores/authStore';

type ExerciseDraft = {
  id: number;
  exercise: string;
  sets: string;
  repsPerSet: string;
};

const createBlankExercise = (id: number): ExerciseDraft => ({
  id,
  exercise: '',
  sets: '',
  repsPerSet: '',
});

const isPositiveInteger = (value: string) => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0;
};

export default function LogScreen() {
  const user = useAuthStore((s) => s.user);
  const { matchup, loading, refresh } = useActiveMatchup();
  const [exercises, setExercises] = useState<ExerciseDraft[]>([createBlankExercise(1)]);
  const [nextId, setNextId] = useState(2);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const updateExercise = useCallback(
    (id: number, field: keyof Omit<ExerciseDraft, 'id'>, value: string) => {
      setExercises((current) =>
        current.map((exercise) =>
          exercise.id === id ? { ...exercise, [field]: value } : exercise,
        ),
      );
      setError(null);
      setMessage(null);
    },
    [],
  );

  const addExercise = useCallback(() => {
    setExercises((current) => [...current, createBlankExercise(nextId)]);
    setNextId((current) => current + 1);
    setError(null);
    setMessage(null);
  }, [nextId]);

  const removeExercise = useCallback((id: number) => {
    setExercises((current) =>
      current.length === 1 ? current : current.filter((exercise) => exercise.id !== id),
    );
    setError(null);
    setMessage(null);
  }, []);

  const allExercisesValid = exercises.every(
    (exercise) =>
      exercise.exercise.trim().length > 0 &&
      isPositiveInteger(exercise.sets) &&
      isPositiveInteger(exercise.repsPerSet),
  );

  const canSubmit = Boolean(matchup) && allExercisesValid && !busy;

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

    if (!allExercisesValid) {
      setError('Complete every exercise with a name, sets, and reps per set.');
      return;
    }

    const workoutRows = exercises.map((exercise) => ({
      user_id: user.id,
      matchup_id: matchup.matchup_id,
      exercise_name: exercise.exercise.trim(),
      sets: Number(exercise.sets),
      reps_per_set: Number(exercise.repsPerSet),
    }));
    const totalReps = workoutRows.reduce(
      (total, exercise) => total + exercise.sets * exercise.reps_per_set,
      0,
    );

    setBusy(true);
    const { error: insertError } = await supabase.from('workouts').insert(workoutRows);
    setBusy(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setExercises([createBlankExercise(nextId)]);
    setNextId((current) => current + 1);
    setMessage(
      `Logged ${workoutRows.length} ${workoutRows.length === 1 ? 'exercise' : 'exercises'} · ${totalReps} reps · ${totalReps * 5} points.`,
    );
    refresh();
  }, [user, matchup, exercises, allExercisesValid, nextId, refresh]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#52b788" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Log Workout</Text>
        <Text style={styles.lede}>
          Points are sets × reps × 5, calculated by the database — not the app.
        </Text>

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

        {exercises.map((exercise, index) => (
          <View key={exercise.id} style={styles.exerciseCard}>
            <View style={styles.exerciseHeader}>
              <Text style={styles.exerciseTitle}>Exercise {index + 1}</Text>
              {index > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove exercise ${index + 1}`}
                  hitSlop={8}
                  onPress={() => removeExercise(exercise.id)}>
                  <Text style={styles.removeText}>Remove</Text>
                </Pressable>
              ) : null}
            </View>

            <TextInput
              style={styles.input}
              placeholder="Exercise (e.g. Push-ups)"
              placeholderTextColor="#8a8a8a"
              value={exercise.exercise}
              onChangeText={(value) => updateExercise(exercise.id, 'exercise', value)}
            />
            <View style={styles.numberRow}>
              <TextInput
                style={[styles.input, styles.numberInput]}
                placeholder="Number of sets"
                placeholderTextColor="#8a8a8a"
                keyboardType="number-pad"
                value={exercise.sets}
                onChangeText={(value) => updateExercise(exercise.id, 'sets', value)}
              />
              <TextInput
                style={[styles.input, styles.numberInput]}
                placeholder="Reps per set"
                placeholderTextColor="#8a8a8a"
                keyboardType="number-pad"
                value={exercise.repsPerSet}
                onChangeText={(value) => updateExercise(exercise.id, 'repsPerSet', value)}
              />
            </View>
          </View>
        ))}

        <Pressable style={styles.addButton} onPress={addExercise}>
          <Text style={styles.addButtonText}>Add Exercise</Text>
        </Pressable>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {message ? <Text style={styles.success}>{message}</Text> : null}

        <Pressable
          style={[styles.button, !canSubmit && styles.buttonDisabled]}
          onPress={submit}
          disabled={!canSubmit}>
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Submit Workout</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
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
  exerciseCard: {
    backgroundColor: '#141b22',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#2a3440',
  },
  exerciseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  exerciseTitle: { color: '#f4f4f0', fontSize: 16, fontWeight: '700' },
  removeText: { color: '#e76f51', fontSize: 14, fontWeight: '600' },
  numberRow: { flexDirection: 'row', gap: 10 },
  numberInput: { flex: 1, marginBottom: 0 },
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
  addButton: {
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#52b788',
  },
  addButtonText: { color: '#52b788', fontWeight: '700', fontSize: 16 },
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
