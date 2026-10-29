import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';
import { Message } from '../types';
import { formatTime, isLocal } from '../utils';

interface Props {
  msg: Message;
  mine: boolean;
  onLongPress(): void;
  onToggleReaction(emoji: string): void;
  onPressFailed(): void;
}

export function MessageBubble({ msg, mine, onLongPress, onToggleReaction, onPressFailed }: Props) {
  const failed = msg.status === 'failed' || msg.status === 'unconfirmed';
  let body: React.ReactNode;
  if (msg.is_deleted) body = <Text style={styles.placeholder}>Message deleted</Text>;
  else if (msg.type !== 'text') body = <Text style={styles.placeholder}>Unsupported message</Text>;
  else body = <Text style={styles.text}>{msg.content}</Text>;

  const reply = msg.reply_to;
  return (
    <View style={[styles.row, mine ? styles.rowMine : styles.rowTheirs]}>
      <Pressable
        onLongPress={onLongPress}
        onPress={failed ? onPressFailed : undefined}
        delayLongPress={250}
        style={[styles.bubble, mine ? styles.mine : styles.theirs, msg.status === 'sending' && { opacity: 0.6 }]}
      >
        {!!reply && (
          <View style={styles.reply}>
            <Text style={styles.replyName} numberOfLines={1}>
              {reply.sender_display_name?.trim() || reply.sender_username || 'Unknown'}
            </Text>
            <Text style={styles.replyText} numberOfLines={2}>
              {reply.deleted ? 'Original message deleted' : reply.content || (reply.has_attachments ? 'Attachment' : '')}
            </Text>
          </View>
        )}
        {body}
        <Text style={styles.meta}>
          {formatTime(msg.created_at)}
          {msg.edited_at && !msg.is_deleted ? ' · edited' : ''}
          {msg.status === 'sending' ? ' · sending…' : ''}
        </Text>
        {failed && <Text style={styles.error}>{msg.error ?? 'Failed to send'} Tap to retry or discard.</Text>}
      </Pressable>
      {msg.reactions.length > 0 && !isLocal(msg.id) && (
        <View style={[styles.reactions, mine ? { justifyContent: 'flex-end' } : null]}>
          {msg.reactions.map((r) => (
            <Pressable
              key={r.emoji}
              onPress={() => onToggleReaction(r.emoji)}
              style={[styles.chip, r.me && styles.chipMe]}
            >
              <Text style={styles.chipText}>
                {r.emoji} {r.count}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginVertical: 3, paddingHorizontal: 10, maxWidth: '100%' },
  rowMine: { alignItems: 'flex-end' },
  rowTheirs: { alignItems: 'flex-start' },
  bubble: { maxWidth: '82%', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  mine: { backgroundColor: colors.mine },
  theirs: { backgroundColor: colors.theirs },
  text: { color: colors.text, fontSize: 16 },
  placeholder: { color: colors.muted, fontSize: 15, fontStyle: 'italic' },
  meta: { color: 'rgba(255,255,255,0.55)', fontSize: 11, marginTop: 3, alignSelf: 'flex-end' },
  error: { color: '#ffb4b4', fontSize: 12, marginTop: 4 },
  reply: { borderLeftWidth: 3, borderLeftColor: colors.muted, paddingLeft: 8, marginBottom: 6 },
  replyName: { color: colors.text, fontWeight: '600', fontSize: 12 },
  replyText: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  reactions: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4, gap: 4 },
  chip: { backgroundColor: colors.panel, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: colors.border },
  chipMe: { borderColor: colors.accent, backgroundColor: '#3a3f7a' },
  chipText: { color: colors.text, fontSize: 13 },
});
