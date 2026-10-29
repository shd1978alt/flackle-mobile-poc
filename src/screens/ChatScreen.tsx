import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Clipboard from 'expo-clipboard';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LARGE_DOT, PresenceAvatar } from '../components/PresenceDot';
import { BottomNav } from '../components/BottomNav';
import { MessageActions } from '../components/MessageActions';
import { MessageRow } from '../components/MessageRow';
import { UserCard } from '../components/UserCard';
import { Icon } from '../icons/Icon';
import { presenceFor, useApp } from '../store';
import { colors, dp, fonts } from '../theme';
import { Message, RootStackParamList, User } from '../types';
import { buildRows, convAvatar, convTitle, errMsg, isLocal, otherUser, toReply, userName } from '../utils';

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;

const NAV_BOTTOM = dp(57.9);

export function ChatScreen({ route, navigation }: Props) {
  const { conversationId } = route.params;
  const me = useApp((s) => s.me)!;
  const conv = useApp((s) => s.conversations.find((c) => c.id === conversationId));
  const conversations = useApp((s) => s.conversations);
  const chat = useApp((s) => s.chats[conversationId]);
  const notice = useApp((s) => s.notice);
  const marker = useApp((s) => s.newMarker[conversationId]);
  const presence = useApp((s) => s.presence);
  const presenceKnown = useApp((s) => s.presenceKnown);
  const connection = useApp((s) => s.connection);
  const presenceOf = (id?: string) => presenceFor({ me, connection, presence, presenceKnown }, id);
  const { openConversation, closeConversation, loadLatest, loadOlder, send, edit, remove, toggleReaction, retryMessage, discardMessage, setNotice } =
    useApp.getState();

  const insets = useSafeAreaInsets();
  const [kbVisible, setKbVisible] = useState(false);
  const [input, setInput] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [actionMsg, setActionMsg] = useState<Message | null>(null);
  const [cardUserId, setCardUserId] = useState<string | null>(null);

  const title = conv ? convTitle(conv, me.id) : 'Conversation';
  const other = conv?.type === 'dm' ? otherUser(conv, me.id) : undefined;
  const status = other ? `@${other.username}` : conv ? `${conv.members.length} members` : '';

  useEffect(() => {
    void openConversation(conversationId);
    return () => closeConversation(conversationId);
  }, [conversationId]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKbVisible(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKbVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const users = useMemo(() => {
    const map = new Map<string, User>();
    conv?.members.forEach((m) => map.set(m.user.id, m.user));
    return map;
  }, [conv]);
  const userFor = (m: Message) => users.get(m.sender.id) ?? m.sender;

  // Card user: freshest copy from the conversation, else from the loaded messages.
  const cardUser = useMemo(() => {
    if (!cardUserId) return null;
    return users.get(cardUserId) ?? chat?.items.find((m) => m.sender.id === cardUserId)?.sender ?? null;
  }, [cardUserId, users, chat?.items]);
  // The quick-message box needs an existing DM with that person (creating conversations is out of scope).
  const cardDm = useMemo(
    () =>
      cardUserId && cardUserId !== me.id
        ? conversations.find((c) => c.type === 'dm' && c.members.some((m) => m.user.id === cardUserId))
        : undefined,
    [cardUserId, conversations, me.id],
  );

  // Inverted list: newest first.
  const rows = useMemo(() => buildRows(chat?.items ?? []).reverse(), [chat?.items]);

  async function submit() {
    const text = input.trim();
    if (!text) return;
    if (editing) {
      try {
        await edit(conversationId, editing.id, text);
      } catch (e) {
        Alert.alert('Could not edit message', errMsg(e));
        return;
      }
      setEditing(null);
      setInput('');
      return;
    }
    send(conversationId, text, replyTo ? toReply(replyTo) : undefined);
    setInput('');
    setReplyTo(null);
  }

  function onPressFailed(m: Message) {
    Alert.alert('Message not sent', m.error ?? 'This message may not have been delivered.', [
      { text: 'Retry', onPress: () => retryMessage(conversationId, m.id) },
      { text: 'Discard', style: 'destructive', onPress: () => discardMessage(conversationId, m.id) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  function confirmDelete(m: Message) {
    Alert.alert('Delete message?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => remove(conversationId, m.id).catch((e) => Alert.alert('Could not delete message', errMsg(e))),
      },
    ]);
  }

  const canAct = (m: Message) => !isLocal(m.id) && !m.is_deleted;
  const navBottom = Platform.OS === 'ios' ? NAV_BOTTOM : Math.max(insets.bottom, NAV_BOTTOM);

  let content: React.ReactNode;
  if (!chat || (!chat.loaded && !chat.items.length)) {
    content = <ActivityIndicator style={{ flex: 1 }} color={colors.text} />;
  } else if (chat.error && !chat.items.length) {
    content = (
      <View style={styles.center}>
        <Text style={styles.muted}>{chat.error}</Text>
        <Pressable onPress={() => loadLatest(conversationId)} style={styles.retry}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </View>
    );
  } else {
    content = (
      <FlatList
        inverted
        data={rows}
        keyExtractor={(r) => r.msg.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: dp(48) }}
        onEndReached={() => loadOlder(conversationId)}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={<View style={{ height: dp(16) }} />}
        // Visual top of the list: header-to-first-divider gap is 40.6px, 11.5px of which is the divider's own margin.
        ListFooterComponent={
          <>
            {chat.loadingOlder && <ActivityIndicator style={{ margin: 12 }} color={colors.text} />}
            <View style={{ height: dp(29.1) }} />
          </>
        }
        renderItem={({ item }) => (
          <MessageRow
            msg={item.msg}
            user={userFor(item.msg)}
            day={item.day}
            newMessages={marker && item.msg.id === marker.id ? marker.count : undefined}
            onLongPress={() => canAct(item.msg) && setActionMsg(item.msg)}
            onToggleReaction={(e) => toggleReaction(conversationId, item.msg, e)}
            onPressFailed={() => onPressFailed(item.msg)}
            onPressUser={() => setCardUserId(item.msg.sender.id)}
          />
        )}
      />
    );
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior="padding">
      <View style={{ height: insets.top }} />
      <View style={styles.pane}>
        {/* 'Conversation header' */}
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={16} style={styles.back}>
            <Icon name="back" height={dp(36)} color={colors.text} />
          </Pressable>
          <PresenceAvatar
            uri={conv ? convAvatar(conv, me.id) : null}
            name={title}
            size={dp(112)}
            status={other ? presenceOf(other.id) : undefined}
            dot={LARGE_DOT}
            ring={colors.presenceRing}
          />
          <View style={styles.headerText}>
            <Text style={styles.headerName} numberOfLines={1}>
              {title}
            </Text>
            <Text style={styles.headerStatus} numberOfLines={1}>
              {status}
            </Text>
          </View>
        </View>

        {!!notice && (
          <Pressable style={styles.notice} onPress={() => setNotice(null)}>
            <Text style={styles.noticeText}>{notice}</Text>
            <Text style={styles.noticeText}>✕</Text>
          </Pressable>
        )}

        <View style={{ flex: 1 }}>{content}</View>

        {(replyTo || editing) && (
          <View style={styles.banner}>
            <Text style={styles.bannerText} numberOfLines={1}>
              {editing ? 'Editing message' : `Replying to ${userName(replyTo!.sender)}: ${replyTo!.content}`}
            </Text>
            <Pressable
              hitSlop={10}
              onPress={() => {
                setReplyTo(null);
                setEditing(null);
                if (editing) setInput('');
              }}
            >
              <Text style={styles.bannerText}>✕</Text>
            </Pressable>
          </View>
        )}

        {/* 'Compose message' */}
        <View style={[styles.composer, { marginBottom: kbVisible ? 8 : dp(16) }]}>
          <TextInput
            style={styles.input}
            placeholder={other ? `Message @${other.username}` : `Message ${title}`}
            placeholderTextColor={colors.textMuted}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={2000}
          />
          <View style={styles.face}>
            <Icon name="face" width={dp(43)} color={colors.textMuted} />
          </View>
          <Pressable onPress={submit} disabled={!input.trim()} style={[styles.send, !input.trim() && { opacity: 0.5 }]}>
            <Icon name="send" width={dp(40.3)} color="#ffffff" />
          </Pressable>
        </View>

        {/* 'Bottom navigation': persistent tab bar, hidden while the keyboard is up. */}
        {!kbVisible && (
          <View style={[styles.navStrip, { paddingBottom: navBottom }]}>
            <BottomNav />
          </View>
        )}
      </View>

      <UserCard
        user={cardUser}
        canMessage={!!cardDm}
        onClose={() => setCardUserId(null)}
        onSend={(text) => {
          if (!cardDm) return;
          send(cardDm.id, text);
          setCardUserId(null);
          if (cardDm.id !== conversationId) navigation.push('Chat', { conversationId: cardDm.id });
        }}
      />

      <MessageActions
        msg={actionMsg}
        user={actionMsg ? userFor(actionMsg) : null}
        presence={actionMsg && conv?.type === 'dm' ? presenceOf(actionMsg.sender.id) : undefined}
        mine={actionMsg?.sender.id === me.id}
        onClose={() => setActionMsg(null)}
        onReact={(emoji) => {
          const m = actionMsg;
          setActionMsg(null);
          if (m) void toggleReaction(conversationId, m, emoji);
        }}
        onReply={() => {
          setReplyTo(actionMsg);
          setEditing(null);
          setActionMsg(null);
        }}
        onEdit={() => {
          if (actionMsg) {
            setEditing(actionMsg);
            setReplyTo(null);
            setInput(actionMsg.content);
          }
          setActionMsg(null);
        }}
        onCopy={() => {
          const m = actionMsg;
          setActionMsg(null);
          if (m) void Clipboard.setStringAsync(m.content);
        }}
        onDelete={() => {
          const m = actionMsg;
          setActionMsg(null);
          if (m) confirmDelete(m);
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.convoTop },
  pane: { flex: 1, backgroundColor: colors.pane },
  header: { marginHorizontal: dp(36), marginTop: dp(33), height: dp(194), borderRadius: dp(34), backgroundColor: colors.header, flexDirection: 'row', alignItems: 'center', paddingLeft: dp(63) },
  back: { marginRight: dp(41) },
  headerText: { flex: 1, marginLeft: dp(26), marginRight: dp(24) },
  headerName: { color: colors.text, fontFamily: fonts.satoshiBold, fontSize: dp(40), lineHeight: dp(54) },
  headerStatus: { marginTop: dp(9), color: colors.textMuted, fontFamily: fonts.satoshiRegular, fontSize: dp(28), lineHeight: dp(38) },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  muted: { color: colors.textMuted, fontFamily: fonts.satoshiRegular },
  retry: { backgroundColor: colors.red, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  retryText: { color: '#fff', fontFamily: fonts.satoshiMedium },
  notice: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, backgroundColor: colors.red, paddingHorizontal: 12, paddingVertical: 8, marginTop: dp(16) },
  noticeText: { color: '#fff', flexShrink: 1, fontFamily: fonts.satoshiRegular },
  banner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginHorizontal: dp(48), marginBottom: dp(12), paddingHorizontal: dp(35), paddingVertical: dp(24), borderRadius: dp(25), backgroundColor: colors.surface },
  bannerText: { color: colors.textMuted, fontFamily: fonts.satoshiRegular, fontSize: dp(30), flexShrink: 1 },
  composer: { marginHorizontal: dp(48), minHeight: dp(139), borderRadius: dp(65), backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'flex-end' },
  input: { flex: 1, maxHeight: 140, paddingLeft: dp(45), paddingTop: dp(46.5), paddingBottom: dp(46.5), color: colors.text, fontFamily: fonts.satoshiRegular, fontSize: dp(34), lineHeight: dp(46) },
  face: { marginRight: dp(45), marginBottom: dp(48) },
  send: { width: dp(115), height: dp(115), margin: dp(12), borderRadius: dp(80), backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center', paddingLeft: dp(7.4) },
  navStrip: { paddingTop: dp(12), paddingHorizontal: dp(48), backgroundColor: colors.pane },
});
