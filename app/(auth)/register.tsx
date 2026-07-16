import { Link } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuthStore } from '@/stores/authStore';

export default function RegisterScreen() {
  const signUp = useAuthStore((s) => s.signUp);
  const loading = useAuthStore((s) => s.loading);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const onSubmit = async () => {
    setError(null);
    setInfo(null);
    if (!displayName.trim() || !email.trim() || password.length < 6) {
      setError('Display name, email, and a password of at least 6 characters are required.');
      return;
    }
    const message = await signUp(email.trim(), password, displayName.trim());
    if (message) {
      if (message.toLowerCase().includes('confirm')) {
        setInfo(message);
      } else {
        setError(message);
      }
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Text style={styles.brand}>Join Gym Fantasy</Text>
      <Text style={styles.subtitle}>Create an account to compete</Text>

      <TextInput
        style={styles.input}
        placeholder="Display name"
        placeholderTextColor="#8a8a8a"
        value={displayName}
        onChangeText={setDisplayName}
      />
      <TextInput
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        placeholder="Email"
        placeholderTextColor="#8a8a8a"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        secureTextEntry
        placeholder="Password"
        placeholderTextColor="#8a8a8a"
        value={password}
        onChangeText={setPassword}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {info ? <Text style={styles.info}>{info}</Text> : null}

      <Pressable style={styles.button} onPress={onSubmit} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Create Account</Text>
        )}
      </Pressable>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Already have an account? </Text>
        <Link href="/(auth)/login" style={styles.link}>
          Sign in
        </Link>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#0f1419',
  },
  brand: {
    fontSize: 32,
    fontWeight: '800',
    color: '#f4f4f0',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#a8b0b8',
    marginBottom: 32,
  },
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
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  error: {
    color: '#e76f51',
    marginBottom: 8,
  },
  info: {
    color: '#52b788',
    marginBottom: 8,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
  },
  footerText: {
    color: '#a8b0b8',
  },
  link: {
    color: '#52b788',
    fontWeight: '600',
  },
});
