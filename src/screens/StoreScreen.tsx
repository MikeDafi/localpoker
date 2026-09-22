import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  useWindowDimensions,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ScreenBackground } from '../components/ScreenBackground';
import { ScreenHeader } from '../components/ScreenHeader';
import { WiiPanel } from '../components/WiiPanel';
import { WiiButton } from '../components/WiiButton';
import { AdBanner } from '../components/AdBanner';
import { CoinIcon } from '../components/Icons';
import { colors, fonts, spacing, radii, shadows } from '../theme/theme';
import { useApp } from '../state/AppContext';
import { sound } from '../services/sound';
import { captureError } from '../services/telemetry';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Store'>;

const CATEGORY_IDS = ['outfits', 'cardBacks', 'tables', 'chips'] as const;

type CosmeticCategoryId = (typeof CATEGORY_IDS)[number];
type CardWidth = '100%' | '48%';
type ButtonVariant = 'blue' | 'green' | 'gold' | 'white' | 'red';

type CosmeticItem = {
  id: string;
  category: CosmeticCategoryId;
  name: string;
  price: number;
  description: string;
  emoji: string;
  swatches: readonly [string, string, string];
  badge?: string;
};

type CosmeticCategory = {
  id: CosmeticCategoryId;
  label: string;
  shortLabel: string;
  emoji: string;
  description: string;
  items: CosmeticItem[];
};

type CosmeticsState = {
  ownedCosmeticIds: string[];
  equippedByCategory: Partial<Record<CosmeticCategoryId, string>>;
};

const COSMETICS_STORAGE_KEY = '@localpoker/cosmetics';

