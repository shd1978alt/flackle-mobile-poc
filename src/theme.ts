/**
 * Design tokens taken from poc-designs.fig.
 *
 * The Figma frames are 1120px wide and were authored at 2.5665 px per point (font sizes are exact
 * multiples: name 35.93px = 14pt, preview 30.80px = 12pt, time 25.67px = 10pt). `dp()` converts a
 * Figma px value to React Native points so styles can quote the design values directly.
 */
export const FIGMA_SCALE = 2.5665233612;
export const dp = (px: number) => px / FIGMA_SCALE;

export const colors = {
  // surfaces
  screen: '#0a0a0b', // home frame background (gradient #0a0a0b -> #080809, rendered flat)
  pane: '#0d0d0f',
  paneBorder: '#0f0f13',
  convoTop: '#0b0b0c',
  header: '#0f0f13',
  surface: '#191921', // search field, composer, tab bar, server tiles, reaction chip
  surfaceStroke: '#25252e',
  unreadLine: '#31171d', // 'Unread divider' lines
  surfaceActive: '#36363f',
  dmTile: '#2a2a33',
  sheet: '#13131b',
  sheetItem: '#21212a',
  sheetAction: 'rgba(34,34,44,0.38)',
  // text
  text: '#f2f2f5',
  textSecondary: '#ceced6',
  textMuted: '#93939f',
  textFaint: '#6d6d7b',
  tabLabel: '#c7c7d0',
  // accents
  red: '#ff3b3b',
  destructive: '#f67070',
  // presence dots ('presence-online', 'presence-dnd', 'presence-invisible') and their bars
  presenceOnline: '#3eb53f',
  presenceDnd: '#b92529',
  presenceDndBar: '#792124',
  presenceOff: '#808282',
  presenceOffBar: '#565858',
  presenceRing: '#0d0d0e', // ring colour used by the header / drawer 'Online presence' dots
  // avatar placeholder
  avatarBg: '#353638',
  avatarFg: '#b7b8bb',
  grabber: '#d9d9d9',

  // legacy names still used by the sign-in screen and profile card
  rail: '#0a0a0b',
  panel: '#13131b',
  bg: '#0b0b0c',
  raised: '#21212a',
  border: '#25252e',
  muted: '#93939f',
  faint: '#6d6d7b',
  accent: '#ff3b3b',
  danger: '#f67070',
  link: '#5b7cff',
  chip: '#191921',
  chipBorder: '#25252e',
  online: '#3eb53f',
  warn: '#f0b232',
};

/**
 * The design uses Satoshi (names, message text, labels), Manrope (times, badges) and Inter (search field).
 * Satoshi is bundled from assets/fonts (see the licence note there); Manrope and Inter come from
 * @expo-google-fonts. The family names below are the keys registered in App.tsx.
 */
export const fonts = {
  satoshiRegular: 'Satoshi-Regular',
  satoshiMedium: 'Satoshi-Medium',
  satoshiBold: 'Satoshi-Bold',
  satoshiItalic: 'Satoshi-Italic',
  manropeRegular: 'Manrope_400Regular',
  manropeMedium: 'Manrope_500Medium',
  manropeSemiBold: 'Manrope_600SemiBold',
  manropeBold: 'Manrope_700Bold',
  interRegular: 'Inter_400Regular',
};
