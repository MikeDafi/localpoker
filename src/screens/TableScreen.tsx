import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Animated, { FadeInUp, Easing } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { ScreenBackground } from '../components/ScreenBackground';
import { ShowdownReveal } from '../components/ShowdownReveal';
import { FeltSurface } from '../components/FeltSurface';
import { DealtCard } from '../components/DealtCard';
import { HoleCards } from '../components/HoleCards';
import type { Suit } from '../game/cardFace';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { Seat } from '../components/Seat';
import { ActionBar } from '../components/ActionBar';
import { WiiButton } from '../components/WiiButton';
import { ChevronLeft, StatsIcon } from '../components/Icons';
import { AdBanner, ADS_ENABLED } from '../components/AdBanner';
import { TurnTimer } from '../components/TurnTimer';
import { LiveStatsPanel } from '../components/LiveStatsPanel';
import { EmoteBar, type Emote } from '../components/EmoteBar';
import { FlyingChipStack } from '../components/FlyingChipStack';
import { colors, fonts, radii, shadows, spacing, type, numeric, motion, easings } from '../theme/theme';
import { useApp } from '../state/AppContext';
import { sound } from '../services/sound';
import { captureError } from '../services/telemetry';
import { palFromSeed, type PalConfig } from '../avatar/palConfig';
import { RootStackParamList } from '../navigation/types';
import { isResumable, resumedTurnStartedAt } from '../game/savedGame';
import { emptyObservedTable, observeTransition } from '../game/observedStats';
import { boardDealDelay } from '../game/boardDeal';
import { isRunningOut, runoutAction, runoutFelt, runoutLabel } from '../game/runout';
import { restoredDealHandNumber, shouldAnimateDeal } from '../game/dealAnimation';
import {
  actionReadDelayMs,
  chipMotionEvents,
  chipMotionPath,
  displayedPotAmount,
  heroBetChipPoint,
  heroSeatChipPoint,
  opponentBetChipPoint,
  opponentSeatChipPoint,
  potChipPoint,
  totalCommittedChips,
  type ChipPoint,
} from '../game/chipMotion';
import { applyHostIntent, hydrateGameState } from '../game/onlineSync';
import type { Difficulty } from '../engine/bot';
import {
  createGame, startHand, applyAction, legalActions, decideAction, handName, evaluateHand, randomFloat,
  type GameState, type PlayerAction, type PlayerInput,
} from '../engine';
import {
  endRoom,
  getAuthUid,
  getCachedHostGame,
  isFirebaseConfigured,
  leaveRoom,
  publishHostGameState,
  pushAction,
  subscribeActions,
  subscribePrivateView,
  subscribeRoom,
  type RoomPrivateView,
  type RoomState,
} from '../services/firebase';

type Props = NativeStackScreenProps<RootStackParamList, 'Table'>;

const HUMAN_ID = 'me';
const BOT_NAMES = ['Ravi', 'Mika', 'Jules', 'Nina', 'Theo', 'Zoe', 'Kai', 'Lena'];
const DIFFS: Difficulty[] = ['easy', 'medium', 'hard', 'expert'];

const BOT_FOLD_EMOTES: Emote[] = [{ type: 'emoji', value: '😤' }, { type: 'text', value: 'Fold.' }, { type: 'emoji', value: '🙄' }];
const BOT_AGGRO_EMOTES: Emote[] = [{ type: 'emoji', value: '😎' }, { type: 'text', value: 'All in!' }, { type: 'emoji', value: '🔥' }];
const BOT_NEUTRAL_EMOTES: Emote[] = [{ type: 'emoji', value: '🤔' }, { type: 'emoji', value: '👍' }, { type: 'text', value: 'Hmm…' }];

interface RenderedChipFlight {
  id: number;
  amount: number;
  from: ChipPoint;
  to: ChipPoint;
  delayMs: number;
  durationMs: number;
}

