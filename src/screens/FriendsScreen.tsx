import React, { useMemo, useState } from 'react';
import { Alert, Keyboard, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Animated, { FadeInDown, Easing } from 'react-native-reanimated';
import { ScreenBackground } from '../components/ScreenBackground';
import { ScreenHeader } from '../components/ScreenHeader';
import { WiiPanel } from '../components/WiiPanel';
import { WiiButton } from '../components/WiiButton';
import { AdBanner, ADS_ENABLED } from '../components/AdBanner';
import { AnimatedPal } from '../components/AnimatedPal';
import { FriendsIcon, ProfileIcon } from '../components/Icons';
import { palFromSeed } from '../avatar/palConfig';
import { colors, fonts, radii, shadows, spacing, easings } from '../theme/theme';
import { sound } from '../services/sound';
import { useApp } from '../state/AppContext';
import type { Friend } from '../state/AppContext';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Friends'>;

export function FriendsScreen({ navigation }: Props) {
  const {
    auth,
    friends,
    addFriend,
    acceptFriendRequest,
    declineFriendRequest,
    removeFriend,
    reportUser,
    blockUser,
  } = useApp();
  const [friendText, setFriendText] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [addingFriend, setAddingFriend] = useState(false);

  const { onlineFriends, offlineFriends } = useMemo(() => {
    const online = friends.filter((friend) => friend.online && friend.friendshipStatus === 'accepted');
    const offline = friends.filter((friend) => !friend.online || friend.friendshipStatus !== 'accepted');
    return { onlineFriends: online, offlineFriends: offline };
  }, [friends]);

  const friendCount = friends.length;
  const onlineCount = onlineFriends.length;

  const handleChangeFriendText = (text: string) => {
    setFriendText(text);
    if (inputError && text.trim()) setInputError(null);
  };

  const handleAddFriend = async () => {
    const trimmed = friendText.trim();
    if (!trimmed) {
      setInputError("Enter your friend's handle.");
      return;
    }
    setAddingFriend(true);
    const res = await addFriend(trimmed);
    setAddingFriend(false);
    if (!res.ok) {
      setInputError(res.reason || 'Could not add that friend.');
      sound.play('error');
      return;
    }
    sound.play('select');
    setFriendText('');
    setInputError(null);
    Keyboard.dismiss();
  };

  const inviteFriend = () => {
    navigation.navigate('CreateJoin');
  };

  const confirmRemoveFriend = (friend: Friend) => {
    Alert.alert('Remove friend?', `Remove ${friend.name} from your friends list?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => removeFriend(friend.id),
      },
    ]);
  };

  const handleReportFriend = async (friend: Friend) => {
    const res = await reportUser(friend.uid ?? friend.id, friend.name, 'friends');
    Alert.alert(res.ok ? 'Report sent' : 'Could not report', res.reason || 'Thanks. We will review this player.');
  };

  const confirmBlockFriend = (friend: Friend) => {
    Alert.alert('Block player?', `${friend.name} will not be able to send you friend requests. Their name and reactions will be hidden from you.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: async () => {
          const res = await blockUser(friend.uid ?? friend.id, friend.name, friend.handle);
          Alert.alert(res.ok ? 'Player blocked' : 'Could not block', res.reason || `${friend.name} was blocked.`);
        },
      },
    ]);
  };

  const openSafetyMenu = (friend: Friend) => {
    Alert.alert(friend.name, 'Choose a safety action.', [
      { text: 'Report offensive content', onPress: () => handleReportFriend(friend) },
      { text: 'Block player', style: 'destructive', onPress: () => confirmBlockFriend(friend) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleAcceptFriend = async (friend: Friend) => {
    const res = await acceptFriendRequest(friend.uid ?? friend.id);
    if (!res.ok) {
      Alert.alert('Could not accept', res.reason || 'Try again in a moment.');
      sound.play('error');
      return;
    }
    sound.play('select');
  };

  const handleDeclineFriend = async (friend: Friend) => {
    const res = await declineFriendRequest(friend.uid ?? friend.id);
    if (!res.ok) {
      Alert.alert('Could not decline', res.reason || 'Try again in a moment.');
      sound.play('error');
      return;
    }
    sound.play('select');
  };

  return (
    <ScreenBackground variant="menu">
      <ScreenHeader title="Friends" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Animated.View entering={FadeInDown.duration(340).easing(Easing.bezier(...easings.out))}>
          <WiiPanel padding={20}>
            <View style={styles.panelTitleRow}>
              <View style={[styles.iconBubble, styles.addIconBubble]}>
                <ProfileIcon size={22} color="#FFFFFF" />
              </View>
              <View style={styles.titleCopy}>
                <Text style={styles.panelTitle}>Add friend</Text>
                <Text style={styles.panelSubtitle}>
                  {auth.handle ? `Your handle is @${auth.handle}. Add friends by exact handle.` : 'Add friends by exact handle.'}
                </Text>
              </View>
            </View>

            <View style={styles.addRow}>
              <TextInput
                value={friendText}
                onChangeText={handleChangeFriendText}
                onSubmitEditing={handleAddFriend}
                placeholder="friend_handle"
                placeholderTextColor={colors.inkMuted}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={24}
                returnKeyType="done"
                style={[styles.input, inputError ? styles.inputError : null]}
              />
              <WiiButton label={addingFriend ? 'Sending…' : 'Add'} variant="blue" size="sm" disabled={addingFriend} onPress={handleAddFriend} />
            </View>
            {inputError ? <Text style={styles.errorText}>{inputError}</Text> : null}
          </WiiPanel>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(70).duration(360).easing(Easing.bezier(...easings.out))}>
          <WiiPanel padding={16}>
            <View style={styles.summaryRow}>
              <View style={[styles.iconBubble, styles.summaryIconBubble]}>
                <FriendsIcon size={24} color="#FFFFFF" />
              </View>
              <View style={styles.titleCopy}>
                <Text style={styles.summaryTitle}>{onlineCount} online</Text>
                <Text style={styles.summarySubtitle}>
                  {friendCount === 0 ? 'Build your crew for private tables' : `${friendCount} friend${friendCount === 1 ? '' : 's'} in your crew`}
                </Text>
              </View>
              <View style={styles.statusPill}>
                <View style={styles.onlinePulse} />
                <Text style={styles.statusPillText}>Ready</Text>
              </View>
            </View>
          </WiiPanel>
        </Animated.View>

        {friendCount === 0 ? (
          <Animated.View entering={FadeInDown.delay(140).duration(400).easing(Easing.bezier(...easings.out))}>
            <WiiPanel padding={24}>
              <View style={styles.emptyState}>
                <View style={styles.emptyIcon}>
                  <FriendsIcon size={38} color={colors.blueDeep} />
                </View>
                <Text style={styles.emptyTitle}>Add friends to play together</Text>
                <Text style={styles.emptyText}>Friend requests are sent only after an exact handle match. The other player must accept before they join your crew.</Text>
                <WiiButton label="Create invite room" variant="green" size="md" fullWidth onPress={() => navigation.navigate('CreateJoin')} />
              </View>
            </WiiPanel>
          </Animated.View>
        ) : (
          <View style={styles.friendSections}>
            <FriendSection
              title="Online"
              friends={onlineFriends}
              startDelay={140}
              onInvite={inviteFriend}
              onRemove={confirmRemoveFriend}
              onSafety={openSafetyMenu}
              onAccept={handleAcceptFriend}
              onDecline={handleDeclineFriend}
            />
            <FriendSection
              title="Offline"
              friends={offlineFriends}
              startDelay={140 + onlineFriends.length * 58}
              onInvite={inviteFriend}
              onRemove={confirmRemoveFriend}
              onSafety={openSafetyMenu}
              onAccept={handleAcceptFriend}
              onDecline={handleDeclineFriend}
            />
          </View>
        )}

        {ADS_ENABLED ? (
          <Animated.View entering={FadeInDown.delay(220 + friendCount * 35).duration(380)}>
            <AdBanner />
          </Animated.View>
        ) : null}
      </ScrollView>
    </ScreenBackground>
  );
}

function FriendSection({
  title,
  friends,
  startDelay,
  onInvite,
  onRemove,
  onSafety,
  onAccept,
  onDecline,
}: {
  title: 'Online' | 'Offline';
  friends: Friend[];
  startDelay: number;
  onInvite: (friend: Friend) => void;
  onRemove: (friend: Friend) => void;
  onSafety: (friend: Friend) => void;
  onAccept: (friend: Friend) => void;
  onDecline: (friend: Friend) => void;
}) {
  if (friends.length === 0) return null;

  return (
    <View style={styles.sectionBlock}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionCount}>{friends.length}</Text>
      </View>
      {friends.map((friend, index) => (
        <Animated.View
          key={friend.id}
          entering={FadeInDown.delay(startDelay + index * 58).duration(390).easing(Easing.bezier(...easings.out))}
        >
          <FriendRow
            friend={friend}
            onInvite={() => onInvite(friend)}
            onRemove={() => onRemove(friend)}
            onSafety={() => onSafety(friend)}
            onAccept={() => onAccept(friend)}
            onDecline={() => onDecline(friend)}
          />
        </Animated.View>
      ))}
    </View>
  );
}

function FriendRow({
  friend,
  onInvite,
  onRemove,
  onSafety,
  onAccept,
  onDecline,
}: {
  friend: Friend;
  onInvite: () => void;
  onRemove: () => void;
  onSafety: () => void;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const statusText = friend.status?.trim() || (friend.online ? 'Online now' : 'Offline');
  const pending = friend.friendshipStatus === 'pending_outgoing';
  const incoming = friend.friendshipStatus === 'incoming';

  return (
    <WiiPanel padding={0} style={styles.friendCard}>
      <View style={styles.friendRow}>
        <View style={styles.avatarSpot}>
          <AnimatedPal config={palFromSeed(friend.palSeed)} size={44} alive={friend.online} />
        </View>
        <View style={styles.friendInfo}>
          <Text style={styles.friendName} numberOfLines={1}>
            {friend.name}
          </Text>
          <View style={styles.friendStatusRow}>
            <View style={[styles.statusDot, { backgroundColor: friend.online ? colors.online : colors.offline }]} />
            <Text style={styles.friendStatus} numberOfLines={1}>
              {statusText}
            </Text>
          </View>
        </View>
        <View style={styles.actions}>
          {incoming ? (
            <>
              <WiiButton label="Accept" variant="green" size="sm" onPress={onAccept} />
              <WiiButton label="Decline" variant="white" size="sm" onPress={onDecline} />
              <WiiButton label="Safety" variant="white" size="sm" onPress={onSafety} />
            </>
          ) : (
            <>
              <WiiButton label={pending ? 'Pending' : 'Invite'} variant={pending ? 'white' : 'green'} size="sm" disabled={pending} onPress={onInvite} />
              <WiiButton label="Safety" variant="white" size="sm" onPress={onSafety} />
              <WiiButton label="✕" variant="white" size="sm" round onPress={onRemove} />
            </>
          )}
        </View>
      </View>
    </WiiPanel>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  panelTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconBubble: {
    width: 46,
    height: 46,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.72)',
    ...shadows.soft,
  },
  addIconBubble: {
    backgroundColor: colors.accentPink,
  },
  summaryIconBubble: {
    backgroundColor: colors.blue,
  },
  titleCopy: {
    flex: 1,
    minWidth: 0,
  },
  panelTitle: {
    fontFamily: fonts.bold,
    fontSize: 20,
    color: colors.ink,
  },
  panelSubtitle: {
    marginTop: 2,
    fontFamily: fonts.medium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkMuted,
  },
  addRow: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    minHeight: 48,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelAlt,
    paddingHorizontal: 14,
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: colors.ink,
  },
  inputError: {
    borderColor: colors.red,
    backgroundColor: '#FFF3F1',
  },
  errorText: {
    marginTop: spacing.sm,
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.red,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  summaryTitle: {
    fontFamily: fonts.bold,
    fontSize: 22,
    color: colors.blueDeep,
  },
  summarySubtitle: {
    marginTop: 2,
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.inkSoft,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.panelAlt,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  onlinePulse: {
    width: 9,
    height: 9,
    borderRadius: radii.pill,
    backgroundColor: colors.online,
  },
  statusPillText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.inkSoft,
  },
  friendSections: {
    gap: spacing.lg,
  },
  sectionBlock: {
    gap: spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
  },
  sectionTitle: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: colors.ink,
  },
  sectionCount: {
    minWidth: 30,
    textAlign: 'center',
    overflow: 'hidden',
    borderRadius: radii.pill,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.inkMuted,
  },
  friendCard: {
    backgroundColor: colors.panel,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  avatarSpot: {
    width: 52,
    height: 52,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.panelAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  friendInfo: {
    flex: 1,
    minWidth: 0,
  },
  friendName: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: colors.ink,
  },
  friendStatusRow: {
    marginTop: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  statusDot: {
    width: 9,
    height: 9,
    borderRadius: radii.pill,
  },
  friendStatus: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.inkMuted,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing.xs,
    maxWidth: 190,
  },
  emptyState: {
    alignItems: 'center',
    gap: spacing.md,
  },
  emptyIcon: {
    width: 76,
    height: 76,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E7F6FC',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.soft,
  },
  emptyTitle: {
    fontFamily: fonts.bold,
    fontSize: 20,
    color: colors.ink,
    textAlign: 'center',
  },
  emptyText: {
    fontFamily: fonts.medium,
    fontSize: 14,
    lineHeight: 20,
    color: colors.inkMuted,
    textAlign: 'center',
  },
});
