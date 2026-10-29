import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '../theme';
import { User } from '../types';
import { userName } from '../utils';
import { Avatar } from './Avatar';

interface Props {
  user: User | null;
  /** Show the "Message @user" box (only when an existing DM with this user is available). */
  canMessage: boolean;
  onClose(): void;
  onSend(text: string): void;
}

// Mirrors the web profile popover: banner, avatar, name, @username, quick-message box.
// The documented API has no banner/bio fields, so the banner is a plain block.
export function UserCard({ user, canMessage, onClose, onSend }: Props) {
  const [text, setText] = useState('');
  useEffect(() => setText(''), [user?.id]);

  function submit() {
    const t = text.trim();
    if (!t) return;
    setText('');
    onSend(t);
  }

  return (
    <Modal visible={!!user} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <Pressable style={styles.backdrop} onPress={onClose}>
          {user && (
            <Pressable style={styles.card} onPress={() => {}}>
              <View style={styles.banner} />
              <View style={styles.avatarRing}>
                <Avatar uri={user.avatar_url} name={userName(user)} size={76} />
              </View>
              <View style={styles.info}>
                <Text style={styles.name} numberOfLines={1}>
                  {userName(user)}
                </Text>
                <Text style={styles.handle} numberOfLines={1}>
                  @{user.username}
                </Text>
                {canMessage && (
                  <View style={styles.inputRow}>
                    <TextInput
                      style={styles.input}
                      placeholder={`Message @${user.username}`}
                      placeholderTextColor={colors.faint}
                      value={text}
                      onChangeText={setText}
                      onSubmitEditing={submit}
                      returnKeyType="send"
                      maxLength={2000}
                    />
                    <Pressable onPress={submit} disabled={!text.trim()} hitSlop={8}>
                      <Text style={[styles.send, !text.trim() && { color: colors.faint }]}>Send</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            </Pressable>
          )}
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: colors.panel, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  banner: { height: 88, backgroundColor: colors.raised },
  avatarRing: { position: 'absolute', top: 48, left: 16, borderRadius: 44, padding: 4, backgroundColor: colors.panel },
  info: { paddingHorizontal: 16, paddingTop: 44, paddingBottom: 16 },
  name: { color: colors.text, fontSize: 22, fontWeight: '700' },
  handle: { color: colors.muted, fontSize: 14, marginTop: 2 },
  inputRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16, backgroundColor: colors.bg, borderRadius: 12, paddingLeft: 12, paddingRight: 12 },
  input: { flex: 1, color: colors.text, paddingVertical: 12, fontSize: 15 },
  send: { color: colors.accent, fontWeight: '700' },
});
