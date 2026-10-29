import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useMemo, useState } from 'react';
import { Alert, FlatList, Platform, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LIST_DOT, PresenceAvatar } from '../components/PresenceDot';
import { BottomNav } from '../components/BottomNav';
import { ServerRail } from '../components/ServerRail';
import { Icon } from '../icons/Icon';
import { presenceFor, useApp } from '../store';
import { colors, dp, fonts } from '../theme';
import { Conversation, RootStackParamList } from '../types';
import { convAvatar, convTitle, formatListTime, otherUser, previewText, userName } from '../utils';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

// 'Mobile navigation' frame: 12px above the pill, 156px pill, 57.9px below it.
const NAV_BOTTOM = dp(57.9);
const NAV_SPACE = dp(12) + dp(156) + NAV_BOTTOM;

export function HomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const me = useApp((s) => s.me)!;
  const conversations = useApp((s) => s.conversations);
  const servers = useApp((s) => s.servers);
  const unread = useApp((s) => s.unread);
  const presence = useApp((s) => s.presence);
  const presenceKnown = useApp((s) => s.presenceKnown);
  const connection = useApp((s) => s.connection);
  const refresh = useApp((s) => s.refreshConversations);
  const logout = useApp((s) => s.logout);
  const [refreshing, setRefreshing] = useState(false);
  const [serverId, setServerId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const server = servers.find((s) => s.id === serverId) ?? null; // falls back to DMs if it disappears

  const data = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? conversations.filter((c) => convTitle(c, me.id).toLowerCase().includes(q)) : conversations;
  }, [conversations, query, me.id]);

  const renderItem = ({ item }: { item: Conversation }) => {
    const title = convTitle(item, me.id);
    const count = unread[item.id] ?? 0;
    const isUnread = count > 0;
    const peer = item.type === 'dm' ? otherUser(item, me.id) : undefined;
    const status = peer ? presenceFor({ me, connection, presence, presenceKnown }, peer.id) : undefined;
    return (
      <Pressable
        style={({ pressed }) => [styles.row, pressed && { backgroundColor: 'rgba(25,25,33,0.6)' }]}
        onPress={() => navigation.navigate('Chat', { conversationId: item.id })}
      >
        <PresenceAvatar uri={convAvatar(item, me.id)} name={title} size={dp(96)} status={status} dot={LIST_DOT} ring={colors.pane} />
        <View style={styles.rowBody}>
          <View style={styles.nameLine}>
            <Text style={[styles.name, isUnread && styles.nameUnread]} numberOfLines={1}>
              {title}
            </Text>
            <Text style={[styles.time, isUnread && styles.timeUnread]}>{formatListTime(item.last_message_at)}</Text>
          </View>
          <View style={isUnread ? styles.previewLineUnread : styles.previewLine}>
            <Text style={[styles.preview, isUnread && styles.previewUnread]} numberOfLines={1}>
              {previewText(item, me.id)}
            </Text>
            {isUnread && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
              </View>
            )}
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ServerRail selectedId={server?.id ?? null} onSelect={setServerId} bottomInset={NAV_SPACE} />
      <View style={styles.pane}>
        {server ? (
          <View style={styles.soon}>
            <Text style={styles.soonTitle}>{server.name}</Text>
            <Text style={styles.soonText}>Channels aren't available yet. This build only covers direct messages.</Text>
          </View>
        ) : (
          <>
            {/* 'Conversation search': a faint header card sits behind the field; its title text
                ("leave empty for now" in the design) is left out. */}
            <View style={styles.header}>
              <View style={styles.headerCard} />
              <View style={styles.search}>
                <Icon name="search" width={dp(32.7)} color={colors.textMuted} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search conversations"
                  placeholderTextColor={colors.textMuted}
                  value={query}
                  onChangeText={setQuery}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>
            <FlatList
              style={{ marginTop: dp(38) }}
              data={data}
              keyExtractor={(c) => c.id}
              renderItem={renderItem}
              contentContainerStyle={{ paddingBottom: NAV_SPACE }}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={styles.empty}>{query ? 'No matches.' : 'No conversations yet.'}</Text>}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  tintColor={colors.text}
                  onRefresh={async () => {
                    setRefreshing(true);
                    await refresh();
                    setRefreshing(false);
                  }}
                />
              }
            />
          </>
        )}
      </View>
      <View
        pointerEvents="box-none"
        style={[styles.navWrap, { paddingBottom: Platform.OS === 'ios' ? NAV_BOTTOM : Math.max(insets.bottom, NAV_BOTTOM) }]}
      >
        <BottomNav
          onProfilePress={() =>
            // Account/sign-out used to live in the sidebar user panel, which the design drops.
            Alert.alert(userName(me), `@${me.username}`, [
              { text: 'Sign out', style: 'destructive', onPress: logout },
              { text: 'Cancel', style: 'cancel' },
            ])
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', backgroundColor: colors.screen },
  pane: { flex: 1, backgroundColor: colors.pane, borderTopLeftRadius: dp(61.6), borderWidth: 1, borderColor: colors.paneBorder, overflow: 'hidden' },
  header: { height: dp(183 + 102.7) },
  headerCard: { position: 'absolute', top: dp(29), left: dp(34), right: dp(28), height: dp(219), borderRadius: dp(30.8), backgroundColor: colors.surface, opacity: 0.21 },
  search: { position: 'absolute', top: dp(183), left: dp(33.8), right: dp(27.8), height: dp(102.7), borderRadius: dp(30.8), backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', paddingLeft: dp(36.2) },
  searchInput: { flex: 1, marginLeft: dp(26.1), color: colors.text, fontFamily: fonts.interRegular, fontSize: dp(37.375), paddingVertical: 0 },
  // Rows have natural heights in the design: 44.3px of space between rows, 37px preview line (read) or
  // 46.2px (unread, because of the badge). Time and badge end 40px before the preview's right edge.
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: dp(54.8), paddingRight: dp(38.8), paddingVertical: dp(22.15) },
  rowBody: { flex: 1, marginLeft: dp(26.2) },
  nameLine: { flexDirection: 'row', alignItems: 'flex-start', marginRight: dp(40) },
  name: { flex: 1, color: colors.textSecondary, fontFamily: fonts.satoshiBold, fontSize: dp(35.93), lineHeight: dp(49) },
  nameUnread: { color: colors.text },
  time: { marginLeft: dp(16), marginTop: dp(4), color: colors.textFaint, fontFamily: fonts.manropeSemiBold, fontSize: dp(25.67), lineHeight: dp(35) },
  timeUnread: { color: colors.textSecondary },
  previewLine: { marginTop: dp(11.8), height: dp(37) },
  previewLineUnread: { marginTop: dp(11.8), height: dp(46.2), flexDirection: 'row', alignItems: 'flex-start', paddingRight: dp(40) },
  preview: { flex: 1, color: colors.textMuted, fontFamily: fonts.satoshiRegular, fontSize: dp(30.8), lineHeight: dp(42) },
  previewUnread: { color: colors.textSecondary, marginTop: dp(4.6), marginRight: dp(16) },
  badge: { minWidth: dp(46.2), height: dp(46.2), borderRadius: dp(25.67), paddingHorizontal: dp(10), backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: colors.text, fontFamily: fonts.manropeBold, fontSize: dp(25.67), lineHeight: dp(35) },
  empty: { color: colors.textMuted, fontFamily: fonts.satoshiRegular, textAlign: 'center', marginTop: dp(120) },
  soon: { flex: 1, paddingHorizontal: dp(60), paddingTop: dp(200), gap: dp(20) },
  soonTitle: { color: colors.text, fontFamily: fonts.satoshiBold, fontSize: dp(42), textAlign: 'center' },
  soonText: { color: colors.textMuted, fontFamily: fonts.satoshiRegular, fontSize: dp(32), textAlign: 'center' },
  navWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: dp(50) },
});
