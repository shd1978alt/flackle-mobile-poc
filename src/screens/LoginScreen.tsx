import React, { useState } from 'react';
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
import { useApp } from '../store';
import { colors } from '../theme';
import { errMsg } from '../utils';

export function LoginScreen() {
  const login = useApp((s) => s.login);
  const loginMfa = useApp((s) => s.loginMfa);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfa, setMfa] = useState(false);
  const [code, setCode] = useState('');
  const [backup, setBackup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (mfa) await loginMfa(code.trim(), backup);
      else if ((await login(email.trim(), password)) === 'mfa') setMfa(true);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior="padding">
      <View style={styles.card}>
        <Text style={styles.title}>Flackle</Text>
        <Text style={styles.sub}>{mfa ? 'Enter your two-factor code' : 'Sign in to your account'}</Text>

        {!mfa ? (
          <>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor={colors.muted}
              secureTextEntry
              autoCapitalize="none"
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={submit}
            />
          </>
        ) : (
          <>
            <TextInput
              style={styles.input}
              placeholder={backup ? 'Backup code' : '6-digit code'}
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType={backup ? 'default' : 'number-pad'}
              value={code}
              onChangeText={setCode}
              onSubmitEditing={submit}
            />
            <Pressable onPress={() => setBackup((b) => !b)}>
              <Text style={styles.link}>{backup ? 'Use authenticator code' : 'Use a backup code'}</Text>
            </Pressable>
          </>
        )}

        {!!error && <Text style={styles.error}>{error}</Text>}
        <Pressable style={[styles.button, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{mfa ? 'Verify' : 'Sign in'}</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.rail, justifyContent: 'center', padding: 20 },
  card: { backgroundColor: colors.surface, borderRadius: 12, padding: 20, gap: 12 },
  title: { color: colors.text, fontSize: 28, fontWeight: '700' },
  sub: { color: colors.muted, marginBottom: 4 },
  input: { backgroundColor: colors.pane, color: colors.text, borderRadius: 8, padding: 12, fontSize: 16 },
  button: { backgroundColor: colors.accent, borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 4 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  error: { color: '#ff8a8a' },
  link: { color: colors.accent },
});
