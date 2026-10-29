import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '../icons/Icon';
import { colors, dp, fonts } from '../theme';

interface Props {
  /** Tapping "You" (the only tab with behaviour in the PoC) opens the account/sign-out prompt. */
  onProfilePress?: () => void;
}

// Floating tab bar from 'Liquid Glass navigation': 156px pill, 132px tabs, Home active.
// Notifications and You are visual-only except for the sign-out prompt wired by the parent.
export function BottomNav({ onProfilePress }: Props) {
  return (
    <View style={styles.pill}>
      <View style={[styles.tab, styles.tabActive]}>
        <Icon name="chat" height={dp(73.5)} color={colors.text} />
      </View>
      <View style={styles.tab}>
        <View style={styles.iconBox}>
          <Icon name="bell" height={dp(59)} color={colors.text} />
        </View>
        <Text style={styles.label}>Notifications</Text>
      </View>
      <Pressable style={styles.tab} onPress={onProfilePress}>
        <View style={styles.iconBox}>
          <Icon name="profile" height={dp(56)} color={colors.text} />
        </View>
        <Text style={styles.label}>You</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', height: dp(156), borderRadius: dp(78), backgroundColor: colors.surface, padding: dp(12), gap: dp(8) },
  tab: { flex: 1, height: dp(132), borderRadius: dp(66), alignItems: 'center' },
  tabActive: { backgroundColor: colors.surfaceActive, justifyContent: 'center' },
  iconBox: { height: dp(59), marginTop: dp(17), alignItems: 'center', justifyContent: 'center' },
  label: { marginTop: dp(8), color: colors.tabLabel, fontFamily: fonts.satoshiMedium, fontSize: dp(25.67), lineHeight: dp(35) },
});
