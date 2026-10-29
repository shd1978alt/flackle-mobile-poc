import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../icons/Icon';
import { IconName } from '../icons/paths';
import { colors, dp, fonts } from '../theme';
import { Message, PresenceStatus, User } from '../types';
import { formatTime, userName } from '../utils';
import { LARGE_DOT, PresenceAvatar } from './PresenceDot';

// Reaction row from the 'card' frame (11 emoji, 64px glyphs).
const EMOJI = ['😭', '😵', '😵‍💫', '❤️', '🔥', '😘', '✨', '💀', '😼', '😉', '🤣'];

interface Props {
  msg: Message | null;
  user: User | null; // sender of `msg`
  presence?: PresenceStatus; // status dot on the sender's avatar
  mine: boolean;
  onClose(): void;
  onReact(emoji: string): void;
  onReply(): void;
  onEdit(): void;
  onCopy(): void;
  onDelete(): void;
}

interface Action {
  key: string;
  label: string;
  icon: IconName;
  danger?: boolean;
  disabled?: boolean;
  onPress(): void;
}

// Bottom drawer from the 'Group 2565' frame. All four designed rows are always listed (Edit Message,
// Copy Text, Delete Message, Report Message). Edit and Delete only work on your own messages (existing PoC
// rule), so on other people's messages they are shown dimmed and do nothing. Report is visual-only.
// Reply is not in the design but is an existing feature, so it is kept as an extra row in the same style.
export function MessageActions({ msg, user, presence, mine, onClose, onReact, onReply, onEdit, onCopy, onDelete }: Props) {
  const insets = useSafeAreaInsets();
  const isText = !!msg && msg.type === 'text' && !msg.is_deleted;

  const neutral: Action[] = [];
  if (isText) {
    neutral.push({ key: 'reply', label: 'Reply', icon: 'reply', onPress: onReply });
    neutral.push({ key: 'edit', label: 'Edit Message', icon: 'edit', disabled: !mine, onPress: onEdit });
    neutral.push({ key: 'copy', label: 'Copy Text', icon: 'copy', onPress: onCopy });
  }
  const danger: Action[] = [
    { key: 'delete', label: 'Delete Message', icon: 'trash', danger: true, disabled: !mine, onPress: onDelete },
    { key: 'report', label: 'Report Message', icon: 'flag', danger: true, onPress: onClose },
  ];

  const renderRow = (a: Action, gap: number) => (
    <Pressable
      key={a.key}
      onPress={a.onPress}
      disabled={a.disabled}
      accessibilityState={{ disabled: !!a.disabled }}
      style={[styles.action, { marginTop: gap }, a.disabled && { opacity: 0.4 }]}
    >
      <View style={styles.iconBox}>
        <Icon name={a.icon} height={dp(a.icon === 'edit' ? 38 : 44)} color={a.danger ? colors.destructive : colors.text} />
      </View>
      <Text style={[styles.actionText, a.danger && { color: colors.destructive }]}>{a.label}</Text>
    </Pressable>
  );

  return (
    <Modal visible={!!msg} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      {/* The design has no scrim, so the backdrop is transparent; tapping it dismisses. */}
      <Pressable style={styles.backdrop} onPress={onClose}>
        {msg && (
          <Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, dp(80)) }]} onPress={() => {}}>
            <View style={styles.grabber} />
            <View style={styles.emojiPill}>
              {EMOJI.map((e) => (
                <Pressable key={e} onPress={() => onReact(e)} hitSlop={6}>
                  <Text style={styles.emoji}>{e}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.preview}>
              <PresenceAvatar uri={user?.avatar_url} name={userName(user)} size={dp(112)} status={presence} dot={LARGE_DOT} ring={colors.presenceRing} />
              <View style={styles.previewBody}>
                <View style={styles.nameRow}>
                  <Text style={styles.author} numberOfLines={1}>
                    {userName(user)}
                  </Text>
                  <Text style={styles.time}>{formatTime(msg.created_at)}</Text>
                </View>
                <Text style={styles.previewText} numberOfLines={4}>
                  {msg.is_deleted ? 'Message deleted' : msg.type !== 'text' ? 'Unsupported message' : msg.content}
                </Text>
              </View>
            </View>
            {neutral.map((a, i) => renderRow(a, i === 0 ? dp(37) : dp(10)))}
            {danger.map((a, i) => renderRow(a, i === 0 ? (neutral.length ? dp(42) : dp(37)) : dp(13)))}
          </Pressable>
        )}
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.sheet, borderTopLeftRadius: dp(105), borderTopRightRadius: dp(105), paddingHorizontal: dp(61) },
  grabber: { alignSelf: 'center', marginTop: dp(17), width: dp(352), height: dp(10), borderRadius: dp(33), backgroundColor: colors.grabber },
  emojiPill: { marginTop: dp(32), height: dp(107), borderRadius: dp(67), backgroundColor: colors.sheetItem, paddingHorizontal: dp(42), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  emoji: { fontSize: dp(64), lineHeight: dp(80) },
  preview: { marginTop: dp(32), borderRadius: dp(25), backgroundColor: colors.sheetItem, paddingHorizontal: dp(35), paddingVertical: dp(32), flexDirection: 'row' },
  previewBody: { flex: 1, marginLeft: dp(28) },
  nameRow: { flexDirection: 'row', alignItems: 'flex-start' },
  author: { flexShrink: 1, color: colors.text, fontFamily: fonts.satoshiBold, fontSize: dp(42), lineHeight: dp(57) },
  time: { marginLeft: dp(18), marginTop: dp(8), color: colors.textFaint, fontFamily: fonts.manropeRegular, fontSize: dp(30), lineHeight: dp(41) },
  previewText: { marginTop: dp(3), color: colors.textSecondary, fontFamily: fonts.satoshiRegular, fontSize: dp(40), lineHeight: dp(58) },
  action: { height: dp(124), borderRadius: dp(25), backgroundColor: colors.sheetAction, flexDirection: 'row', alignItems: 'center', paddingLeft: dp(36) },
  iconBox: { width: dp(48), alignItems: 'center', justifyContent: 'center' },
  actionText: { marginLeft: dp(22), color: '#ffffff', fontFamily: fonts.satoshiMedium, fontSize: dp(42), lineHeight: dp(58) },
});