const COSMETIC_CATEGORIES: CosmeticCategory[] = [
  {
    id: 'outfits',
    label: 'Outfits & Accessories',
    shortLabel: 'Outfits',
    emoji: '🐾',
    description: 'Dress up your Pal with table-ready hats, glasses, and signature looks.',
    items: [
      {
        id: 'pal-dealer-shades',
        category: 'outfits',
        name: 'Dealer Shades',
        price: 250,
        description: 'Slick tinted frames for unreadable bluffs.',
        emoji: '😎',
        swatches: ['#111827', colors.blue, colors.gold],
        badge: 'New',
      },
      {
        id: 'pal-lucky-cap',
        category: 'outfits',
        name: 'Lucky Cap',
        price: 450,
        description: 'A bright cap with just enough river magic.',
        emoji: '🧢',
        swatches: ['#2563EB', '#E0F2FE', colors.green],
      },
      {
        id: 'pal-cozy-hoodie',
        category: 'outfits',
        name: 'Cozy Hoodie',
        price: 900,
        description: 'Soft lounge wear for late-night home games.',
        emoji: '🧥',
        swatches: ['#F97316', '#FDE68A', '#7C2D12'],
      },
      {
        id: 'pal-astro-helmet',
        category: 'outfits',
        name: 'Astro Helmet',
        price: 1_600,
        description: 'Tiny visor, comet pins, and zero-gravity confidence.',
        emoji: '🚀',
        swatches: ['#4C1D95', '#7C3AED', '#22D3EE'],
        badge: 'Popular',
      },
      {
        id: 'pal-chef-jacket',
        category: 'outfits',
        name: 'Chef Jacket',
        price: 2_100,
        description: 'For Pals who cook up spicy raises.',
        emoji: '🍳',
        swatches: ['#EF4444', '#FFFFFF', '#111827'],
      },
      {
        id: 'pal-dragon-festival',
        category: 'outfits',
        name: 'Dragon Festival',
        price: 5_000,
        description: 'Lantern glow, dragon masks, and victory fireworks.',
        emoji: '🐉',
        swatches: ['#DC2626', '#F59E0B', '#111827'],
        badge: 'Legend',
      },
    ],
  },
  {
    id: 'cardBacks',
    label: 'Card Backs',
    shortLabel: 'Cards',
    emoji: '🂠',
    description: 'Turn every deal into a flex with premium card art.',
    items: [
      {
        id: 'card-sunrise',
        category: 'cardBacks',
        name: 'Sunrise Felt',
        price: 350,
        description: 'Warm sunrise rays with clean white trim.',
        emoji: '🌅',
        swatches: ['#FB923C', '#FDE68A', '#FFFFFF'],
      },
      {
        id: 'card-nebula',
        category: 'cardBacks',
        name: 'Neon Nebula',
        price: 800,
        description: 'Cosmic gradients with a soft holo glow.',
        emoji: '🌌',
        swatches: [colors.accent, colors.accentPink, colors.accentAlt],
        badge: 'New',
      },
      {
        id: 'card-royal-holo',
        category: 'cardBacks',
        name: 'Royal Holo',
        price: 1_200,
        description: 'Blue glass, gold trim, crown energy.',
        emoji: '👑',
        swatches: [colors.blueDeep, colors.blue, colors.gold],
        badge: 'Shiny',
      },
      {
        id: 'card-lucky-koi',
        category: 'cardBacks',
        name: 'Lucky Koi',
        price: 2_200,
        description: 'Warm koi scales for river magic.',
        emoji: '🐟',
        swatches: ['#FF7A59', '#FFF1D6', colors.accentPink],
      },
      {
        id: 'card-midnight',
        category: 'cardBacks',
        name: 'Midnight Matrix',
        price: 3_600,
        description: 'Deep black pattern with electric edges.',
        emoji: '✦',
        swatches: ['#111827', colors.accent, colors.accentAlt],
        badge: 'Rare',
      },
    ],
  },
  {
    id: 'tables',
    label: 'Table Themes',
    shortLabel: 'Tables',
    emoji: '🎲',
    description: 'Refresh the room with premium felt, rails, and lounge lighting.',
    items: [
      {
        id: 'table-emerald',
        category: 'tables',
        name: 'Emerald Room',
        price: 700,
        description: 'Classic green felt with polished rails.',
        emoji: '💚',
        swatches: [colors.green, '#064E3B', colors.gold],
      },
      {
        id: 'table-miami',
        category: 'tables',
        name: 'Miami Felt',
        price: 950,
        description: 'Bright teal felt with beach-club rails.',
        emoji: '🌴',
        swatches: ['#00D2FF', '#3A7BD5', '#0FD18A'],
        badge: 'Popular',
      },
      {
        id: 'table-velvet',
        category: 'tables',
        name: 'Velvet Royale',
        price: 1_800,
        description: 'Purple velvet and a gilded winner rail.',
        emoji: '💜',
        swatches: ['#5B21B6', '#A855F7', colors.gold],
        badge: 'Luxe',
      },
      {
        id: 'table-sakura',
        category: 'tables',
        name: 'Sakura Lounge',
        price: 2_600,
        description: 'Soft pink petals for chill home games.',
        emoji: '🌸',
        swatches: ['#FF7AB6', '#FFD1E6', '#B85CFF'],
      },
      {
        id: 'table-lunar',
        category: 'tables',
        name: 'Lunar Arena',
        price: 4_800,
        description: 'Moonlit rails and a midnight felt surface.',
        emoji: '🌙',
        swatches: ['#0F172A', '#475569', '#C4B5FD'],
        badge: 'Epic',
      },
    ],
  },
  {
    id: 'chips',
    label: 'Chip Styles',
    shortLabel: 'Chips',
    emoji: '🪙',
    description: 'Upgrade the color and character of every bet.',
    items: [
      {
        id: 'chips-candy',
        category: 'chips',
        name: 'Candy Stack',
        price: 600,
        description: 'Sweet pastel chips for playful pots.',
        emoji: '🍬',
        swatches: [colors.accentPink, colors.accentAlt, colors.gold],
      },
      {
        id: 'chips-obsidian',
        category: 'chips',
        name: 'Obsidian Pro',
        price: 1_400,
        description: 'Matte black chips with gold inlays.',
        emoji: '⚫',
        swatches: ['#111827', '#374151', colors.gold],
      },
      {
        id: 'chips-circuit',
        category: 'chips',
        name: 'Circuit Chips',
        price: 2_400,
        description: 'Arcade-neon edges for fast action.',
        emoji: '⚡',
        swatches: ['#00F5A0', '#00D9F5', '#1A1A40'],
        badge: 'New',
      },
      {
        id: 'chips-diamond',
        category: 'chips',
        name: 'Diamond Edge',
        price: 4_200,
        description: 'Icy whites with sapphire side spots.',
        emoji: '💎',
        swatches: ['#B8E7FF', '#FFFFFF', colors.blue],
        badge: 'Elite',
      },
      {
        id: 'chips-golden-tiki',
        category: 'chips',
        name: 'Golden Tiki',
        price: 5_000,
        description: 'Carved gold chips with island-lounge flair.',
        emoji: '🗿',
        swatches: ['#92400E', colors.gold, '#FDE68A'],
        badge: 'Legend',
      },
    ],
  },
];

