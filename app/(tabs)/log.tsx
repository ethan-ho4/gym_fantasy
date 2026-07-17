import { useCallback, useEffect, useRef, useState } from 'react';
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

type WeightUnit = 'lb' | 'kg';

type SetDraft = {
  id: number;
  weight: string;
  reps: string;
};

type ExerciseDraft = {
  id: number;
  name: string;
  sets: SetDraft[];
};

const createBlankSet = (id: number): SetDraft => ({
  id,
  weight: '',
  reps: '',
});

const isValidWeight = (value: string) => {
  const number = Number(value);
  return value.trim() !== '' && Number.isFinite(number) && number >= 0;
};

const isValidReps = (value: string) => {
  const number = Number(value);
  return value.trim() !== '' && Number.isInteger(number) && number > 0;
};

export default function LogScreen() {
  const { matchup, loading, refresh } = useActiveMatchup();
  const nextExerciseId = useRef(2);
  const nextSetId = useRef(2);
  const [weightUnit, setWeightUnit] = useState<WeightUnit>('lb');
  const [draftExercises, setDraftExercises] = useState<ExerciseDraft[]>([]);
  const [editor, setEditor] = useState<ExerciseDraft>({
    id: 1,
    name: '',
    sets: [createBlankSet(1)],
  });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createBlankExercise = useCallback((): ExerciseDraft => {
    const exerciseId = nextExerciseId.current;
    const setId = nextSetId.current;
    nextExerciseId.current += 1;
    nextSetId.current += 1;
    return {
      id: exerciseId,
      name: '',
      sets: [createBlankSet(setId)],
    };
  }, []);

  const resetEditor = useCallback(() => {
    setEditor(createBlankExercise());
    setEditingId(null);
  }, [createBlankExercise]);

  const editorIsPristine =
    editor.name.trim() === '' &&
    editor.sets.length === 1 &&
    editor.sets[0].weight === '' &&
    editor.sets[0].reps === '';

  const editorIsValid =
    editor.name.trim().length > 0 &&
    editor.sets.length > 0 &&
    editor.sets.every((set) => isValidWeight(set.weight) && isValidReps(set.reps));

  const draftTotals = draftExercises.reduce(
    (totals, exercise) => {
      totals.sets += exercise.sets.length;
      totals.reps += exercise.sets.reduce((sum, set) => sum + Number(set.reps), 0);
      return totals;
    },
    { sets: 0, reps: 0 },
  );

  const updateSet = useCallback((setId: number, field: 'weight' | 'reps', value: string) => {
    setEditor((current) => ({
      ...current,
      sets: current.sets.map((set) => (set.id === setId ? { ...set, [field]: value } : set)),
    }));
    setError(null);
    setMessage(null);
  }, []);

  const addSet = useCallback(() => {
    const setId = nextSetId.current;
    nextSetId.current += 1;
    setEditor((current) => ({
      ...current,
      sets: [...current.sets, createBlankSet(setId)],
    }));
    setError(null);
    setMessage(null);
  }, []);

  const removeSet = useCallback((setId: number) => {
    setEditor((current) => ({
      ...current,
      sets:
        current.sets.length === 1
          ? current.sets
          : current.sets.filter((set) => set.id !== setId),
    }));
    setError(null);
    setMessage(null);
  }, []);

  const saveExercise = useCallback(() => {
    setError(null);
    setMessage(null);

    if (!editorIsValid) {
      setError('Enter an exercise name, weight, and positive reps for every set.');
      return;
    }

    const completedExercise = {
      ...editor,
      name: editor.name.trim(),
      sets: editor.sets.map((set) => ({
        ...set,
        weight: String(Number(set.weight)),
        reps: String(Number(set.reps)),
      })),
    };

    if (editingId === null) {
      setDraftExercises((current) => [...current, completedExercise]);
    } else {
      setDraftExercises((current) =>
        current.map((exercise) =>
          exercise.id === editingId ? completedExercise : exercise,
        ),
      );
    }

    resetEditor();
  }, [editor, editorIsValid, editingId, resetEditor]);

  const editExercise = useCallback((exercise: ExerciseDraft) => {
    setEditor({
      ...exercise,
      sets: exercise.sets.map((set) => ({ ...set })),
    });
    setEditingId(exercise.id);
    setError(null);
    setMessage(null);
  }, []);

  const removeExercise = useCallback(
    (exerciseId: number) => {
      setDraftExercises((current) =>
        current.filter((exercise) => exercise.id !== exerciseId),
      );
      if (editingId === exerciseId) {
        resetEditor();
      }
      setError(null);
      setMessage(null);
    },
    [editingId, resetEditor],
  );

  const canSubmit =
    Boolean(matchup) &&
    draftExercises.length > 0 &&
    editingId === null &&
    editorIsPristine &&
    !busy;

  const submitWorkout = useCallback(async () => {
    setError(null);
    setMessage(null);

    if (!matchup) {
      setError('No active matchup. Join a league and start the bracket first.');
      return;
    }

    if (isPastWeeklyCutoff(matchup.week_end)) {
      setError('This week is closed. Late logs are rejected after Sunday 11:59 PM ET.');
      return;
    }

    if (draftExercises.length === 0) {
      setError('Add at least one exercise before submitting.');
      return;
    }

    if (editingId !== null || !editorIsPristine) {
      setError('Save or clear the exercise currently in the editor before submitting.');
      return;
    }

    const exercisesPayload = draftExercises.map((exercise) => ({
      name: exercise.name,
      sets: exercise.sets.map((set) => ({
        weight: Number(set.weight),
        reps: Number(set.reps),
      })),
    }));

    const totalReps = draftExercises.reduce(
      (total, exercise) =>
        total + exercise.sets.reduce((sum, set) => sum + Number(set.reps), 0),
      0,
    );

    setBusy(true);
    const { error: submitError } = await supabase.rpc('submit_workout_session', {
      p_matchup_id: matchup.matchup_id,
      p_weight_unit: weightUnit,
      p_exercises: exercisesPayload,
    });
    setBusy(false);

    if (submitError) {
      setError(submitError.message);
      return;
    }

    const exerciseCount = draftExercises.length;
    setDraftExercises([]);
    setWeightUnit('lb');
    resetEditor();
    setMessage(
      `Logged ${exerciseCount} ${exerciseCount === 1 ? 'exercise' : 'exercises'} · ${totalReps} reps · ${totalReps * 5} points.`,
    );
    refresh();
  }, [
    matchup,
    draftExercises,
    editingId,
    editorIsPristine,
    weightUnit,
    resetEditor,
    refresh,
  ]);

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
        <Text style={styles.title}>Build Workout</Text>
        <Text style={styles.lede}>
          Log weight and reps for every set. Points remain total reps × 5.
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

        <View style={styles.unitRow}>
          <Text style={styles.sectionLabel}>Weight unit</Text>
          <View style={styles.segmentedControl}>
            {(['lb', 'kg'] as const).map((unit) => (
              <Pressable
                key={unit}
                style={[styles.unitButton, weightUnit === unit && styles.unitButtonActive]}
                onPress={() => setWeightUnit(unit)}>
                <Text
                  style={[
                    styles.unitButtonText,
                    weightUnit === unit && styles.unitButtonTextActive,
                  ]}>
                  {unit}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {draftExercises.length > 0 ? (
          <View style={styles.draftSection}>
            <View style={styles.draftHeader}>
              <Text style={styles.sectionTitle}>Workout draft</Text>
              <Text style={styles.draftTotals}>
                {draftTotals.sets} sets · {draftTotals.reps} reps · {draftTotals.reps * 5} pts
              </Text>
            </View>

            {draftExercises.map((exercise) => (
              <View key={exercise.id} style={styles.summaryCard}>
                <View style={styles.summaryHeader}>
                  <Text style={styles.summaryTitle}>{exercise.name}</Text>
                  <View style={styles.summaryActions}>
                    <Pressable onPress={() => editExercise(exercise)} hitSlop={8}>
                      <Text style={styles.editText}>Edit</Text>
                    </Pressable>
                    <Pressable onPress={() => removeExercise(exercise.id)} hitSlop={8}>
                      <Text style={styles.removeText}>Remove</Text>
                    </Pressable>
                  </View>
                </View>
                {exercise.sets.map((set, index) => (
                  <Text key={set.id} style={styles.summarySet}>
                    Set {index + 1}: {set.weight} {weightUnit} × {set.reps} reps
                  </Text>
                ))}
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.editorCard}>
          <View style={styles.editorHeader}>
            <Text style={styles.sectionTitle}>
              {editingId === null ? 'Add exercise' : 'Edit exercise'}
            </Text>
            {!editorIsPristine ? (
              <Pressable onPress={resetEditor} hitSlop={8}>
                <Text style={styles.clearText}>
                  {editingId === null ? 'Clear' : 'Cancel'}
                </Text>
              </Pressable>
            ) : null}
          </View>

          <TextInput
            style={styles.input}
            placeholder="Exercise name"
            placeholderTextColor="#8a8a8a"
            value={editor.name}
            onChangeText={(name) => {
              setEditor((current) => ({ ...current, name }));
              setError(null);
              setMessage(null);
            }}
          />

          <View style={styles.setColumnHeaders}>
            <Text style={[styles.columnHeader, styles.setNumberColumn]}>SET</Text>
            <Text style={[styles.columnHeader, styles.valueColumn]}>
              {weightUnit.toUpperCase()}
            </Text>
            <Text style={[styles.columnHeader, styles.valueColumn]}>REPS</Text>
            <View style={styles.removeColumn} />
          </View>

          {editor.sets.map((set, index) => (
            <View key={set.id} style={styles.setRow}>
              <Text style={[styles.setNumber, styles.setNumberColumn]}>{index + 1}</Text>
              <TextInput
                style={[styles.setInput, styles.valueColumn]}
                accessibilityLabel={`Set ${index + 1} weight in ${weightUnit}`}
                placeholder="0"
                placeholderTextColor="#6b7380"
                keyboardType="decimal-pad"
                value={set.weight}
                onChangeText={(value) => updateSet(set.id, 'weight', value)}
              />
              <TextInput
                style={[styles.setInput, styles.valueColumn]}
                accessibilityLabel={`Set ${index + 1} reps`}
                placeholder="0"
                placeholderTextColor="#6b7380"
                keyboardType="number-pad"
                value={set.reps}
                onChangeText={(value) => updateSet(set.id, 'reps', value)}
              />
              <View style={styles.removeColumn}>
                {editor.sets.length > 1 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove set ${index + 1}`}
                    hitSlop={8}
                    onPress={() => removeSet(set.id)}>
                    <Text style={styles.removeSetText}>×</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))}

          <Pressable style={styles.addSetButton} onPress={addSet}>
            <Text style={styles.addSetButtonText}>+ Add Set</Text>
          </Pressable>

          <Pressable
            style={[styles.addExerciseButton, !editorIsValid && styles.buttonDisabled]}
            disabled={!editorIsValid}
            onPress={saveExercise}>
            <Text style={styles.buttonText}>
              {editingId === null ? 'Add Exercise' : 'Save Exercise'}
            </Text>
          </Pressable>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {message ? <Text style={styles.success}>{message}</Text> : null}

        <Pressable
          style={[styles.submitButton, !canSubmit && styles.buttonDisabled]}
          disabled={!canSubmit}
          onPress={submitWorkout}>
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
  content: { padding: 18, paddingBottom: 48 },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f1419',
  },
  title: { fontSize: 28, fontWeight: '800', color: '#f4f4f0', marginBottom: 8 },
  lede: { fontSize: 15, color: '#a8b0b8', marginBottom: 18, lineHeight: 22 },
  banner: {
    backgroundColor: '#1a222b',
    borderRadius: 12,
    padding: 15,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2a3440',
  },
  bannerTitle: { color: '#f4f4f0', fontSize: 17, fontWeight: '700' },
  bannerMuted: { color: '#a8b0b8', marginTop: 4 },
  unitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sectionLabel: { color: '#a8b0b8', fontSize: 14, fontWeight: '600' },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: '#1a222b',
    borderRadius: 9,
    padding: 3,
    borderWidth: 1,
    borderColor: '#2a3440',
  },
  unitButton: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 7 },
  unitButtonActive: { backgroundColor: '#2d6a4f' },
  unitButtonText: { color: '#8a939d', fontWeight: '700', textTransform: 'uppercase' },
  unitButtonTextActive: { color: '#fff' },
  draftSection: { marginBottom: 16 },
  draftHeader: { marginBottom: 10 },
  sectionTitle: { color: '#f4f4f0', fontSize: 18, fontWeight: '700' },
  draftTotals: { color: '#52b788', fontSize: 13, marginTop: 4 },
  summaryCard: {
    backgroundColor: '#1a222b',
    borderRadius: 10,
    padding: 14,
    marginBottom: 9,
    borderWidth: 1,
    borderColor: '#2a3440',
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  summaryTitle: { color: '#f4f4f0', fontSize: 16, fontWeight: '700', flex: 1 },
  summaryActions: { flexDirection: 'row', gap: 16, marginLeft: 12 },
  editText: { color: '#52b788', fontWeight: '600' },
  removeText: { color: '#e76f51', fontWeight: '600' },
  summarySet: { color: '#a8b0b8', fontSize: 14, lineHeight: 21 },
  editorCard: {
    backgroundColor: '#141b22',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#2a3440',
  },
  editorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  clearText: { color: '#a8b0b8', fontWeight: '600' },
  input: {
    backgroundColor: '#1a222b',
    borderRadius: 9,
    paddingHorizontal: 13,
    paddingVertical: 13,
    color: '#f4f4f0',
    fontSize: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#2a3440',
  },
  setColumnHeaders: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  columnHeader: { color: '#6b7380', fontSize: 11, fontWeight: '700' },
  setNumberColumn: { width: 38 },
  valueColumn: { flex: 1, marginHorizontal: 4 },
  removeColumn: { width: 28, alignItems: 'center' },
  setRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  setNumber: { color: '#f4f4f0', fontSize: 16, textAlign: 'center' },
  setInput: {
    backgroundColor: '#1a222b',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 11,
    color: '#f4f4f0',
    fontSize: 16,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: '#2a3440',
  },
  removeSetText: { color: '#e76f51', fontSize: 24, lineHeight: 26 },
  addSetButton: {
    borderRadius: 9,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 4,
    backgroundColor: '#1a222b',
  },
  addSetButtonText: { color: '#a8b0b8', fontWeight: '700' },
  addExerciseButton: {
    backgroundColor: '#2d6a4f',
    borderRadius: 9,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 10,
  },
  submitButton: {
    backgroundColor: '#40916c',
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  error: { color: '#e76f51', marginTop: 12 },
  success: { color: '#52b788', marginTop: 12 },
});
