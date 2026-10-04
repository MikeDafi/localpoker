import React, { useCallback, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  Image,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  useWindowDimensions,
  View,
} from 'react-native';
import { showAlert } from '../components/alertBus';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { CardBack } from '../components/CardBack';
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
import { gifThumbUrl } from '../services/gifs';
import { EMOJI_EMOTES, GIF_EMOTES } from '../game/cosmetics';
import { StorePreview } from '../components/storePreview';
import { purchaseHistory, totalCoinsSpent, type PurchaseRecord } from '../game/purchaseHistory';
import {
  COSMETIC_CATEGORIES,
  type CosmeticCategory,
  type CosmeticCategoryId,
  type CosmeticItem,
} from '../game/storeCatalog';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Store'>;

type CardWidth = '100%' | '48%';
type ButtonVariant = 'blue' | 'green' | 'gold' | 'white' | 'red';

function formatCoins(amount: number): string {
  return amount.toLocaleString();
}

function isUnlockOnly(item: CosmeticItem): boolean {
  return item.category === 'gifs' || item.category === 'emotes' || item.category === 'palMotions';
}

export function StoreScreen({ navigation }: Props) {
  /*
   * Owned and equipped live in AppContext, not here.
   *
   * A bought felt has to reach the felt, and a screen that is not mounted
   * cannot tell the table what is equipped. The Store is now just the thing
   * that edits it.
   */
  const { profile, addCoins, cosmetics, setCosmetics, ready } = useApp();
  const { width } = useWindowDimensions();
  const [activeCategory, setActiveCategory] = useState<CosmeticCategoryId>(COSMETIC_CATEGORIES[0].id);
  const [previewing, setPreviewing] = useState<CosmeticItem | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const history = useMemo(() => purchaseHistory(cosmetics), [cosmetics]);
  const spent = useMemo(() => totalCoinsSpent(cosmetics), [cosmetics]);

  const isWide = width >= 680;
  const cardWidth: CardWidth = isWide ? '48%' : '100%';
  const ownedCosmetics = useMemo(() => new Set(cosmetics.ownedCosmeticIds), [cosmetics.ownedCosmeticIds]);
  const activeCategoryData = useMemo(
    () => COSMETIC_CATEGORIES.find((category) => category.id === activeCategory) ?? COSMETIC_CATEGORIES[0],
    [activeCategory],
  );

  const equipCosmetic = useCallback((item: CosmeticItem) => {
    if (isUnlockOnly(item)) return;
    setCosmetics((current) => {
      if (!current.ownedCosmeticIds.includes(item.id)) return current;
      if (current.equippedByCategory[item.category] === item.id) return current;

      return {
        ...current,
        equippedByCategory: { ...current.equippedByCategory, [item.category]: item.id },
      };
    });
  }, [setCosmetics]);

  const buyCosmetic = useCallback(
    (item: CosmeticItem) => {
      if (ownedCosmetics.has(item.id)) {
        if (!isUnlockOnly(item)) equipCosmetic(item);
        return;
      }

      if (profile.coins < item.price) {
        sound.play('error');
        showAlert('Not enough coins', 'Play more hands to earn coins!');
        return;
      }

      setCosmetics((current) => ({
        ...current,
        ownedCosmeticIds: Array.from(new Set([...current.ownedCosmeticIds, item.id])),
        equippedByCategory: isUnlockOnly(item)
          ? current.equippedByCategory
          : { ...current.equippedByCategory, [item.category]: item.id },
        // The price as it was at the moment of sale, not as the catalog may
        // later read it.
        purchases: [...(current.purchases ?? []), { id: item.id, price: item.price, at: Date.now() }],
      }));
      addCoins(-item.price);
      sound.play('coins');
      showAlert(
        'Unlocked',
        isUnlockOnly(item) ? `${item.name} is in your emote tray.` : `${item.name} is equipped.`,
      );
    },
    [addCoins, equipCosmetic, ownedCosmetics, profile.coins, setCosmetics],
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
          <BalanceBanner coins={profile.coins} hydrated={ready} onHistory={() => setHistoryOpen(true)} />
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
            const equipped = !isUnlockOnly(item) && cosmetics.equippedByCategory[item.category] === item.id;

            return (
              <CosmeticCard
                key={item.id}
                item={item}
                index={index}
                width={cardWidth}
                owned={owned}
                equipped={equipped}
                onPress={() => buyCosmetic(item)}
                onPreview={() => setPreviewing(item)}
              />
            );
          })}
        </View>

        <AdBanner />
      </ScrollView>

      <PurchaseHistorySheet
        visible={historyOpen}
        onClose={() => setHistoryOpen(false)}
        records={history}
        spent={spent}
      />

      <PreviewSheet
        item={previewing}
        owned={previewing ? ownedCosmetics.has(previewing.id) : false}
        coins={profile.coins}
        onClose={() => setPreviewing(null)}
        onBuy={(item) => {
          setPreviewing(null);
          buyCosmetic(item);
        }}
      />
    </ScreenBackground>
  );
}

