import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, dp, fonts } from '../theme';
import { Message, User } from '../types';
import { formatTime, isLocal, userName } from '../utils';
import { Avatar } from './Avatar';

interface Props {
  msg: Message;
  user: User; // sender, freshest copy (from conversation members when available)
  day?: string; // date divider above this message
  newMessages?: number; // when set, the red "N new messages" divider is drawn above this message
  onLongPress(): void;
  onToggleReaction(emoji: string): void;
  onPressFailed(): void;
  onPressUser(): void;
}

// Message layout from the 'Message' frames: 112px portrait, 28px gap, author (42px) + time (30px)
// on one line, body 40px with 58px line height, 38px between messages.
export function MessageRow({ msg, user, day, newMessages, onLongPress, onToggleReaction, onPressFailed, onPressUser }: Props) {
  const failed = msg.status === 'failed' || msg.status === 'unconfirmed';
  const reply = msg.reply_to;
  const replyName = reply ? reply.sender_display_name?.trim() || reply.sender_username || 'Unknown' : '';

  let body: React.ReactNode;
  if (msg.is_deleted) body = <Text style={[styles.text, styles.placeholder]}>Message deleted</Text>;
  else if (msg.type !== 'text') body = <Text style={[styles.text, styles.placeholder]}>Unsupported message</Text>;
  else
    body = (
      <Text style={styles.text}>
        {msg.content}
        {msg.edited_at ? <Text style={styles.edited}> (edited)</Text> : null}
      </Text>
    );

  return (
    <View>
      {!!day && (
        <View style={styles.dayRow}>
          <View style={styles.dayLine} />
          <Text style={styles.dayText}>{day}</Text>
          <View style={styles.dayLine} />
        </View>
      )}
      {!!newMessages && (
        <View style={[styles.dayRow, !!day && { marginTop: 0 }]}>
          <View style={[styles.dayLine, styles.newLine]} />
          <Text style={[styles.dayText, styles.newText]}>
            {newMessages} new message{newMessages === 1 ? '' : 's'}
          </Text>
          <View style={[styles.dayLine, styles.newLine]} />
        </View>
      )}
      <Pressable
        onLongPress={onLongPress}
        onPress={failed ? onPressFailed : undefined}
        delayLongPress={250}
        style={[styles.row, msg.status === 'sending' && { opacity: 0.55 }]}
      >
        <Pressable onPress={onPressUser}>
          <Avatar uri={user.avatar_url} name={userName(user)} size={dp(112)} />
        </Pressable>
        <View style={styles.body}>
          <View style={styles.nameRow}>
            <Text style={styles.author} numberOfLines={1} onPress={onPressUser}>
              {userName(user)}
            </Text>
            <Text style={styles.time}>{formatTime(msg.created_at)}</Text>
          </View>
          {/* Reply context is not in the Figma file; kept so the existing reply feature stays visible. */}
          {!!reply && (
            <View style={styles.replyRow}>
              <View style={styles.replyBar} />
              <Text style={styles.replyName} numberOfLines={1}>
                {replyName}
              </Text>
              <Text style={[styles.replyText, reply.deleted && styles.placeholder]} numberOfLines={1}>
                {reply.deleted ? 'Original message was deleted' : reply.content || (reply.has_attachments ? 'Attachment' : '')}
              </Text>
            </View>
          )}
          {body}
          {msg.reactions.length > 0 && !isLocal(msg.id) && (
            <View style={styles.reactions}>
              {msg.reactions.map((r) => (
                <Pressable key={r.emoji} onPress={() => onToggleReaction(r.emoji)} style={[styles.chip, r.me && styles.chipMe]}>
                  <Text style={styles.chipEmoji}>{r.emoji}</Text>
                  <Text style={styles.chipCount}>{r.count}</Text>
                </Pressable>
              ))}
            </View>
          )}
          {failed && <Text style={styles.error}>{msg.error ?? 'Failed to send.'} Tap to retry or discard.</Text>}
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', marginBottom: dp(38) },
  body: { flex: 1, marginLeft: dp(28) },
  nameRow: { flexDirection: 'row', alignItems: 'flex-start' },
  author: { flexShrink: 1, color: colors.text, fontFamily: fonts.satoshiBold, fontSize: dp(42), lineHeight: dp(57) },
  time: { marginLeft: dp(18), marginTop: dp(8), color: colors.textFaint, fontFamily: fonts.manropeRegular, fontSize: dp(30), lineHeight: dp(41) },
  text: { marginTop: dp(3), color: colors.textSecondary, fontFamily: fonts.satoshiRegular, fontSize: dp(40), lineHeight: dp(58) },
  edited: { color: colors.textFaint, fontSize: dp(28) },
  placeholder: { fontFamily: fonts.satoshiItalic, color: colors.textMuted },
  error: { color: colors.destructive, fontFamily: fonts.satoshiRegular, fontSize: dp(28), marginTop: dp(8) },
  replyRow: { flexDirection: 'row', alignItems: 'center', marginTop: dp(3) },
  replyBar: { width: dp(6), alignSelf: 'stretch', borderRadius: dp(3), backgroundColor: colors.surfaceStroke, marginRight: dp(14) },
  replyName: { color: colors.textMuted, fontFamily: fonts.satoshiBold, fontSize: dp(30), maxWidth: dp(260) },
  replyText: { flex: 1, marginLeft: dp(14), color: colors.textMuted, fontFamily: fonts.satoshiRegular, fontSize: dp(30) },
  reactions: { flexDirection: 'row', flexWrap: 'wrap', gap: dp(12), marginTop: dp(2) },
  chip: { flexDirection: 'row', alignItems: 'center', height: dp(63), paddingHorizontal: dp(24), gap: dp(12), borderRadius: dp(17), backgroundColor: colors.surface, borderWidth: dp(2), borderColor: 'transparent' },
  chipMe: { borderColor: colors.red },
  chipEmoji: { fontSize: dp(36), lineHeight: dp(46) },
  chipCount: { color: colors.text, fontFamily: fonts.manropeMedium, fontSize: dp(34), lineHeight: dp(44) },
  // Dividers: 49.5px below the previous message (38px of which is that message's own margin) and 41.5px above the next.
  dayRow: { flexDirection: 'row', alignItems: 'center', marginTop: dp(11.5), marginBottom: dp(41.5) },
  dayLine: { flex: 1, height: dp(5), borderRadius: dp(3), backgroundColor: colors.surfaceStroke, opacity: 0.35 },
  newLine: { backgroundColor: colors.unreadLine, opacity: 1 },
  newText: { color: colors.red },
  dayText: { marginHorizontal: dp(24), color: colors.textMuted, fontFamily: fonts.satoshiMedium, fontSize: dp(24), lineHeight: dp(32) },
});