const KNOWN_COSMETIC_IDS = new Set(COSMETIC_CATEGORIES.flatMap((category) => category.items.map((item) => item.id)));

function makeDefaultCosmeticsState(): CosmeticsState {
  return { ownedCosmeticIds: [], equippedByCategory: {} };
}

function isCosmeticCategoryId(value: string): value is CosmeticCategoryId {
  return CATEGORY_IDS.includes(value as CosmeticCategoryId);
}

function parseCosmeticsState(raw: string | null): CosmeticsState {
  if (!raw) return makeDefaultCosmeticsState();

  try {
    const parsed = JSON.parse(raw) as Partial<CosmeticsState>;
    const ownedCosmeticIds = Array.isArray(parsed.ownedCosmeticIds)
      ? Array.from(
          new Set(
            parsed.ownedCosmeticIds.filter(
              (id): id is string => typeof id === 'string' && KNOWN_COSMETIC_IDS.has(id),
            ),
          ),
        )
      : [];
    const ownedSet = new Set(ownedCosmeticIds);
    const equippedByCategory: Partial<Record<CosmeticCategoryId, string>> = {};
    const equippedCandidate = parsed.equippedByCategory;

    if (equippedCandidate && typeof equippedCandidate === 'object') {
      Object.entries(equippedCandidate as Record<string, unknown>).forEach(([categoryId, itemId]) => {
        if (isCosmeticCategoryId(categoryId) && typeof itemId === 'string' && ownedSet.has(itemId)) {
          equippedByCategory[categoryId] = itemId;
        }
      });
    }

    return { ownedCosmeticIds, equippedByCategory };
  } catch {
    return makeDefaultCosmeticsState();
  }
}

function formatCoins(amount: number): string {
  return amount.toLocaleString();
}

