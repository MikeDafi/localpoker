/**
 * Design tokens, modern matte poker table (2026).
 *
 * Visual language: a dark, matte felt with a desaturated green cast; a single
 * top-light source with flat, restrained elevation (no glossy rims); one brand
 * blue plus semantic red/green used sparingly; sentence-case labels with
 * tabular numerals; and fast, small, eased motion.
 *
 * Menu surfaces stay light; anything sitting on the felt uses the `surface*` /
 * `onDark*` tokens below.
 */

export const colors = {
  // Backgrounds, cool near-white menus
  bg: '#E9F1F6',
  bgGradientTop: '#F4FAFD',
  bgGradientBottom: '#D7E6EF',

  // Surfaces
  panel: '#FFFFFF',
  panelAlt: '#F3F8FB',
  glossTop: 'rgba(255,255,255,0.9)',
  glossBottom: 'rgba(255,255,255,0.0)',

  // Brand blue (the single accent). Saturated enough to read as a colour on a
  // near-white menu: the earlier desaturated set went grey against `bg`.
  blueLight: '#7BD1F7',
  blue: '#159FE3',
  blueMid: '#0B86C6',
  blueDeep: '#0A6B9E',
  blueInk: '#0A4C70',

  // Borders / hairlines
  border: '#CBD9E2',
  borderStrong: '#A9BFCD',

  // Text
  ink: '#2B3A45',
  inkSoft: '#53656F',
  inkMuted: '#8598A3',
  onBlue: '#FFFFFF',

  // Felt (poker table), matte near-black with a desaturated green cast.
  // Depth hierarchy, darkest to lightest: room -> rail -> felt surface.
  feltRoom: '#070A09',
  feltRoomTop: '#0B100E',
  // The casino floor the table stands on. A flat black backdrop read as empty,
  // so the room gets a real (dark, desaturated burgundy) carpet colour that the
  // overhead spots can fall across without competing with the green felt.
  floorTop: '#241A22',
  floor: '#160F16',
  floorDeep: '#0A070A',
  felt: '#1F2D28',
  feltLight: '#283833',
  feltDeep: '#18231F',
  /** Darker than the felt so the table edge actually reads as a ring. */
  feltRail: '#0D1211',
  /** Top-lit edge of the rail (single light source). */
  feltRailEdge: '#2C3833',
  /** Inner shadow where the felt meets the rail. */
  feltInnerShadow: 'rgba(0,0,0,0.50)',

  // On-felt surfaces, dark, flat, hairline-bordered
  surface: '#1C2622',
  surfaceAlt: '#25302B',
  surfaceBorder: 'rgba(255,255,255,0.10)',
  surfaceBorderStrong: 'rgba(255,255,255,0.20)',
  onDark: '#EDF2F0',
  onDarkSoft: 'rgba(237,242,240,0.78)',
  /** 0.56 is the lowest alpha that still clears WCAG AA (4.5:1) on `surface`. */
  onDarkMuted: 'rgba(237,242,240,0.58)',

  // Accents / semantics. Saturated so an icon badge reads as its own colour at
  // a glance; red and green still carry the only meaning.
  gold: '#F0B42A',
  goldDeep: '#A8790C',
  red: '#EE5140',
  redDeep: '#C3392A',
  green: '#2EB877',
  amber: '#F2A519',
  /** Quick Play used the near-black felt, which read as a dead tile. */
  teal: '#13B3A6',
  /** Stats used `blueDeep`, which is a text colour and read as navy sludge. */
  indigo: '#4C6FEF',

  // Chips
  chipWhite: '#F7FAFC',
  chipRed: '#C9564A',
  chipBlue: '#3D7FBF',
  chipGreen: '#3D9463',
  chipBlack: '#232C33',
  chipPurple: '#7361B8',
  chipGold: '#C9A450',

  // Card faces
  cardFace: '#FFFFFF',
  cardRed: '#C8362C',
  cardBlack: '#1E2830',
  cardBack: '#22384A',
  cardBackEdge: '#31536B',
  cardBackDeep: '#16252F',

  shadow: '#05090B',

  // Secondary accents. Saturated to match the brand blue rather than sitting
  // grey beside it.
  accent: '#7C5CF2',
  accentAlt: '#22B6EE',
  accentPink: '#ED5B92',
  glass: 'rgba(255,255,255,0.6)',
  glassBorder: 'rgba(255,255,255,0.75)',
  scrim: 'rgba(5,9,11,0.62)',
  success: '#2EB877',
  online: '#25C48F',
  offline: '#8A9AA3',
} as const;

/** 4pt spacing grid. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radii = {
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
  tile: 22,
} as const;

/**
 * Elevation: one light source directly above, so every shadow is a small
 * straight-down offset. Deliberately flat: depth comes from hairline borders
 * and surface contrast, not from soft glows.
 */
export const shadows = {
  soft: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  panel: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 6,
  },
  raised: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 20,
    elevation: 10,
  },
  blueGlow: {
    shadowColor: colors.blueDeep,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 4,
  },
} as const;

export const fonts = {
  regular: 'Fredoka_400Regular',
  medium: 'Fredoka_500Medium',
  semibold: 'Fredoka_600SemiBold',
  bold: 'Fredoka_700Bold',
} as const;

/**
 * Lining, fixed-width figures. Chip counts and pot sizes animate constantly,
 * tabular numerals stop them jittering as digits change.
 */
export const numeric = { fontVariant: ['tabular-nums' as const] };

export const type = {
  display: { fontFamily: fonts.bold, fontSize: 40, lineHeight: 46 },
  title: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 34 },
  heading: { fontFamily: fonts.semibold, fontSize: 22, lineHeight: 28 },
  subheading: { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 24 },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.medium, fontSize: 16, lineHeight: 22 },
  caption: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 17 },
  tiny: { fontFamily: fonts.medium, fontSize: 11, lineHeight: 14 },
  /** Sentence-case section label, replaces the old ALL-CAPS tracked labels. */
  label: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16 },
  num: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 20, ...numeric },
} as const;

/** Springs are reserved for genuinely physical motion (kept minimal). */
export const springs = {
  bouncy: { damping: 20, stiffness: 180, mass: 1 },
  snappy: { damping: 24, stiffness: 240, mass: 0.9 },
  gentle: { damping: 26, stiffness: 140, mass: 1 },
  soft: { damping: 28, stiffness: 110, mass: 1.1 },
} as const;

/**
 * Motion: fast, small, eased. Short travel + ease-out reads as premium;
 * long springy bounces read as toy-like.
 */
export const motion = {
  instant: 110,
  fast: 160,
  base: 220,
  slow: 300,
  stagger: 40,
  dealCard: 340,
  chipFly: 320,
  botThinkMs: 1150,
  showdownRevealMs: 900,
} as const;

/**
 * Easing control points (cubic-bezier). Exported as tuples so this module stays
 * dependency-free; build them with `Easing.bezier(...easings.out)`.
 */
export const easings = {
  /** ease-out-quart, the default for anything entering or settling. */
  out: [0.25, 1, 0.5, 1] as const,
  /** ease-in-quad, for things leaving the screen. */
  in: [0.5, 0, 0.75, 0] as const,
  /** ease-in-out-quart, for reversible state changes. */
  inOut: [0.76, 0, 0.24, 1] as const,
};

export const theme = { colors, spacing, radii, shadows, fonts, type, springs, motion, easings, numeric };
export type Theme = typeof theme;
