import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Icon } from '../icons/Icon';
import { useApp } from '../store';
import { colors, dp, fonts } from '../theme';
import { Avatar } from './Avatar';

interface Props {
  /** Selected server id, or null for Direct Messages. */
  selectedId: string | null;
  onSelect(id: string | null): void;
  /** Extra scroll padding so the last server clears the floating tab bar. */
  bottomInset?: number;
}

const TILE = dp(140);
const RADIUS = dp(50);

// Left server rail. Geometry from the 'home' frame: 140px tiles, 159px pitch, 37px left margin.
export function ServerRail({ selectedId, onSelect, bottomInset = 0 }: Props) {
  const servers = useApp((s) => s.servers);
  // Total unread across conversations, shown on the Direct Messages tile (no unread data exists for servers).
  const dmUnread = useApp((s) => Object.values(s.unread).reduce((a, b) => a + b, 0));
  return (
    <View style={styles.rail}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: dp(29.4 - 9.5), paddingBottom: bottomInset }}>
        <Pressable style={styles.cell} onPress={() => onSelect(null)}>
          {selectedId === null && (
            <View style={styles.indicator}>
              <Icon name="indicator" height={dp(54)} color={colors.text} />
            </View>
          )}
          <View style={[styles.tile, { backgroundColor: colors.dmTile }]}>
            <View style={{ position: 'absolute', left: dp(27.5), top: dp(32.1) }}>
              <Icon name="logo" width={dp(75)} color={colors.text} />
            </View>
          </View>
          {dmUnread > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{dmUnread > 99 ? '99+' : dmUnread}</Text>
            </View>
          )}
        </Pressable>
        {servers.map((s) => (
          <Pressable
            key={s.id}
            style={styles.cell}
            onPress={() => onSelect(s.id)}
            // Diagnostic: long-press shows the raw icon URL the API returned for this server.
            onLongPress={() => Alert.alert(s.name, `icon_url: ${s.icon_url ?? '(none)'}`)}
          >
            {selectedId === s.id && (
              <View style={styles.indicator}>
                <Icon name="indicator" height={dp(54)} color={colors.text} />
              </View>
            )}
            <View style={[styles.tile, styles.serverTile, { opacity: selectedId === s.id ? 1 : 0.5 }]}>
              <Avatar uri={s.icon_url} name={s.name} size={TILE} radius={RADIUS} tile />
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: { width: dp(212) },
  cell: { height: dp(159), justifyContent: 'center' },
  indicator: { position: 'absolute', left: -dp(3), top: (dp(159) - dp(54)) / 2 },
  tile: { marginLeft: dp(37), width: TILE, height: TILE, borderRadius: RADIUS, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  // 'Unread count' on the home frame: 60 x 59px at (121, 240), i.e. 84px / 84.6px into the 140px DM tile.
  badge: { position: 'absolute', left: dp(121), top: dp(9.5 + 84.6), minWidth: dp(60), height: dp(59), borderRadius: dp(56), paddingHorizontal: dp(14), backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: colors.text, fontFamily: fonts.manropeBold, fontSize: dp(34), lineHeight: dp(46) },
  serverTile: { backgroundColor: colors.surface, borderWidth: dp(1.2833), borderColor: colors.surfaceStroke },
});