export function StoreScreen({ navigation }: Props) {
  const { profile, addCoins } = useApp();
  const { width } = useWindowDimensions();
  const [cosmetics, setCosmetics] = useState<CosmeticsState>(() => makeDefaultCosmeticsState());
  const [hydrated, setHydrated] = useState(false);
  const [activeCategory, setActiveCategory] = useState<CosmeticCategoryId>('outfits');

  const isWide = width >= 680;
  const cardWidth: CardWidth = isWide ? '48%' : '100%';
  const ownedCosmetics = useMemo(() => new Set(cosmetics.ownedCosmeticIds), [cosmetics.ownedCosmeticIds]);
  const activeCategoryData = useMemo(
    () => COSMETIC_CATEGORIES.find((category) => category.id === activeCategory) ?? COSMETIC_CATEGORIES[0],
    [activeCategory],
  );

  useEffect(() => {
    let mounted = true;

    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(COSMETICS_STORAGE_KEY);
        if (mounted) setCosmetics(parseCosmeticsState(raw));
      } catch (error) {
        captureError(error, {
          tags: { area: 'async-storage', operation: 'hydrate-cosmetics', key: COSMETICS_STORAGE_KEY },
        });
        if (mounted) setCosmetics(makeDefaultCosmeticsState());
      } finally {
        if (mounted) setHydrated(true);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    void (async () => {
      try {
        await AsyncStorage.setItem(COSMETICS_STORAGE_KEY, JSON.stringify(cosmetics));
      } catch (error) {
        captureError(error, {
          tags: { area: 'async-storage', operation: 'persist-cosmetics', key: COSMETICS_STORAGE_KEY },
        });
      }
    })();
  }, [cosmetics, hydrated]);

  const equipCosmetic = useCallback((item: CosmeticItem) => {
    setCosmetics((current) => {
      if (!current.ownedCosmeticIds.includes(item.id)) return current;
      if (current.equippedByCategory[item.category] === item.id) return current;

      return {
        ...current,
        equippedByCategory: { ...current.equippedByCategory, [item.category]: item.id },
      };
    });
  }, []);

  const buyCosmetic = useCallback(
    (item: CosmeticItem) => {
      if (ownedCosmetics.has(item.id)) {
        equipCosmetic(item);
        return;
      }

      if (profile.coins < item.price) {
        sound.play('error');
        Alert.alert('Not enough coins', 'Not enough coins — play more hands to earn coins!');
        return;
      }

      setCosmetics((current) => ({
        ...current,
        ownedCosmeticIds: Array.from(new Set([...current.ownedCosmeticIds, item.id])),
        equippedByCategory: { ...current.equippedByCategory, [item.category]: item.id },
      }));
      addCoins(-item.price);
      sound.play('coins');
      Alert.alert('Cosmetic unlocked', item.name + ' is now owned and equipped.');
    },
    [addCoins, equipCosmetic, ownedCosmetics, profile.coins],
  );

  return (
    <ScreenBackground variant="menu">
      <ScreenHeader title="Store" onBack={() => navigation.goBack()} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.duration(360)}>
          <BalanceBanner coins={profile.coins} hydrated={hydrated} />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(90).duration(360)}>
          <SectionHeader
            eyebrow="Earned coin boutique"
            title="Spend coins on table flair"
            subtitle="Every cosmetic here is unlocked with coins earned by playing hands."
          />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(150).duration(380)}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabs}
          >
            {COSMETIC_CATEGORIES.map((category) => (
              <CategoryTab
                key={category.id}
                category={category}
                active={category.id === activeCategory}
                onPress={() => setActiveCategory(category.id)}
              />
            ))}
          </ScrollView>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(210).duration(390)}>
          <CategoryIntro category={activeCategoryData} />
        </Animated.View>

        <View style={styles.grid}>
          {activeCategoryData.items.map((item, index) => {
            const owned = ownedCosmetics.has(item.id);
            const equipped = cosmetics.equippedByCategory[item.category] === item.id;

            return (
              <CosmeticCard
                key={item.id}
                item={item}
                index={index}
                width={cardWidth}
                owned={owned}
                equipped={equipped}
                onPress={() => buyCosmetic(item)}
              />
            );
          })}
        </View>

        <Animated.View entering={FadeInDown.delay(260).duration(400)}>
          <WiiPanel padding={0} gloss={false} style={styles.promisePanel}>
            <LinearGradient
              colors={['rgba(255,255,255,0.96)', 'rgba(233,255,244,0.94)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.promiseGradient}
            >
              <View style={styles.promiseIcon}>
                <CoinIcon size={30} />
              </View>
              <View style={styles.promiseCopy}>
                <Text style={styles.promiseTitle}>Earn, unlock, equip</Text>
                <Text style={styles.promiseText}>
                  Coins come from play. Build your collection, then switch styles any time from the owned items.
                </Text>
              </View>
            </LinearGradient>
          </WiiPanel>
        </Animated.View>

        <AdBanner />
      </ScrollView>
    </ScreenBackground>
  );
}

function BalanceBanner({ coins, hydrated }: { coins: number; hydrated: boolean }) {
  return (
    <WiiPanel padding={0} gloss={false}>
      <LinearGradient
        colors={['rgba(255,255,255,0.98)', 'rgba(232,247,255,0.98)', 'rgba(255,255,255,0.92)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.balanceGradient}
      >
        <View style={styles.balanceLeft}>
          <View style={styles.balanceIconWrap}>
            <CoinIcon size={38} />
          </View>
          <View style={styles.balanceCopy}>
            <Text style={styles.balanceLabel}>Your coin balance</Text>
            <Text style={styles.balanceValue}>{formatCoins(coins)}</Text>
            <Text style={styles.balanceHint}>Earn coins by playing hands.</Text>
          </View>
        </View>
        <View style={styles.balanceMeta}>
          <Badge label="Earned" tone="green" />
          <Text style={styles.balanceMetaText}>{hydrated ? 'Closet saved' : 'Loading closet'}</Text>
        </View>
      </LinearGradient>
    </WiiPanel>
  );
}

function SectionHeader({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionEyebrow}>{eyebrow}</Text>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionSubtitle}>{subtitle}</Text>
    </View>
  );
}