export function TableScreen({ navigation, route }: Props) {
  const app = useApp();
  const { profile, recordHand, savedGame, saveGame, clearSavedGame, reportUser, blockUser, isBlocked } = app;
  const { width, height: winH } = useWindowDimensions();

  /**
   * The table stage is a *fixed* height, derived only from the window.
   *
   * It used to be `flex: 1`, which meant it silently absorbed whatever space the
   * controls below it didn't use, and the controls are ~65pt shorter during a
   * showdown (a compact result card) than on your turn (timer + action bar). The
   * felt, the seats and the community lane therefore grew and shifted every time
   * the hand ended. Pinning the stage and letting the *controls* flex instead
   * keeps the circle exactly where it is for the whole hand.
   */
  const stageH = Math.round(Math.max(210, Math.min(380, winH * (winH < 750 ? 0.34 : 0.4))));

  // Resume support: use the saved game's settings/seed when resuming.
  // A friends game abandoned for >15s is not resumable.
  const resuming = !!route.params.resume && isResumable(savedGame);
  const settings = resuming && savedGame ? savedGame.settings : route.params.settings;
  const seed = resuming && savedGame ? savedGame.seed : route.params.seed;
  const roomCode = resuming && savedGame ? savedGame.roomCode : route.params.roomCode;
  const isFriends = !!roomCode;
  const firebaseOnline = isFriends && isFirebaseConfigured();
  const [room, setRoom] = useState<RoomState | null>(null);
  const [privateView, setPrivateView] = useState<RoomPrivateView | null>(null);
  const [onlinePlayerId, setOnlinePlayerId] = useState<string | null>(() => getAuthUid());
  const authRoomId = onlinePlayerId ?? getAuthUid();
  const isOnlineHost = !!firebaseOnline && !!room && !!authRoomId && room.hostId === authRoomId;
  const hasOnlinePublicState = !!firebaseOnline && !!room?.publicState;
  const onlineSyncActive = hasOnlinePublicState && (!!privateView || isOnlineHost);
  const localPlayerId = firebaseOnline && authRoomId && (onlineSyncActive || !!getCachedHostGame(roomCode ?? ''))
    ? authRoomId
    : HUMAN_ID;

  const botSpeedMs = settings.botSpeed === 'fast' ? 550 : settings.botSpeed === 'slow' ? 1700 : 1050;
  const animsOff = settings.animationSpeed === 'off' || settings.reduceMotion;
  const botActionDelayMs = botSpeedMs + actionReadDelayMs(animsOff);

  const pals = useMemo<Record<string, PalConfig>>(() => {
    const map: Record<string, PalConfig> = { [HUMAN_ID]: profile.pal, [localPlayerId]: profile.pal };
    for (let i = 0; i < settings.numOpponents; i++) map[`bot-${i}`] = palFromSeed(`bot-${i}-${seed}`);
    Object.values(room?.players ?? {}).forEach((player) => {
      if (player.id !== localPlayerId) {
        map[player.id] = palFromSeed(player.palSeed || player.id);
      }
    });
    return map;
  }, [profile.pal, settings.numOpponents, seed, localPlayerId, room?.players]);

  const botDiff = useMemo<Record<string, Difficulty>>(() => {
    const map: Record<string, Difficulty> = {};
    for (let i = 0; i < settings.numOpponents; i++) {
      map[`bot-${i}`] = settings.mixedDifficulty ? DIFFS[i % DIFFS.length] : settings.difficulty;
    }
    return map;
  }, [settings.numOpponents, settings.mixedDifficulty, settings.difficulty]);

  const [state, setState] = useState<GameState>(() => {
    const cachedHostState = roomCode ? getCachedHostGame(roomCode) : null;
    if (cachedHostState) {
      return cachedHostState;
    }

    if (resuming && savedGame) {
      try {
        return JSON.parse(savedGame.stateJson) as GameState;
      } catch (error) {
        captureError(error, { tags: { area: 'saved-game', operation: 'parse-resume-state' } });
      }
    }
    const players: PlayerInput[] = [{ id: HUMAN_ID, name: profile.name }];
    for (let i = 0; i < settings.numOpponents; i++) {
      players.push({ id: `bot-${i}`, name: BOT_NAMES[i % BOT_NAMES.length], isBot: true });
    }
    const game = createGame(
      {
        smallBlind: settings.smallBlind,
        bigBlind: settings.bigBlind,
        ante: settings.ante,
        startingStack: settings.startingStack,
        maxPlayers: Math.max(settings.numOpponents + 1, settings.maxPlayers),
        turnTimerSec: settings.turnTimerSec,
      },
      players,
      seed,
    );
    return startHand(game);
  });

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (!roomCode || !firebaseOnline) {
      return undefined;
    }

    const unsubRoom = subscribeRoom(roomCode, (nextRoom) => {
      setRoom(nextRoom);
      if (nextRoom?.status === 'ended') {
        Alert.alert('Room ended', nextRoom.endedReason || 'The host disconnected or ended the room.', [
          { text: 'Back to menu', onPress: () => navigation.replace('Home') },
        ]);
      }
    });
    const unsubView = subscribePrivateView(roomCode, (view) => {
      setPrivateView(view);
      if (view?.playerId) {
        setOnlinePlayerId(view.playerId);
      }
    });

    return () => {
      unsubRoom();
      unsubView();
    };
  }, [firebaseOnline, navigation, roomCode]);

  useEffect(() => {
    if (!roomCode || !firebaseOnline || !room?.publicState) {
      return;
    }

    if (isOnlineHost) {
      const cached = getCachedHostGame(roomCode);
      if (cached) {
        setState(cached);
        return;
      }
    }

    if (privateView) {
      setState(hydrateGameState(room.publicState, privateView));
    }
  }, [firebaseOnline, isOnlineHost, privateView, room?.publicState, roomCode]);

  useEffect(() => {
    if (!roomCode || !firebaseOnline || !isOnlineHost || !getCachedHostGame(roomCode)) {
      return undefined;
    }

    return subscribeActions(roomCode, (action) => {
      setState((prev) => {
        const currentState = getCachedHostGame(roomCode) ?? stateRef.current ?? prev;
        const result = applyHostIntent(currentState, action.playerId, {
          type: action.type,
          amount: action.amount,
        });
        if (!result.ok) {
          console.warn('Rejected online poker intent.', result.error);
          return prev;
        }

        publishHostGameState(roomCode, result.state).catch((error) => {
          captureError(error, { tags: { area: 'firebase-room-sync', operation: 'publish-after-intent' } });
        });
        stateRef.current = result.state;
        return result.state;
      });
    });
  }, [firebaseOnline, isOnlineHost, roomCode]);

  const botTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handFlags = useRef({ vpip: false, pfr: false });
  const handHintErrorReported = useRef(false);
  // Guard against re-recording a hand that was already scored before we left:
  // if we resume directly into a finished (showdown) hand, treat it as recorded.
  const recorded = useRef(resuming && state.street === 'showdown');
  const prevBoard = useRef(state.board.length);
  /**
   * How much of the board the felt is currently showing.
   *
   * Normally this just tracks `state.board`, but a hand that ends with everyone
   * all in arrives fully dealt, so it lags behind on purpose while the run-out
   * is played out street by street.
   */
  const [revealedBoard, setRevealedBoard] = useState(state.board.length);
  /**
   * Whether this hand's betting closed before the board was complete, so the
   * hands were turned face up and the rest of the board run out underneath them.
   *
   * Latched for the whole hand rather than recomputed, because it has to stay
   * true once the result lands: a hand that has been tabled cannot be taken back
   * and mucked, so auto-muck must not close it again.
   */
  const [tabledHand, setTabledHand] = useState(false);
  /** Whether the result of a settled hand may be shown yet. */
  const [resultsOpen, setResultsOpen] = useState(state.street === 'showdown');
  const [earned, setEarned] = useState(0);
  const [sessionHands, setSessionHands] = useState(0);
  const [statsOpen, setStatsOpen] = useState(false);
  // The result panel is bottom-anchored and its height depends on how many
  // winners there are, so the hole cards are lifted clear of whatever it
  // actually measures rather than of a guess.
  const [resultH, setResultH] = useState(0);
  /**
   * What this table has been seen to do, per player.
   *
   * Opponent stats are inferred from state transitions rather than from the
   * action handlers, because online opponents never pass through this screen's
   * handlers at all, their moves arrive as whole synced states. Watching the
   * state covers bots, local play and networked players with one code path.
   */
  const [observed, setObserved] = useState(() => emptyObservedTable());
  const observedFrom = useRef<typeof state | null>(null);
  useEffect(() => {
    // React runs effects twice in development; skipping a state we have already
    // folded in keeps every count honest.
    if (observedFrom.current === state) return;
    const prev = observedFrom.current;
    observedFrom.current = state;
    setObserved((t) => observeTransition(t, prev, state));
  }, [state]);
  const [reveal, setReveal] = useState<'auto' | 'show' | 'muck'>('auto');
  const [area, setArea] = useState({ w: width, h: 0 });
  // Pod heights are measured, but kept as *high-water marks*: a pod grows and
  // shrinks as bet chips and "Folded" tags come and go, and the community lane
  // is derived from them, so taking the running maximum is what stops the board
  // and pot drifting up and down mid-hand.
  const [podH, setPodH] = useState(78);
  const [heroH, setHeroH] = useState(96);
  const growPod = useCallback((h: number) => setPodH((prev) => (h > prev ? h : prev)), []);
  const growHero = useCallback((h: number) => setHeroH((prev) => (h > prev ? h : prev)), []);
  const [boardBox, setBoardBox] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const [chipFlights, setChipFlights] = useState<RenderedChipFlight[]>([]);
  const chipMotionFrom = useRef<GameState | null>(null);
  const chipFlightSeq = useRef(0);
  const removeChipFlight = useCallback((id: number) => {
    setChipFlights((flights) => flights.filter((flight) => flight.id !== id));
  }, []);
  const [emotes, setEmotes] = useState<Record<string, Emote>>({});
  const emoteTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const showEmote = useCallback((playerId: string, emote: Emote) => {
    setEmotes((prev) => ({ ...prev, [playerId]: emote }));
    if (emoteTimers.current[playerId]) clearTimeout(emoteTimers.current[playerId]);
    emoteTimers.current[playerId] = setTimeout(() => {
      setEmotes((prev) => {
        const next = { ...prev };
        delete next[playerId];
        return next;
      });
    }, 2600);
  }, []);

  const sendEmote = useCallback((emote: Emote) => {
    sound.play('tap');
    Haptics.selectionAsync().catch(() => {});
    showEmote(localPlayerId, emote);
  }, [localPlayerId, showEmote]);

  useEffect(() => () => {
    Object.values(emoteTimers.current).forEach(clearTimeout);
  }, []);

  /**
   * Whether the settled hand on screen still has board left to deal.
   *
   * `runningOut` drives the pacing; `handOver` stays the engine's own answer,
   * so anything that must not run after the hand ends (bots, the turn timer)
   * keeps checking that rather than the presentational `isShowdown` below.
   */
  const handOver = state.street === 'showdown';
  const runningOut = isRunningOut(state, revealedBoard);

  /**
   * The hand the felt draws.
   *
   * While a board is running out this is the hand as it stood with the chips in
   * the middle and only the streets dealt so far showing, so the seats, the pot
   * and the hand hint all stay honest instead of giving the result away three
   * cards early. Every other read below is derived from it, which is what keeps
   * the whole felt consistent with itself.
   */
  const felt = useMemo(
    () => (runningOut ? runoutFelt(state, revealedBoard) : state),
    [state, runningOut, revealedBoard],
  );

  const human = felt.players.find((p) => p.id === localPlayerId)
    ?? felt.players.find((p) => p.id === HUMAN_ID)
    ?? felt.players[0]!;
  const current = felt.players[felt.currentPlayerIndex];
  const isAwaitingOnlineState = !!roomCode && firebaseOnline && !onlineSyncActive;
  const isHumanTurn = current?.id === human?.id && !handOver && !isAwaitingOnlineState;
  // Presentational: true only once the run-out has finished and the result has
  // been held back for its beat.
  const isShowdown = handOver && resultsOpen;
  const legal = useMemo(() => (isHumanTurn && human ? legalActions(state, human.id) : null), [state, isHumanTurn, human]);
  const displayedPot = displayedPotAmount(felt);
  const wageringPot = totalCommittedChips(felt);

  // Track when the current turn's countdown began so leaving/resuming carries
  // over the remaining time instead of resetting the timer to full.
  const turnKey = `${state.handNumber}:${state.street}:${state.currentPlayerIndex}`;
  const [turnStartedAt, setTurnStartedAt] = useState<number>(() =>
    (resuming ? resumedTurnStartedAt(savedGame) : Date.now()));
  const prevTurnKey = useRef(turnKey);
  useEffect(() => {
    if (prevTurnKey.current !== turnKey) {
      prevTurnKey.current = turnKey;
      setTurnStartedAt(Date.now());
    }
  }, [turnKey]);

  const humanWon = isShowdown && felt.winners.some((w) => w.playerId === human.id && w.amount > 0);
  const remainingAtEnd = felt.players.filter((p) => !p.folded && !p.sittingOut).length;

  /**
   * Whether the hands still in the pot are lying face up on the felt.
   *
   * Turning them up is what gives a run-out its tension: you can see what each
   * player is holding, so every card that lands means something before the
   * result says so.
   */
  const handsTabled = tabledHand && remainingAtEnd > 1;

  /**
   * What the table is waiting on while a board runs out, or null when it is not
   * running one. Covers the beat after the river too, which is still part of the
   * wait even though there are no cards left to deal.
   */
  const runoutStatus = runningOut || (handOver && tabledHand)
    ? runoutLabel(revealedBoard, state.board.length)
    : null;

  // Reads the felt's board, so during a run-out it climbs with each street the
  // player is watching land rather than jumping straight to the final hand.
  const handHint = useMemo(() => {
    if (human.holeCards.length < 2 || human.folded) return null;
    try {
      const evalCards = [...human.holeCards, ...felt.board];
      if (evalCards.length < 5) return null;
      return handName(evaluateHand(evalCards).category);
    } catch (error) {
      if (!handHintErrorReported.current) {
        handHintErrorReported.current = true;
        captureError(error, { tags: { area: 'table', operation: 'evaluate-hand-hint' } });
      }
      return null;
    }
  }, [human.holeCards, human.folded, felt.board]);

  // The exact 5 cards that make up the winning hand(s), to highlight at showdown.
  const winningCardKeys = useMemo(() => {
    const keys = new Set<string>();
    if (!isShowdown) return keys;
    for (const w of felt.winners) {
      w.hand?.cards?.forEach((c) => keys.add(`${c.rank}${c.suit}`));
    }
    return keys;
  }, [isShowdown, felt.winners]);

  // Whether the human's cards are visible to the table at showdown.
  // Mucking is the default: you only ever expose your hand by explicitly tapping
  // "Show cards" (or by turning Auto-muck off, which tables a winning hand).
  // A hand that was turned up for a run-out is already public, and auto-muck
  // cannot put it back.
  const humanCardsShown = handsTabled && !human.folded
    ? true
    : isShowdown
      ? reveal === 'show' || (reveal === 'auto' && !settings.autoMuck && humanWon)
      : true;

  /**
   * The hand that gets laid out in the middle at showdown: the winner's two hole
   * cards, which are flipped, lifted and pushed across to join the board so all
   * seven cards are on show and the best five can be ringed.
   *
   * Null when the pot was won without a showdown (everybody folded): there is
   * no hand to lay out, and the winner is entitled to keep it hidden.
   */
  const showdownHand = useMemo(() => {
    if (!isShowdown) return null;
    const w = felt.winners.find((x) => x.hand?.cards?.length);
    if (!w) return null;
    const p = felt.players.find((pp) => pp.id === w.playerId);
    if (!p || p.holeCards.length < 2) return null;
    if (p.id === human.id && !humanCardsShown) return null;
    return {
      playerId: p.id,
      name: p.name,
      hole: p.holeCards.slice(0, 2),
      label: handName(w.hand!.category),
    };
  }, [isShowdown, felt.winners, felt.players, humanCardsShown]);

  const actionSound = (action: PlayerAction) => {
    if (action === 'fold') sound.play('fold');
    else if (action === 'check') sound.play('check');
    else sound.play('chip');
  };

  const step = useCallback((action: PlayerAction, amount?: number, actorId?: string) => {
    setState((prev) => {
      const id = actorId ?? prev.players[prev.currentPlayerIndex]?.id;
      if (!id) return prev;
      const res = applyAction(prev, id, action, amount);
      return res.ok ? res.state : prev;
    });
  }, []);

  const onHumanAction = (action: PlayerAction, amount?: number) => {
    if (action === 'fold' && settings.confirmFoldWhenCheckAvailable && legal?.actions.includes('check')) {
      Alert.alert('Fold this hand?', 'You can check for free. Are you sure you want to fold?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Fold', style: 'destructive', onPress: () => doHumanAction(action, amount) },
      ]);
      return;
    }
    doHumanAction(action, amount);
  };

  const doHumanAction = (action: PlayerAction, amount?: number) => {
    if (settings.hapticsEnabled) {
      Haptics.impactAsync(action === 'fold' ? Haptics.ImpactFeedbackStyle.Rigid : Haptics.ImpactFeedbackStyle.Medium);
    }
    actionSound(action);

    // Only count the hand toward VPIP/PFR once the action has actually landed.
    // Online the write can be refused (a stale sequence, a lost connection), and
    // recording stats for an action nobody else ever saw would quietly corrupt
    // the player's numbers.
    const markActionStats = () => {
      if (state.street !== 'preflop') return;
      if (action === 'call' || action === 'bet' || action === 'raise' || action === 'allin') handFlags.current.vpip = true;
      if (action === 'bet' || action === 'raise') handFlags.current.pfr = true;
    };

    if (roomCode && firebaseOnline) {
      const warnFailed = (reason: string) => {
        Alert.alert('Action not sent', reason, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Retry', onPress: () => doHumanAction(action, amount) },
        ]);
      };

      // One timestamp for both fields. Two `Date.now()` calls can straddle a
      // millisecond boundary, leaving an action whose sequence number and
      // timestamp disagree.
      const now = Date.now();
      pushAction(roomCode, {
        playerId: human.id,
        type: action,
        ...(typeof amount === 'number' ? { amount } : {}),
        seq: now,
        ts: now,
      })
        .then((result) => {
          if (result.ok) {
            markActionStats();
            return;
          }
          // A refused write means the tap did nothing. Without this the table
          // just sits there looking frozen and the player taps again.
          captureError(new Error(result.reason ?? 'push-action-refused'), {
            tags: { area: 'firebase-room-sync', operation: 'push-online-action' },
          });
          warnFailed(result.reason ?? 'Your action could not be sent. Check your connection and try again.');
        })
        .catch((error) => {
          captureError(error, { tags: { area: 'firebase-room-sync', operation: 'push-online-action' } });
          warnFailed('Your action could not be sent. Check your connection and try again.');
        });
      return;
    }

    markActionStats();
    step(action, amount, human.id);
  };

  const onTimerExpire = useCallback(() => {
    if (handOver) return;
    const actor = state.players[state.currentPlayerIndex];
    if (!actor) return;
    if (actor.id === human.id) {
      if (!legal) return;
      if (legal.actions.includes('check')) onHumanAction('check');
      else onHumanAction('fold');
    } else if (actor.isBot) {
      // Safety net: force a stalled opponent to act so no turn hangs.
      const decision = decideAction(state, actor.id, botDiff[actor.id] ?? settings.difficulty);
      step(decision.action, decision.amount, actor.id);
    }
  }, [handOver, state, legal, botDiff, settings.difficulty, step]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentActorName = current?.id === human.id
    ? 'You'
    : current
      ? isBlocked(current.id) ? 'Blocked player' : current.name
      : undefined;

  const rebuy = () => {
    sound.play('coins');
    setState((prev) => {
      const next: GameState = JSON.parse(JSON.stringify(prev));
      const me = next.players.find((p) => p.id === human.id);
      if (me && me.chips < settings.startingStack) {
        me.chips = settings.startingStack;
        me.sittingOut = false;
      }
      return next;
    });
  };

  /**
   * Walk the felt through a board the engine has already finished dealing.
   *
   * When the last player who could act goes all in, the engine deals the rest of
   * the board and settles the pot in one step, so the table would otherwise get
   * the flop, turn, river and the winner in a single frame. This holds the
   * remaining streets back and lets them land one at a time, then waits a beat
   * more before the result is allowed on screen: the cards get to decide the
   * hand in front of the player rather than behind them.
   *
   * Outside a run-out it just keeps the felt in step with the engine, which is
   * what every normally dealt street and every new hand goes through.
   */
  useEffect(() => {
    const action = runoutAction({
      handOver,
      animationsOff: animsOff,
      revealed: revealedBoard,
      boardLength: state.board.length,
      resultsOpen,
      tabled: tabledHand,
    });

    switch (action.kind) {
      case 'reset':
        if (revealedBoard !== action.revealed) setRevealedBoard(action.revealed);
        if (resultsOpen) setResultsOpen(false);
        if (tabledHand) setTabledHand(false);
        return undefined;
      case 'settle':
        if (revealedBoard !== action.revealed) setRevealedBoard(action.revealed);
        if (!resultsOpen) setResultsOpen(true);
        return undefined;
      case 'deal': {
        const { step } = action;
        if (!tabledHand) setTabledHand(true);
        sound.play(step.cue);
        const timer = setTimeout(() => setRevealedBoard(step.revealed), step.delayMs);
        return () => clearTimeout(timer);
      }
      case 'result': {
        const timer = setTimeout(() => setResultsOpen(true), action.delayMs);
        return () => clearTimeout(timer);
      }
      default:
        return undefined;
    }
  }, [handOver, animsOff, revealedBoard, state.board.length, resultsOpen, tabledHand]);

  // Follows the felt rather than the engine, so during a run-out each street is
  // dealt with a sound as it lands instead of all five at once.
  useEffect(() => {
    if (revealedBoard > prevBoard.current) sound.play('deal');
    prevBoard.current = revealedBoard;
  }, [revealedBoard]);

  useEffect(() => {
    if (isHumanTurn) sound.play('turn');
  }, [isHumanTurn]);

  const shouldSaveLocalState = !roomCode || !firebaseOnline || isOnlineHost;

  // Persist the active game for resume-after-leaving. Debounced to avoid disk
  // thrash (state changes many times/sec during bot sequences). Full state is
  // kept so a mid-hand resume is correct; this snapshot is local-only.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The latest snapshot, so the unmount flush below writes current data without
  // re-subscribing the effect on every state change.
  const snapshot = useRef({ state, settings, seed, roomCode, turnStartedAt, shouldSaveLocalState });
  snapshot.current = { state, settings, seed, roomCode, turnStartedAt, shouldSaveLocalState };
  useEffect(() => {
    if (!shouldSaveLocalState) return undefined;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveGame({
        stateJson: JSON.stringify(state),
        settings,
        seed,
        roomCode,
        handNumber: state.handNumber,
        savedAt: Date.now(),
        turnStartedAt,
      });
    }, 600);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [state, turnStartedAt, shouldSaveLocalState]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Flush a save the moment the table goes away.
   *
   * The debounced save above stamps `savedAt` ~600ms after a turn begins, then
   * never again while you sit and think, so the "time already spent on this
   * turn" it recorded was always ~600ms and the countdown restarted from full on
   * resume. Writing once more on unmount stamps `savedAt` at the instant you
   * actually left, which is what makes the timer pick up where it was.
   */
  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const s = snapshot.current;
    if (!s.shouldSaveLocalState) return;
    saveGame({
      stateJson: JSON.stringify(s.state),
      settings: s.settings,
      seed: s.seed,
      roomCode: s.roomCode,
      handNumber: s.state.handNumber,
      savedAt: Date.now(),
      turnStartedAt: s.turnStartedAt,
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Drive bots on their turn.
  useEffect(() => {
    if (handOver) return;
    const actor = state.players[state.currentPlayerIndex];
    if (roomCode && firebaseOnline) return;
    if (!actor || actor.id === human.id || !actor.isBot) return;
    botTimer.current = setTimeout(() => {
      const decision = decideAction(state, actor.id, botDiff[actor.id] ?? settings.difficulty);
      actionSound(decision.action);
      // Occasionally a bot reacts, so the table feels alive both ways.
      const emoteRoll = randomFloat(`${String(seed)}:emote:${state.handNumber}:${actor.id}:${state.log.length}`);
      if (emoteRoll > 0.9) {
        const pool = decision.action === 'fold' ? BOT_FOLD_EMOTES
          : decision.action === 'raise' || decision.action === 'allin' ? BOT_AGGRO_EMOTES
          : BOT_NEUTRAL_EMOTES;
        showEmote(actor.id, pool[Math.floor(emoteRoll * 997) % pool.length]);
      }
      step(decision.action, decision.amount, actor.id);
    }, botActionDelayMs);
    return () => {
      if (botTimer.current) clearTimeout(botTimer.current);
    };
  }, [state, isShowdown, step, botDiff, settings.difficulty, botActionDelayMs, showEmote, seed]);

  // Record stats + award coins once per hand at showdown.
  useEffect(() => {
    if (!isShowdown || recorded.current) return undefined;
    recorded.current = true;
    const endingStack = state.players.find((p) => p.id === human.id)?.chips ?? 0;
    const winAmt = state.winners.find((w) => w.playerId === human.id)?.amount ?? 0;
    const contributed = state.contributions[human.id] ?? 0;
    const wentToShowdown = remainingAtEnd > 1 && !human.folded && state.board.length === 5;
    const coins = recordHand({
      won: humanWon,
      wentToShowdown,
      wonAtShowdown: humanWon && wentToShowdown,
      potWon: winAmt,
      net: winAmt - contributed,
      vpip: handFlags.current.vpip,
      pfr: handFlags.current.pfr,
      aggressor: handFlags.current.pfr,
      endingStack,
    });
    setEarned(coins);
    setSessionHands((n) => n + 1);
    if (settings.winFanfare) sound.play(humanWon ? 'win' : 'lose');
    // Cleaned up, so leaving the table during the beat between the result and
    // the coins does not play a sound for a screen that is gone.
    const coinTimer = setTimeout(() => sound.play('coins'), 350);
    return () => clearTimeout(coinTimer);
  }, [isShowdown]); // eslint-disable-line react-hooks/exhaustive-deps

  const nextHand = () => {
    if (roomCode && firebaseOnline && !isOnlineHost) {
      Alert.alert('Waiting for host', 'The host will deal the next hand.');
      return;
    }

    const active = state.players.filter((p) => p.chips > 0 && !p.sittingOut);
    if (active.length < 2) {
      Alert.alert('Table over', human.chips > 0 ? 'You cleaned up! 🎉' : 'Everyone else is out.', [
        {
          text: 'Back to menu',
          onPress: () => {
            if (roomCode && firebaseOnline && isOnlineHost) {
              endRoom(roomCode, 'Not enough players to continue.').catch(() => {});
            }
            clearSavedGame();
            navigation.replace('Home');
          },
        },
      ]);
      return;
    }
    if (human.chips <= 0) {
      Alert.alert('Out of chips', 'Rebuy for free and keep playing?', [
        { text: 'Back to menu', style: 'cancel', onPress: () => { clearSavedGame(); navigation.replace('Home'); } },
        { text: 'Rebuy (free)', onPress: () => { rebuy(); startNext(); } },
      ]);
      return;
    }
    startNext();
  };

  const startNext = () => {
    sound.play('start');
    handFlags.current = { vpip: false, pfr: false };
    recorded.current = false;
    setEarned(0);
    setReveal('auto');
    setState((prev) => {
      const next = startHand(prev);
      if (roomCode && firebaseOnline && isOnlineHost) {
        publishHostGameState(roomCode, next).catch((error) => {
          captureError(error, { tags: { area: 'firebase-room-sync', operation: 'publish-next-hand' } });
        });
      }
      return next;
    });
  };

  const leave = () => {
    if (roomCode && firebaseOnline) {
      Alert.alert(
        'Leave table?',
        isOnlineHost ? 'Leaving will end the room for everyone.' : 'You can rejoin later with the room code if the host keeps playing.',
        [
          { text: 'Stay', style: 'cancel' },
          {
            text: 'Leave',
            style: 'destructive',
            onPress: () => {
              const leavePromise = isOnlineHost
                ? endRoom(roomCode, 'Host left the table.')
                : leaveRoom(roomCode, human.id).then(() => ({ ok: true }));
              leavePromise
                .catch((error) => {
                  captureError(error, { tags: { area: 'firebase-room-sync', operation: 'leave-online-table' } });
                })
                .finally(() => navigation.replace('Home'));
            },
          },
        ],
      );
      return;
    }

    Alert.alert('Leave table?', 'Your game is saved. You can resume it from the home screen.', [
      { text: 'Stay', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => navigation.replace('Home') },
    ]);
  };

  const opponents = felt.players.filter((p) => p.id !== human.id);
  const reportablePlayers = opponents.filter((p) => !p.isBot && p.id !== HUMAN_ID);
  const dealerId = state.players[state.dealerIndex]?.id;
  const cardSize = width < 380 ? 46 : 52;
  const lowChips = human.chips < settings.bigBlind * 5;

  const visiblePlayer = useCallback(
    (player: GameState['players'][number]) =>
      isBlocked(player.id) ? { ...player, name: 'Blocked player' } : player,
    [isBlocked],
  );
  const visibleEmote = useCallback((playerId: string): Emote | null =>
    isBlocked(playerId) ? null : emotes[playerId] ?? null, [emotes, isBlocked]);

  const reportTablePlayer = async (player: GameState['players'][number]) => {
    const result = await reportUser(player.id, player.name, 'table', roomCode);
    Alert.alert(result.ok ? 'Report sent' : 'Could not report', result.reason || 'Thanks. We will review this player.');
  };

  const confirmBlockTablePlayer = (player: GameState['players'][number]) => {
    Alert.alert('Block player?', `${player.name} will not be able to send you friend requests. Their name and reactions will be hidden from you.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: async () => {
          const result = await blockUser(player.id, player.name);
          Alert.alert(result.ok ? 'Player blocked' : 'Could not block', result.reason || `${player.name} was blocked.`);
        },
      },
    ]);
  };

  const openPlayerSafety = (player: GameState['players'][number]) => {
    Alert.alert(player.name, 'Choose a safety action.', [
      { text: 'Report offensive content', onPress: () => reportTablePlayer(player) },
      { text: 'Block player', style: 'destructive', onPress: () => confirmBlockTablePlayer(player) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const openTableSafety = () => {
    if (reportablePlayers.length === 0) {
      Alert.alert('Table safety', 'No online players at this table can be reported.');
      return;
    }
    Alert.alert('Table safety', 'Choose a player.', [
      ...reportablePlayers.map((player) => ({
        text: isBlocked(player.id) ? 'Blocked player' : player.name,
        onPress: () => openPlayerSafety(player),
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  // A subtle in-game reaction for each Pal (uses the expressions they support).
  const reactionFor = (pid: string): 'happy' | 'sad' | 'think' | undefined => {
    if (isShowdown) {
      if (felt.winners.some((w) => w.playerId === pid && w.amount > 0)) return 'happy';
      const pl = felt.players.find((p) => p.id === pid);
      if (pl?.folded) return 'sad';
      return undefined;
    }
    return current?.id === pid ? 'think' : undefined;
  };

  // Opponents sit high on the felt's top arc, hugging the rail, so their pods
  // (name + bet chip) always clear the community-card lane below them. The felt
  // is narrower than 5 board cards + two side pods, so the side seats can never
  // sit *beside* the board; they must sit *above* it, which this arc ensures.
  /**
   * Avatar size scales with how crowded the table is: heads-up there is plenty
   * of felt, so faces can be large and readable; at a full ring they must shrink
   * or the pods overlap along the seat arc.
   */
  const avatarSize = Math.round(Math.max(40, Math.min(66, 74 - opponents.length * 5)));
  const SEAT_W = Math.max(76, avatarSize + 34);
  const seatPos = (idx: number, n: number) => {
    const cx = area.w / 2;
    const cy = stageH * 0.25;
    const rx = area.w * 0.44;
    const ry = stageH * 0.20;
    const t = n === 1 ? 0.5 : idx / (n - 1);
    const ang = ((210 + t * 120) * Math.PI) / 180; // top arc (210°..330°) along the rail
    const x = cx + rx * Math.cos(ang);
    const y = cy + ry * Math.sin(ang);
    return {
      left: Math.max(2, Math.min(area.w - SEAT_W - 2, x - SEAT_W / 2)),
      top: Math.max(2, y - 30),
    };
  };

  /**
   * The community-card lane: the band of felt between the lowest seat pod and
   * the hero's pod. Pod heights are tracked as high-water marks (see `setPodH`)
   * so the lane never jumps when a bet chip or "Folded" tag comes and goes,
   * the table has to stay put between "your turn" and "hand over".
   *
   * The top is taken from where the pods *actually* sit rather than from the
   * arc formula, because `seatPos` clamps pods to the top of the felt. Heads-up
   * the clamp bites hard, and deriving the lane from the unclamped arc threw
   * away ~25pt of felt, enough that the board and pot overflowed the lane and
   * slid underneath the hero, which is how the pot ended up unreadable.
   */
  const lowestSeatTop = opponents.length
    ? Math.max(...opponents.map((_, i) => seatPos(i, opponents.length).top))
    : 0;
  const laneTop = lowestSeatTop + podH + 6;
  const laneBottom = heroH + 6;

  // --- Dealing the hole cards -------------------------------------------------
  // Cards are thrown one at a time from the middle of the table, going around
  // from the dealer's left (just like a real deal), two rounds.
  const DEAL_STEP = 80;
  const dealOrder = useMemo(() => {
    const n = state.players.length;
    const m: Record<string, number> = {};
    state.players.forEach((p, j) => { m[p.id] = (j - state.dealerIndex - 1 + n) % n; });
    return m;
  }, [state.players, state.dealerIndex]);
  const dealDelay = (playerId: string, cardIndex: number) =>
    ((cardIndex * state.players.length) + (dealOrder[playerId] ?? 0)) * DEAL_STEP;
  /** Middle of the felt, where the dealer pitches cards from. */
  const tableH = stageH;
  const dealOrigin = { x: area.w / 2, y: stageH * 0.45 };
  // The hand a resumed game comes back to is already in progress, so it should
  // simply be there rather than being pitched across the felt again. Every hand
  // dealt *after* that is a real deal and gets the real animation, gating on
  // `resuming` alone killed the deal for the rest of the session, which is a
  // long time to go without one.
  const restoredHand = useRef(restoredDealHandNumber(resuming, state.handNumber));
  const dealAnimate = shouldAnimateDeal(animsOff, state.handNumber, restoredHand.current);

  // --- Showdown lay-out -------------------------------------------------------
  // At showdown the community row grows from five slots to seven so the winner's
  // hole cards have somewhere to land. Cards shrink just enough for seven to fit
  // the felt; `boardBox` is measured so the flight targets are exact rather than
  // arithmetic guesses about margins and borders.
  const layingOut = !!showdownHand;
  const boardCells = layingOut ? 7 : 5;
  // Seven cards is a wide row for a round table: sized naively they hang off the
  // felt onto the carpet. The row is therefore capped to a chord the oval can
  // actually hold, and the cards shrink to suit.
  const CELL_PAD = 10; // per cell: 2pt margins + 2pt ring border + 1pt padding, both sides
  /**
   * The board is also capped by how tall the lane is, not just how wide it is.
   * Sizing on width alone let the row grow past the bottom of the lane, and
   * since the hero pod is drawn over the felt the overflow simply vanished
   * behind it, taking the pot with it. Fitting the height means the pot always
   * has somewhere to sit.
   */
  const POT_BLOCK_H = 40; // pot pill plus the gap above it
  const laneH = Math.max(0, stageH - laneTop - laneBottom);
  const boardMaxH = Math.max(28 * 1.42, laneH - POT_BLOCK_H);
  const sdCardSize = Math.max(
    28,
    Math.min(
      layingOut ? Math.min(cardSize, Math.floor((area.w * 0.8) / boardCells) - CELL_PAD) : cardSize,
      Math.floor(boardMaxH / 1.42),
    ),
  );
  const cellW = boardBox.w > 0 ? boardBox.w / boardCells : sdCardSize + CELL_PAD;
  const slotCentre = (i: number) => ({
    x: boardBox.x + cellW * (i + 0.5),
    y: laneTop + boardBox.y + boardBox.h / 2,
  });

  /** Where the winner's cards start their journey: the middle of their pod. */
  const revealFrom = useMemo(() => {
    if (!showdownHand) return { x: area.w / 2, y: stageH / 2 };
    const idx = opponents.findIndex((p) => p.id === showdownHand.playerId);
    if (idx < 0) return { x: area.w / 2, y: Math.max(0, stageH - heroH / 2) };
    const pos = seatPos(idx, opponents.length);
    // Beside the avatar rather than on top of it, squarely over the pod the
    // grown cards hide the face of the player who just won, and nudged toward
    // the middle, which is where they're headed anyway.
    const cx = pos.left + SEAT_W / 2;
    const inward = cx < area.w / 2 ? 18 : -18;
    return {
      x: Math.min(area.w - 26, Math.max(26, cx + inward)),
      y: pos.top + 40,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showdownHand, opponents, area.w, stageH, heroH]);

  const revealTargets = layingOut ? [slotCentre(5), slotCentre(6)] : [];
  const revealHighlight = showdownHand
    ? showdownHand.hole.map((c) => winningCardKeys.has(`${c.rank}${c.suit}`))
    : [];

  /**
   * Community cards are pitched in from the dealer's spot like the hole cards,
   * rather than fading in on the spot. They arrive already face-up (`noFlip`),
   * a dealer turns the flop as it's placed, and a mid-air flip here reads as the
   * board "changing" rather than being dealt.
   */
  const boardThrowFrom = (i: number) => {
    const offsetFromCentre = (i - (boardCells - 1) / 2) * cellW;
    return { x: -offsetFromCentre, y: -(stageH * 0.22) };
  };
  /**
   * Stagger for each community card. Deliberately a pure function of the card's
   * own index: deriving it from `state.board.length` made already-placed cards
   * change delay when a new street landed, which restarted their throw
   * animation from transparent and made them blink out mid-hand.
   */
  const boardDelay = (i: number) => boardDealDelay(i);

  useEffect(() => {
    if (animsOff) {
      chipMotionFrom.current = felt;
      setChipFlights((flights) => (flights.length > 0 ? [] : flights));
      return;
    }
    if (area.h <= 0) return;

    const prev = chipMotionFrom.current;
    if (prev === felt) return;
    const events = prev ? chipMotionEvents(prev, felt) : resuming ? [] : chipMotionEvents(null, felt);
    chipMotionFrom.current = felt;
    if (events.length === 0) return;

    const potPoint = potChipPoint({ areaWidth: area.w, laneTop, boardBox });
    const flights: RenderedChipFlight[] = [];
    for (const event of events) {
      const isHero = event.playerId === human.id;
      let seatPoint: ChipPoint | null = null;
      let betPoint: ChipPoint | null = null;
      if (isHero) {
        seatPoint = heroSeatChipPoint(area.w, stageH, heroH);
        betPoint = heroBetChipPoint(area.w, stageH);
      } else {
        const opponentIndex = opponents.findIndex((player) => player.id === event.playerId);
        if (opponentIndex >= 0) {
          const pos = seatPos(opponentIndex, opponents.length);
          seatPoint = opponentSeatChipPoint(pos, SEAT_W, podH);
          betPoint = opponentBetChipPoint(pos, SEAT_W, podH);
        }
      }
      if (!seatPoint || !betPoint) continue;
      const path = chipMotionPath(event.phase, seatPoint, betPoint, potPoint);
      chipFlightSeq.current += 1;
      flights.push({
        id: chipFlightSeq.current,
        amount: event.amount,
        from: path.from,
        to: path.to,
        delayMs: event.delayMs,
        durationMs: event.durationMs,
      });
    }
    if (flights.length > 0) {
      setChipFlights((currentFlights) => [...currentFlights, ...flights]);
    }
  }, [
    animsOff,
    area.h,
    area.w,
    boardBox,
    heroH,
    human.id,
    laneTop,
    opponents,
    podH,
    resuming,
    seatPos,
    SEAT_W,
    stageH,
    felt,
  ]);

  return (
    <ScreenBackground variant="felt" edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable
          onPress={leave}
          style={[styles.iconBtn, shadows.soft]}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ChevronLeft color={colors.onDark} />
        </Pressable>
        {/* Only friends games have anything to say up here; a solo hand's
            number was just noise taking a row off the felt. */}
        {roomCode ? (
          <View style={styles.roomPill}>
            <Text style={styles.roomText}>{`#${roomCode}`}</Text>
          </View>
        ) : null}
        <View style={styles.topRight}>
          {reportablePlayers.length > 0 ? (
            <Pressable
              onPress={openTableSafety}
              style={[styles.safetyBtn, shadows.soft]}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Open table safety actions"
            >
              <Text style={styles.safetyBtnText}>!</Text>
            </Pressable>
          ) : null}
          {settings.showLiveStats && (
            <Pressable onPress={() => { sound.play('tap'); setStatsOpen(true); }} style={[styles.iconBtn, shadows.soft]} hitSlop={8} accessibilityRole="button" accessibilityLabel="Open live stats">
              <StatsIcon size={22} color={colors.blueLight} />
            </Pressable>
          )}
        </View>
      </View>

      {isFriends && (
        <View style={styles.friendsBanner}>
          <Text style={styles.friendsBannerText}>
            {firebaseOnline
              ? room?.status === 'ended'
                ? `Room ${roomCode} ended, host disconnected or left`
                : onlineSyncActive
                  ? `Room ${roomCode} · live synced table`
                  : `Room ${roomCode} · connecting to live table…`
              : `Room ${roomCode} · practice vs bots, live friend play needs Firebase setup`}
          </Text>
        </View>
      )}

      <View style={[styles.tableArea, { height: stageH }]} onLayout={(e) => setArea({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        {/* felt oval: matte surface, top-lit rail edge, inner shadow at the rail */}
        <LinearGradient
          colors={[colors.feltLight, colors.felt, colors.feltDeep]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={[styles.feltOval, shadows.raised]}
          pointerEvents="none"
        >
          {/* woven cloth + suit watermark (CC0 / MIT sources).
              The oval is inset 8pt on every side of the table area, and the
              10pt rail border sits inside that, so the cloth fills what's left. */}
          <FeltSurface width={Math.max(0, area.w - 16 - 20)} height={Math.max(0, stageH - 16 - 20)} />
          <View style={styles.railHighlight} pointerEvents="none" />
          <View style={styles.feltInner} pointerEvents="none" />
          <View style={styles.feltGlow} pointerEvents="none" />
        </LinearGradient>

        {/* Community cards + pot, centred in the lane between the seat arc and
            the hero pod (see `laneTop`/`laneBottom`). */}
        <View style={[styles.centerZone, { top: laneTop, bottom: laneBottom }]} pointerEvents="box-none">
          {/* The street is already obvious from the board itself, so naming it
              only cost the lane a row. The winning hand still gets announced,
              because that is the one thing the cards do not tell you. */}
          {showdownHand && (
            <View style={styles.handNamePill}>
              <Text style={styles.handNameText}>{showdownHand.label}</Text>
            </View>
          )}

          <View style={styles.board} onLayout={(e) => setBoardBox({ x: e.nativeEvent.layout.x, y: e.nativeEvent.layout.y, w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
            {Array.from({ length: boardCells }).map((_, i) => {
              // Slots 5 and 6 only exist at showdown: they are the landing spots
              // for the winner's hole cards, filled by <ShowdownReveal/> above.
              if (i >= 5) {
                return (
                  <View key={`hole-${i}`} style={[styles.boardCardWrap, layingOut && styles.boardCardTight]}>
                    <View style={{ width: sdCardSize, height: sdCardSize * 1.42 }} />
                  </View>
                );
              }
              const card = felt.board[i];
              if (!card) {
                return (
                  <View key={i} style={[styles.boardCardWrap, layingOut && styles.boardCardTight]}>
                    <View style={[styles.cardSlot, { width: sdCardSize, height: sdCardSize * 1.42 }]} />
                  </View>
                );
              }
              const highlighted = isShowdown && winningCardKeys.has(`${card.rank}${card.suit}`);
              return (
                <View key={`card-${i}-${card.rank}${card.suit}`} style={[styles.boardCardWrap, layingOut && styles.boardCardTight, highlighted && styles.winCard]}>
                  <DealtCard
                    rank={card.rank}
                    suit={card.suit as any}
                    size={sdCardSize}
                    faceUp
                    noFlip
                    animate={!animsOff}
                    delay={boardDelay(i)}
                    fromX={boardThrowFrom(i).x}
                    fromY={boardThrowFrom(i).y}
                    dimmed={isShowdown && !highlighted}
                  />
                </View>
              );
            })}
          </View>

          {displayedPot > 0 && (
            <View style={styles.potWrap}>
              <View style={styles.potCenter}>
                <Text style={styles.potCenterLabel}>Pot</Text>
                <AnimatedNumber value={displayedPot} style={styles.potCenterValue} />
              </View>
            </View>
          )}
        </View>

        {/* The winner's cards: turned over at the seat, lifted so they can be
            read, then pushed across to join the board. Rendered above the seats
            so nothing clips them in flight. */}
        {showdownHand && boardBox.w > 0 && (
          <ShowdownReveal
            revealKey={`${state.handNumber}-${showdownHand.playerId}`}
            cards={showdownHand.hole}
            from={revealFrom}
            to={revealTargets}
            smallSize={18}
            bigSize={sdCardSize}
            highlight={revealHighlight}
            animate={!animsOff}
          />
        )}

        {chipFlights.map((flight) => (
          <FlyingChipStack
            key={flight.id}
            amount={flight.amount}
            from={flight.from}
            to={flight.to}
            delayMs={flight.delayMs}
            durationMs={flight.durationMs}
            onDone={() => removeChipFlight(flight.id)}
          />
        ))}

        {/* opponents around the outside of the circle */}
        {opponents.map((p, idx) => {
          const pos = seatPos(idx, opponents.length);
          const visible = visiblePlayer(p);
          return (
            <View key={p.id} style={[styles.seatAbs, { left: pos.left, top: pos.top, width: SEAT_W }]} onLayout={idx === 0 ? (e) => growPod(e.nativeEvent.layout.height) : undefined}>
              <Seat
                player={visible}
                pal={pals[p.id] ?? palFromSeed(p.id)}
                isHuman={false}
                compact
                isCurrent={current?.id === p.id && !isShowdown}
                isDealer={dealerId === p.id}
                showBet={!isShowdown}
                showCards={(isShowdown || handsTabled) && !p.folded && remainingAtEnd > 1}
                back={settings.cardBack}
                showName={settings.showAvatarNames}
                handOff={showdownHand?.playerId === p.id}
                avatarSize={avatarSize}
                won={isShowdown && felt.winners.some((w) => w.playerId === p.id && w.amount > 0)}
                reaction={reactionFor(p.id)}
                idleMotion={settings.avatarIdleMotion && !animsOff}
                emote={visibleEmote(p.id)}
                dealKey={`${state.handNumber}`}
                dealAnimate={dealAnimate}
                dealDelay={dealDelay(p.id, 0)}
                dealStep={state.players.length * DEAL_STEP}
                dealFrom={{ x: dealOrigin.x - (pos.left + SEAT_W / 2), y: dealOrigin.y - pos.top }}
              />
            </View>
          );
        })}

        {/* human seat pinned to the bottom edge (outside the circle) */}
        <View style={[styles.humanSeatAbs]} onLayout={(e) => growHero(e.nativeEvent.layout.height)}>
          <Pressable onPress={() => { sound.play('tap'); navigation.navigate('Profile'); }} accessibilityRole="button" accessibilityLabel="Open your profile">
            <Seat
              player={visiblePlayer(human)}
              pal={pals[human.id] ?? profile.pal}
              isHuman
              isCurrent={isHumanTurn}
              isDealer={dealerId === human.id}
              showBet={!isShowdown}
              back={settings.cardBack}
              showName={settings.showAvatarNames}
              won={humanWon}
              reaction={reactionFor(human.id)}
              idleMotion={settings.avatarIdleMotion && !animsOff}
              emote={visibleEmote(human.id)}
            />
          </Pressable>
        </View>
      </View>

      {/* Your hand stays on the table when the hand ends. It used to be hidden
          here and reprinted inside the result panel, because the panel was tall
          enough to slice through it; the panel is now short enough that the real
          cards are simply left where they are, which is also what makes the
          reveal worth watching. */}
      <View
        style={[
          styles.humanCardRow,
          // Lifted just clear of the result panel, but never so far that the
          // cards climb back onto the felt.
          isShowdown && { marginBottom: Math.min(resultH - 96, 76) },
        ]}
      >
        {handHint && !human.folded ? (
          <View style={styles.handChip}>
            <Text style={styles.handChipText}>{handHint}</Text>
          </View>
        ) : isShowdown && human.folded && !humanCardsShown ? (
          <View style={styles.muckedChip}>
            <Text style={styles.muckedChipText}>Mucked</Text>
          </View>
        ) : null}
        <View style={styles.humanCards}>
          {(() => {
            // The hand you actually read, and the target of the peel gesture,
            // so it stays the same size from deal to showdown. It used to
            // shrink once the hand ended, to clear a result panel that was
            // tall enough to reach it; the panel is compact now and the row
            // lifts clear of it, so there is nothing left to make room for and
            // the cards shrinking just read as the hand being taken away.
            const cardW = width < 380 ? 76 : 86;
            // Out of the hand, or at a showdown where the hand is tabled, the
            // card is simply open - there is nothing left to protect. A hand
            // turned up for a run-out is open for the same reason, early.
            const openAlways = (isShowdown || handsTabled) && humanCardsShown;
            return (
              <HoleCards
                key={`h${state.handNumber}`}
                cards={human.holeCards.map((c) => ({ rank: c.rank, suit: c.suit as Suit }))}
                size={cardW}
                gap={10}
                animate={dealAnimate}
                delayFor={(i) => dealDelay(human.id, i)}
                // Showing is an act: the cards are peeled up and turned round
                // to face the table. Cards that are merely on show (auto-muck
                // off, and you won) just lie face up, because nobody did
                // anything to reveal them.
                showToTable={isShowdown && reveal === 'show'}
                forceOpen={openAlways && reveal !== 'show'}
                // thrown down from the middle of the felt, which sits above this row
                fromY={-(tableH * 0.5 + 40)}
                back={settings.cardBack}
                onPeek={() => sound.play('tap')}
              />
            );
          })()}
        </View>
        {human.folded && !isShowdown && (
          <Text style={styles.peekHint}>Folded · peel an edge or corner to look</Text>
        )}
        <View style={styles.emoteAnchor}>
          <EmoteBar onEmote={sendEmote} />
        </View>
      </View>

      <View style={styles.controls}>
        {isAwaitingOnlineState ? (
          <View style={styles.waiting}>
            <Text style={styles.waitingText}>Syncing live table…</Text>
            <Text style={styles.foldedNote}>No local bot actions are being played while the room connects.</Text>
          </View>
        ) : isShowdown ? (
          <Animated.View
            entering={FadeInUp.duration(motion.base).easing(Easing.bezier(...easings.out))}
            style={styles.resultCard}
            onLayout={(e) => setResultH(e.nativeEvent.layout.height)}
          >
            {/* Your cards are not repeated here: they are already on the table
                in front of you, and reprinting them turned the result card into
                a second, smaller copy of your hand competing with the real one. */}
            {/* Outcome and winnings share a row. The panel floats over the
                felt right where the hole cards are, so every line it costs is a
                line of your own hand you cannot see. */}
            <View style={styles.resultHead}>
              <Text style={styles.resultTitle} numberOfLines={1}>
                {humanWon ? '🎉 You win!' : remainingAtEnd === 1 && !human.folded ? 'You take it!' : 'Hand over'}
              </Text>
              {earned !== 0 && (
                <View style={styles.coinRow}>
                  <View style={styles.coin}><Text style={styles.coinT}>$</Text></View>
                  <Text style={[styles.coinEarned, earned < 0 && { color: colors.redDeep }]}>
                    {earned > 0 ? `+${earned}` : `${earned}`}
                  </Text>
                </View>
              )}
            </View>
            {state.winners.map((w) => {
              const p = state.players.find((pp) => pp.id === w.playerId);
              const name = p ? visiblePlayer(p).name : 'Player';
              return (
                <Text key={w.playerId} style={styles.resultLine} numberOfLines={1}>
                  {name} wins {w.amount.toLocaleString()}
                  {w.hand ? ` · ${handName(w.hand.category)}` : ''}
                </Text>
              );
            })}

            {!animsOff && (!roomCode || !firebaseOnline || isOnlineHost) && (
              <View style={{ marginTop: spacing.xs }}>
                <TurnTimer
                  seconds={10}
                  active
                  resetKey={`showdown-${state.handNumber}`}
                  onExpire={() => { setReveal((r) => (r === 'auto' ? 'muck' : r)); nextHand(); }}
                  label="Next hand in"
                />
              </View>
            )}

            {/* Mucking is the default, so this is a single opt-in toggle rather
                than a two-button choice, it also keeps the panel short enough
                not to slice through the hole cards above it. */}
            <View style={styles.muckRow}>
              <Pressable
                onPress={() => { sound.play('tap'); setReveal(humanCardsShown ? 'muck' : 'show'); }}
                style={[styles.muckBtn, humanCardsShown && styles.muckBtnActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: humanCardsShown }}
                accessibilityLabel={humanCardsShown ? 'Hide your cards' : 'Show your cards'}
              >
                <Text style={[styles.muckText, humanCardsShown && styles.muckTextActive]}>
                  {humanCardsShown ? 'Showing cards · tap to muck' : 'Mucked · tap to show'}
                </Text>
              </Pressable>
            </View>

            {lowChips && (
              <View style={{ marginTop: spacing.sm }}>
                <WiiButton label="Rebuy (free)" variant="gold" size="md" fullWidth onPress={rebuy} />
              </View>
            )}
            <View style={{ height: spacing.sm }} />
            <WiiButton
              label={roomCode && firebaseOnline && !isOnlineHost ? 'Waiting for host…' : 'Next Hand'}
              variant="green"
              size="lg"
              fullWidth
              disabled={!!roomCode && firebaseOnline && !isOnlineHost}
              onPress={nextHand}
            />
          </Animated.View>
        ) : legal && isHumanTurn ? (
          <View>
            <TurnTimer
              seconds={settings.turnTimerSec}
              active={isHumanTurn}
              resetKey={`${state.handNumber}:${state.street}:${state.currentPlayerIndex}`}
              startedAt={turnStartedAt}
              onExpire={onTimerExpire}
              warn
            />
            <ActionBar legal={legal} potSize={wageringPot} step={settings.bigBlind} onAction={onHumanAction} />
          </View>
        ) : (
          <View style={styles.waiting}>
            {current && !isShowdown ? (
              <TurnTimer
                seconds={settings.turnTimerSec}
                active
                resetKey={`${state.handNumber}:${state.street}:${state.currentPlayerIndex}`}
                startedAt={turnStartedAt}
                onExpire={onTimerExpire}
                label={`${currentActorName}'s turn`}
              />
            ) : null}
            <Text style={[styles.waitingText, !!runoutStatus && styles.runoutText]}>
              {runoutStatus ?? (current ? `Waiting for ${visiblePlayer(current).name}…` : 'Dealing…')}
            </Text>
            {human.folded && !isShowdown && (
              <Text style={styles.foldedNote}>You folded this hand</Text>
            )}
          </View>
        )}
      </View>

      {ADS_ENABLED ? <View style={styles.adWrap}><AdBanner /></View> : null}

      <LiveStatsPanel
        visible={statsOpen}
        onClose={() => setStatsOpen(false)}
        sessionHands={sessionHands}
        handHint={handHint}
        opponents={opponents.map((p) => ({ id: p.id, name: visiblePlayer(p).name }))}
        observed={observed}
      />
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  iconBtn: { width: 44, height: 44, borderRadius: radii.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.surfaceBorder, alignItems: 'center', justifyContent: 'center' },
  topRight: { minWidth: 44, flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
  safetyBtn: { width: 44, height: 44, borderRadius: radii.pill, backgroundColor: colors.red, borderWidth: 1, borderColor: colors.surfaceBorder, alignItems: 'center', justifyContent: 'center' },
  safetyBtnText: { fontFamily: fonts.bold, fontSize: 22, color: colors.onDark },
  potWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing.sm },
  potCenter: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.surfaceBorder, borderRadius: radii.pill, paddingHorizontal: spacing.lg, paddingVertical: 6 },
  potCenterLabel: { ...type.label, color: colors.onDarkMuted },
  potCenterValue: { fontFamily: fonts.bold, fontSize: 20, color: colors.onDark, ...numeric },
  roomPill: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.surfaceBorder, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minWidth: 44, alignItems: 'center' },
  roomText: { ...type.label, color: colors.onDarkSoft },
  // The gold win ring must not change the board's geometry, or every card
  // visibly jumps outward the moment a hand is won. The border is therefore
  // always present and merely changes colour.
  boardCardWrap: { marginHorizontal: 3, borderRadius: radii.sm + 2, borderWidth: 2, borderColor: 'transparent', padding: 1 },
  boardCardTight: { marginHorizontal: 2 },
  winCard: { borderColor: colors.gold, backgroundColor: 'rgba(214,180,92,0.16)' },
  handChip: { backgroundColor: colors.surfaceAlt, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, marginBottom: 6, borderWidth: 1, borderColor: colors.surfaceBorderStrong },
  handChipText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.onDark },
  muckedChip: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.surfaceBorder, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, marginBottom: 6 },
  muckedChipText: { fontFamily: fonts.medium, fontSize: 12, color: colors.onDarkSoft },
  friendsBanner: { marginHorizontal: spacing.lg, marginTop: spacing.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.surfaceBorder, borderRadius: radii.md, paddingVertical: 6, paddingHorizontal: spacing.md },
  friendsBannerText: { fontFamily: fonts.medium, fontSize: 11, color: colors.onDarkSoft, textAlign: 'center' },
  tableArea: { marginTop: spacing.xs, marginHorizontal: spacing.sm, position: 'relative' },
  feltOval: { position: 'absolute', top: 8, left: 8, right: 8, bottom: 8, borderRadius: 200, borderWidth: 10, borderColor: colors.feltRail, overflow: 'hidden' },
  // top-lit sliver along the inside of the rail, the single light source
  railHighlight: { position: 'absolute', top: 0, left: 0, right: 0, height: '38%', borderTopLeftRadius: 190, borderTopRightRadius: 190, backgroundColor: colors.feltRailEdge, opacity: 0.35 },
  // inner shadow where the felt meets the rail, so the surface reads as recessed
  feltInner: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 190, borderWidth: 14, borderColor: colors.feltInnerShadow, opacity: 0.55 },
  feltGlow: { position: 'absolute', alignSelf: 'center', top: '18%', width: 300, height: 300, borderRadius: 150, backgroundColor: colors.feltLight, opacity: 0.22 },
  centerZone: { position: 'absolute', left: 0, right: 0, alignItems: 'center', justifyContent: 'center', gap: 6 },
  // Width is set per-render from SEAT_W: it has to match the width `seatPos`
  // positions the pod with, or the pod sits off-centre by half the difference.
  seatAbs: { position: 'absolute', alignItems: 'center' },
  humanSeatAbs: { position: 'absolute', left: 0, right: 0, bottom: 2, alignItems: 'center' },
  board: { flexDirection: 'row', alignItems: 'center' },
  // The board always occupies five slots so the cards never jump sideways as
  // streets are dealt. The empty ones therefore have to be *visible*, as shallow
  // recesses in the cloth, or a 3- or 4-card board reads as being off-centre.
  cardSlot: { borderRadius: radii.sm, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', backgroundColor: 'rgba(0,0,0,0.22)' },
  handNamePill: { backgroundColor: 'rgba(214,180,92,0.18)', borderWidth: 1, borderColor: colors.gold, borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  handNameText: { ...type.label, color: colors.gold },
  // A peeled card swings well outside its own bounds, so this row has to sit
  // above the controls or the action bar paints over the lifted corner.
  humanCardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md, marginBottom: spacing.sm, minHeight: 142, zIndex: 41 },
  humanCards: { flexDirection: 'row' },
  peekHint: { fontFamily: fonts.medium, fontSize: 11, color: colors.onDarkSoft },
  emoteAnchor: { position: 'absolute', right: spacing.lg, bottom: 6 },
  controls: { flex: 1, paddingHorizontal: spacing.lg, minHeight: 140, justifyContent: 'flex-end' },
  waiting: { alignItems: 'center', paddingVertical: spacing.lg },
  waitingText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.onDarkSoft },
  // A run-out is the loudest moment in the hand, so its status line is the one
  // thing in this row that is allowed to shout.
  runoutText: { fontFamily: fonts.bold, fontSize: 17, color: colors.onDark, letterSpacing: 0.3 },
  foldedNote: { fontFamily: fonts.medium, fontSize: 12, color: colors.onDarkMuted, marginTop: spacing.xs },
  resultCard: { position: 'absolute', left: 0, right: 0, bottom: spacing.sm, marginHorizontal: spacing.lg, backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.surfaceBorder, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, zIndex: 40, ...shadows.panel },
  resultHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  resultTitle: { fontFamily: fonts.bold, fontSize: 17, color: colors.onDark, textAlign: 'center' },
  resultLine: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.onDarkSoft, textAlign: 'center', marginTop: 1, ...numeric },
  coinRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  coin: { width: 17, height: 17, borderRadius: 8.5, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.goldDeep },
  coinT: { fontFamily: fonts.bold, color: '#2A2210', fontSize: 11 },
  coinEarned: { fontFamily: fonts.bold, fontSize: 13, color: colors.gold, ...numeric },
  muckRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  muckBtn: { flex: 1, paddingVertical: spacing.sm, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.surfaceBorder, backgroundColor: colors.surfaceAlt, alignItems: 'center' },
  muckBtnActive: { borderColor: colors.blue, backgroundColor: 'rgba(47,159,212,0.16)' },
  muckText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.onDarkMuted },
  muckTextActive: { color: colors.blueLight },
  adWrap: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, paddingTop: spacing.xs },
});