function BalanceBanner({ coins, hydrated, onHistory }: { coins: number; hydrated: boolean; onHistory: () => void }) {
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
            {/* The coin icon says what the number is, so the label does not
                need to. Only the one line that tells you where coins come
                from earns its space. */}
            <Text style={styles.balanceValue}>{hydrated ? formatCoins(coins) : '...'}</Text>
            <Text style={styles.balanceHint}>Earned by playing hands.</Text>
          </View>
        </View>
        <WiiButton label="History" size="sm" variant="white" onPress={onHistory} />
      </LinearGradient>
    </WiiPanel>
  );
}

/** What you have bought, when, and for how much. */
function PurchaseHistorySheet({
  visible,
  onClose,
  records,
  spent,
}: {
  visible: boolean;
  onClose: () => void;
  records: PurchaseRecord[];
  spent: number;
}) {
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} accessibilityLabel="Close history">
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.sheetTitle}>Purchase history</Text>
          <Text style={styles.sheetDescription}>
            {records.length === 0
              ? 'Nothing bought yet.'
              : `${records.length} item${records.length === 1 ? '' : 's'} \u00b7 ${formatCoins(spent)} coins spent`}
          </Text>
          <ScrollView style={styles.historyList} contentContainerStyle={styles.historyContent}>
            {records.map((record) => (
              <View key={`${record.id}-${record.at ?? 'na'}`} style={styles.historyRow}>
                <View style={styles.historyCopy}>
                  <Text style={styles.historyName} numberOfLines={1}>{record.name}</Text>
                  <Text style={styles.historyMeta}>
                    {/* Said plainly rather than guessed at. These were bought
                        before purchases were recorded, or granted, and
                        inventing a date would make the receipt a fiction. */}
                    {record.unrecorded
                      ? 'Owned, before receipts were kept'
                      : record.at
                        ? new Date(record.at).toLocaleDateString()
                        : 'Date not recorded'}
                  </Text>
                </View>
                {record.price === undefined
                  ? <Text style={styles.historyMeta}>{'\u2014'}</Text>
                  : <CoinAmount amount={record.price} iconSize={15} />}
              </View>
            ))}
          </ScrollView>
          <View style={styles.sheetActions}>
            <WiiButton label="Close" size="md" variant="white" onPress={onClose} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
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
      {/* The tab above already says which category this is, so repeating the
          label here was a heading for a heading. */}
      <Text style={styles.categoryDescription}>{category.description}</Text>
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
  onPreview,
}: {
  item: CosmeticItem;
  index: number;
  width: CardWidth;
  owned: boolean;
  equipped: boolean;
  onPress: () => void;
  onPreview: () => void;
}) {
  const unlockOnly = isUnlockOnly(item);
  const buttonLabel = owned ? (unlockOnly ? 'Owned' : equipped ? 'Equipped' : 'Equip') : 'Buy';
  const buttonVariant: ButtonVariant = owned && (unlockOnly || equipped) ? 'green' : owned ? 'white' : 'gold';

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
            <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
            {equipped ? (
              <Badge label="Equipped" tone="green" />
            ) : owned ? (
              <Badge label="Owned" tone="blue" />
            ) : item.badge ? (
              <Badge label={item.badge} tone="pink" />
            ) : null}
          </View>

          {/* The thumbnail is the preview's own button: tapping the picture to
              see it bigger is what everyone tries first, and the labelled
              button beside Buy is there for anyone who does not. */}
          <Pressable onPress={onPreview} accessibilityRole="button" accessibilityLabel={`Preview ${item.name}`}>
            <CosmeticPreview item={item} />
          </Pressable>
          <Text style={styles.cardDescription} numberOfLines={2}>{item.description}</Text>

          <View style={styles.purchaseRow}>
            {owned ? <View style={styles.statusColumn} /> : (
              <View style={styles.statusColumn}>
                <CoinAmount amount={item.price} iconSize={18} textStyle={styles.cosmeticPrice} />
              </View>
            )}
            <View style={styles.cardButtons}>
              <WiiButton label="Preview" size="sm" variant="white" onPress={onPreview} />
              <WiiButton
                label={buttonLabel}
                size="sm"
                variant={buttonVariant}
                disabled={equipped || (unlockOnly && owned)}
                onPress={onPress}
                icon={!owned ? <CoinIcon size={16} color={colors.goldDeep} /> : undefined}
              />
            </View>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

/**
 * The item at the size it is actually seen at during a hand.
 *
 * A 62pt swatch cannot answer "what am I buying", which is why the card backs
 * were once sold as gradients that looked nothing like the card that got
 * dealt. Each category draws its own, see `src/components/storePreview`.
 */
function PreviewSheet({
  item,
  owned,
  coins,
  onClose,
  onBuy,
}: {
  item: CosmeticItem | null;
  owned: boolean;
  coins: number;
  onClose: () => void;
  onBuy: (item: CosmeticItem) => void;
}) {
  const { width } = useWindowDimensions();
  if (!item) return null;
  const stageWidth = Math.min(width - spacing.lg * 2, 460) - spacing.lg * 2;
  const affordable = coins >= item.price;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} accessibilityLabel="Close preview">
        {/* Swallows taps on the sheet itself so only the backdrop closes it. */}
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.sheetTitle} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.sheetDescription}>{item.description}</Text>
          <View style={styles.sheetStage}>
            <StorePreview item={item} width={stageWidth} />
          </View>
          <View style={styles.sheetActions}>
            <WiiButton label="Close" size="md" variant="white" onPress={onClose} />
            {owned ? (
              <Badge label="Owned" tone="green" />
            ) : (
              <WiiButton
                label={affordable ? 'Buy' : 'Not enough coins'}
                size="md"
                variant="gold"
                disabled={!affordable}
                onPress={() => onBuy(item)}
                icon={affordable ? <CoinIcon size={16} color={colors.goldDeep} /> : undefined}
              />
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
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
    /*
     * The real card, not an impression of one. This used to be a gradient with
     * two plain views standing in for the pattern, so the thing on sale and
     * the thing dealt at the table were different pictures.
     */
    return (
      <View style={styles.previewFrame}>
        <LinearGradient colors={item.swatches} style={styles.cardBackStage}>
          <CardBack size={62} variant={item.id} />
        </LinearGradient>
      </View>
    );
  }

  if (item.category === 'gifs') {
    const gif = GIF_EMOTES[item.id];
    return (
      <View style={styles.previewFrame}>
        <LinearGradient colors={item.swatches} style={styles.gifPreview}>
          {gif ? (
            <Image source={{ uri: gifThumbUrl(gif.gifId) }} style={styles.gifPreviewImage} resizeMode="cover" />
          ) : (
            <Text style={styles.previewEmoji}>{item.emoji}</Text>
          )}
        </LinearGradient>
      </View>
    );
  }

  if (item.category === 'emotes') {
    const emoji = EMOJI_EMOTES[item.id];
    return (
      <View style={styles.previewFrame}>
        <LinearGradient colors={item.swatches} style={styles.emotePreview}>
          <View style={styles.emotePreviewBubble}>
            <Text style={styles.emotePreviewEmoji}>{emoji?.emoji ?? item.emoji}</Text>
          </View>
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
  balanceValue: { fontFamily: fonts.bold, fontSize: 34, lineHeight: 39, color: colors.ink },
  balanceHint: { marginTop: 2, fontFamily: fonts.medium, fontSize: 13, color: colors.inkSoft },
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
  categoryDescription: { flex: 1, minWidth: 0, fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, color: colors.inkSoft },
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
  cardTitle: { flex: 1, minWidth: 0, fontFamily: fonts.bold, fontSize: 19, lineHeight: 24, color: colors.ink },
  cardDescription: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, color: colors.inkSoft },
  purchaseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: 'auto',
  },
  cardButtons: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statusColumn: { flex: 1, minWidth: 0 },
  coinAmountRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  coinAmountText: { fontFamily: fonts.bold, fontSize: 16, color: colors.goldDeep },
  cosmeticPrice: { fontSize: 18 },
  previewFrame: {
    height: 112,
    borderRadius: radii.lg,
    backgroundColor: colors.panelAlt,
    borderWidth: 1,
    borderColor: 'rgba(203,217,226,0.72)',
    overflow: 'hidden',
  },
  previewGlow: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cardBackStage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  gifPreview: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.sm },
  gifPreviewImage: { width: 112, height: 82, borderRadius: radii.md, borderWidth: 1, borderColor: 'rgba(255,255,255,0.72)' },
  emotePreview: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emotePreviewBubble: {
    width: 72,
    height: 72,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.76)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.soft,
  },
  emotePreviewEmoji: { fontSize: 40 },
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
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(8,10,18,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    width: '100%',
    maxWidth: 460,
    borderRadius: radii.lg,
    backgroundColor: '#FFFFFF',
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadows.raised,
  },
  sheetTitle: { fontFamily: fonts.bold, fontSize: 21, color: colors.ink },
  sheetDescription: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, color: colors.inkSoft },
  sheetStage: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.sm },
  historyList: { maxHeight: 320 },
  historyContent: { gap: spacing.xs },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(16,24,40,0.1)',
  },
  historyCopy: { flex: 1, minWidth: 0 },
  historyName: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  historyMeta: { fontFamily: fonts.medium, fontSize: 12, color: colors.inkMuted, marginTop: 1 },
  sheetActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  badgeText: { fontFamily: fonts.bold, fontSize: 10, letterSpacing: 0.45 },
});