function CategoryIntro({ category }: { category: CosmeticCategory }) {
  return (
    <LinearGradient
      colors={['rgba(255,255,255,0.88)', 'rgba(247,251,255,0.72)']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.categoryIntro}
    >
      <View style={styles.categoryIcon}>
        <Text style={styles.categoryEmoji}>{category.emoji}</Text>
      </View>
      <View style={styles.categoryCopy}>
        <Text style={styles.categoryTitle}>{category.label}</Text>
        <Text style={styles.categoryDescription}>{category.description}</Text>
      </View>
    </LinearGradient>
  );
}

function CategoryTab({
  category,
  active,
  onPress,
}: {
  category: CosmeticCategory;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.tab, active ? styles.tabActive : styles.tabIdle]}>
      {active ? (
        <LinearGradient
          colors={[colors.blue, colors.accentAlt]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.absoluteFill}
        />
      ) : null}
      <Text style={[styles.tabText, active && styles.tabTextActive]}>
        {category.emoji} {category.shortLabel}
      </Text>
    </Pressable>
  );
}

function CosmeticCard({
  item,
  index,
  width,
  owned,
  equipped,
  onPress,
}: {
  item: CosmeticItem;
  index: number;
  width: CardWidth;
  owned: boolean;
  equipped: boolean;
  onPress: () => void;
}) {
  const buttonLabel = equipped ? 'Equipped' : owned ? 'Equip' : 'Buy';
  const buttonVariant: ButtonVariant = equipped ? 'green' : owned ? 'white' : 'gold';

  return (
    <Animated.View entering={FadeInDown.delay(120 + index * 64).duration(410)} style={{ width }}>
      <View style={[styles.storeCard, owned && styles.ownedCard]}>
        <LinearGradient
          colors={
            owned
              ? ['rgba(239,255,247,0.96)', 'rgba(255,255,255,0.96)']
              : ['rgba(255,255,255,0.97)', 'rgba(245,249,253,0.92)']
          }
          style={styles.absoluteFill}
        />
        <View style={[styles.accentOrb, { backgroundColor: item.swatches[0] }]} />
        <View style={styles.cardBody}>
          <View style={styles.cardTopRow}>
            <View style={styles.cosmeticTitleWrap}>
              <Text style={styles.cardEyebrow}>{item.category === 'outfits' ? 'Pal style' : 'Cosmetic'}</Text>
              <Text style={styles.cardTitle}>{item.name}</Text>
            </View>
            {equipped ? (
              <Badge label="Equipped" tone="green" />
            ) : owned ? (
              <Badge label="Owned" tone="blue" />
            ) : item.badge ? (
              <Badge label={item.badge} tone="pink" />
            ) : null}
          </View>

          <CosmeticPreview item={item} />
          <Text style={styles.cardDescription}>{item.description}</Text>

          <View style={styles.purchaseRow}>
            <View style={styles.statusColumn}>
              {owned ? (
                <>
                  <Text style={styles.ownedText}>Owned</Text>
                  <Text style={styles.ownedHint}>{equipped ? 'Ready at table' : 'Tap equip to use'}</Text>
                </>
              ) : (
                <>
                  <Text style={styles.priceLabel}>Coin price</Text>
                  <CoinAmount amount={item.price} iconSize={18} textStyle={styles.cosmeticPrice} />
                </>
              )}
            </View>
            <WiiButton
              label={buttonLabel}
              size="sm"
              variant={buttonVariant}
              disabled={equipped}
              onPress={onPress}
              icon={!owned ? <CoinIcon size={16} color={colors.goldDeep} /> : undefined}
            />
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

function CosmeticPreview({ item }: { item: CosmeticItem }) {
  if (item.category === 'chips') {
    return (
      <View style={styles.previewFrame}>
        <LinearGradient colors={item.swatches} style={styles.previewGlow}>
          <View style={styles.chipPreviewRow}>
            {item.swatches.map((swatch, index) => (
              <View
                key={item.id + '-chip-' + swatch}
                style={[styles.previewChip, { backgroundColor: swatch, marginLeft: index === 0 ? 0 : -12 }]}
              >
                <View style={styles.previewChipInner} />
              </View>
            ))}
          </View>
          <Text style={styles.previewEmojiSmall}>{item.emoji}</Text>
        </LinearGradient>
      </View>
    );
  }

  if (item.category === 'tables') {
    return (
      <View style={styles.previewFrame}>
        <LinearGradient colors={item.swatches} style={styles.tablePreview}>
          <View style={styles.tableRail}>
            <Text style={styles.previewEmoji}>{item.emoji}</Text>
          </View>
        </LinearGradient>
      </View>
    );
  }

  if (item.category === 'cardBacks') {
    return (
      <View style={styles.previewFrame}>
        <LinearGradient colors={item.swatches} style={styles.cardBackPreview}>
          <View style={styles.cardBackPattern} />
          <Text style={styles.previewEmoji}>{item.emoji}</Text>
          <View style={[styles.cardBackPattern, styles.cardBackPatternBottom]} />
        </LinearGradient>
      </View>
    );
  }

  return (
    <View style={styles.previewFrame}>
      <LinearGradient colors={item.swatches} style={styles.palPreview}>
        <View style={styles.palBubble}>
          <Text style={styles.previewEmoji}>{item.emoji}</Text>
        </View>
        <View style={styles.swatchRow}>
          {item.swatches.map((swatch) => (
            <View key={item.id + '-swatch-' + swatch} style={[styles.swatchDot, { backgroundColor: swatch }]} />
          ))}
        </View>
      </LinearGradient>
    </View>
  );
}

function CoinAmount({
  amount,
  iconSize = 18,
  textStyle,
}: {
  amount: number;
  iconSize?: number;
  textStyle?: StyleProp<TextStyle>;
}) {
  return (
    <View style={styles.coinAmountRow}>
      <CoinIcon size={iconSize} />
      <Text style={[styles.coinAmountText, textStyle]}>{formatCoins(amount)}</Text>
    </View>
  );
}

type BadgeTone = 'blue' | 'green' | 'gold' | 'pink';

const BADGE_COLORS: Record<BadgeTone, { bg: string; border: string; text: string }> = {
  blue: { bg: 'rgba(34,171,228,0.13)', border: 'rgba(34,171,228,0.32)', text: colors.blueDeep },
  green: { bg: 'rgba(63,181,107,0.14)', border: 'rgba(63,181,107,0.32)', text: colors.green },
  gold: { bg: 'rgba(245,197,24,0.2)', border: 'rgba(217,164,0,0.35)', text: '#8A6800' },
  pink: { bg: 'rgba(255,95,162,0.14)', border: 'rgba(255,95,162,0.35)', text: '#B72E68' },
};

function Badge({ label, tone = 'blue' }: { label: string; tone?: BadgeTone }) {
  const badgeColors = BADGE_COLORS[tone];

  return (
    <View style={[styles.badge, { backgroundColor: badgeColors.bg, borderColor: badgeColors.border }]}>
      <Text style={[styles.badgeText, { color: badgeColors.text }]}>{label.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  absoluteFill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  balanceGradient: {
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  balanceLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 },
  balanceIconWrap: {
    width: 58,
    height: 58,
    borderRadius: radii.pill,
    backgroundColor: '#FFF7CF',
    borderWidth: 1,
    borderColor: 'rgba(217,164,0,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    ...shadows.soft,
  },
  balanceCopy: { flex: 1, minWidth: 0 },
  balanceLabel: { fontFamily: fonts.medium, fontSize: 13, color: colors.inkMuted },
  balanceValue: { fontFamily: fonts.bold, fontSize: 34, lineHeight: 39, color: colors.ink },
  balanceHint: { marginTop: 2, fontFamily: fonts.medium, fontSize: 13, color: colors.inkSoft },
  balanceMeta: { alignItems: 'flex-end', gap: spacing.xs },
  balanceMetaText: { fontFamily: fonts.medium, fontSize: 11, color: colors.inkMuted },
  sectionHeader: { gap: spacing.xs, marginTop: spacing.xs },
  sectionEyebrow: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.accentPink,
  },
  sectionTitle: { fontFamily: fonts.bold, fontSize: 25, color: colors.ink },
  sectionSubtitle: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 19, color: colors.inkSoft },
  tabs: { gap: spacing.sm, paddingRight: spacing.lg },
  tab: {
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    borderWidth: 1,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  tabIdle: { backgroundColor: colors.panel, borderColor: colors.border },
  tabActive: { borderColor: 'rgba(255,255,255,0.78)', ...shadows.soft },
  tabText: { fontFamily: fonts.bold, fontSize: 14, color: colors.inkSoft },
  tabTextActive: { color: '#FFFFFF' },
  categoryIntro: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
    ...shadows.soft,
  },
  categoryIcon: {
    width: 58,
    height: 58,
    borderRadius: radii.lg,
    backgroundColor: 'rgba(255,255,255,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  categoryEmoji: { fontSize: 28 },
  categoryCopy: { flex: 1, minWidth: 0 },
  categoryTitle: { fontFamily: fonts.bold, fontSize: 20, color: colors.ink },
  categoryDescription: { marginTop: spacing.xs, fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, color: colors.inkSoft },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  storeCard: {
    minHeight: 232,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    overflow: 'hidden',
    ...shadows.panel,
  },
  ownedCard: {
    borderColor: 'rgba(63,181,107,0.45)',
    shadowColor: colors.green,
    shadowOpacity: 0.16,
  },
  accentOrb: {
    position: 'absolute',
    right: -40,
    top: -44,
    width: 132,
    height: 132,
    borderRadius: 66,
    opacity: 0.2,
  },
  cardBody: { padding: spacing.lg, gap: spacing.md },
  cardTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  cardEyebrow: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 0.6,
    color: colors.inkMuted,
    textTransform: 'uppercase',
  },
  cardTitle: { fontFamily: fonts.bold, fontSize: 19, lineHeight: 24, color: colors.ink },
  cosmeticTitleWrap: { flex: 1, minWidth: 0 },
  cardDescription: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, color: colors.inkSoft },
  purchaseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: 'auto',
  },
  statusColumn: { flex: 1, minWidth: 0 },
  priceLabel: { fontFamily: fonts.bold, fontSize: 11, color: colors.inkMuted, textTransform: 'uppercase' },
  coinAmountRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  coinAmountText: { fontFamily: fonts.bold, fontSize: 16, color: colors.goldDeep },
  cosmeticPrice: { fontSize: 18 },
  ownedText: { fontFamily: fonts.bold, fontSize: 15, color: colors.green },
  ownedHint: { marginTop: 2, fontFamily: fonts.medium, fontSize: 12, color: colors.inkMuted },
  previewFrame: {
    height: 112,
    borderRadius: radii.lg,
    backgroundColor: colors.panelAlt,
    borderWidth: 1,
    borderColor: 'rgba(203,217,226,0.72)',
    overflow: 'hidden',
  },
  previewGlow: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cardBackPreview: {
    alignSelf: 'center',
    marginTop: spacing.sm,
    width: 78,
    height: 92,
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...shadows.soft,
  },
  cardBackPattern: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.58)',
    borderRadius: radii.pill,
  },
  cardBackPatternBottom: { top: undefined, bottom: 12 },
  tablePreview: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.md },
  tableRail: {
    width: '86%',
    height: 62,
    borderRadius: radii.pill,
    borderWidth: 6,
    borderColor: 'rgba(255,255,255,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  chipPreviewRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  previewChip: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.soft,
  },
  previewChipInner: {
    width: 22,
    height: 22,
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.78)',
  },
  palPreview: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  palBubble: {
    width: 60,
    height: 60,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.66)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.86)',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.soft,
  },
  swatchRow: { flexDirection: 'row', gap: spacing.xs },
  swatchDot: {
    width: 12,
    height: 12,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  previewEmoji: { fontSize: 30 },
  previewEmojiSmall: { fontSize: 20 },
  promisePanel: { borderColor: 'rgba(63,181,107,0.24)' },
  promiseGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  promiseIcon: {
    width: 52,
    height: 52,
    borderRadius: radii.pill,
    backgroundColor: '#FFF7CF',
    borderWidth: 1,
    borderColor: 'rgba(217,164,0,0.26)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  promiseCopy: { flex: 1, minWidth: 0 },
  promiseTitle: { fontFamily: fonts.bold, fontSize: 17, color: colors.ink },
  promiseText: { marginTop: spacing.xs, fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, color: colors.inkSoft },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  badgeText: { fontFamily: fonts.bold, fontSize: 10, letterSpacing: 0.45 },
});
