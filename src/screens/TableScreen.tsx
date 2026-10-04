import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, useWindowDimensions } from 'react-native';
import { showAlert } from '../components/alertBus';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Animated, { FadeInUp, Easing } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { ScreenBackground } from '../components/ScreenBackground';
import { ShowdownReveal } from '../components/ShowdownReveal';
import { CARD_ASPECT, feltWidthAt, fitBoardCard, layoutRevealHands, lostAtShowdown, selectShowdownHands } from '../game/showdownLayout';
import { seatRingSlot } from '../game/seatRing';
import { potFontSize } from '../game/chipStackLook';
import { pickMidGameSafe } from '../game/hostControls';
import { BOT_REACTION_INITIAL_MEMORY, maybeBotReaction } from '../game/botReactions';
import { SETTINGS_SCHEMA, availableSettingOptions, type GameSettings } from '../game/settings';
import { applyOutfit } from '../game/outfits';
import { applyRebuyRequest, canDealHand, localPlayerEvicted, playersToEvict, rebuyNotice, rebuyPhase } from '../game/rebuyWindow';
import { applyBlindLevel, blindsDue, isEliminated, tournamentWinner } from '../game/tournament';
import { blindsForMode, formatTournamentStatus, isTournamentMode, tournamentLevelForMode, tournamentTableStatus } from '../game/gameMode';
import { FeltSurface } from '../components/FeltSurface';
import { DealtCard } from '../components/DealtCard';
import { HoleCards } from '../components/HoleCards';
import type { Suit } from '../game/cardFace';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { Seat } from '../components/Seat';
import { ActionBar } from '../components/ActionBar';
import { WiiButton } from '../components/WiiButton';
import { CardFlipIcon, ChevronLeft, SettingsIcon, StatsIcon } from '../components/Icons';
import { AdBanner, ADS_ENABLED } from '../components/AdBanner';
import { TurnTimer } from '../components/TurnTimer';
import { LiveStatsPanel } from '../components/LiveStatsPanel';
import { EmoteBar, type Emote } from '../components/EmoteBar';
import { FlyingChipStack } from '../components/FlyingChipStack';
import { colors, fonts, radii, shadows, spacing, type, numeric, motion, easings } from '../theme/theme';
import { useApp } from '../state/AppContext';
import { sound } from '../services/sound';
import { chipSoundsFor, chipsCommitted } from '../game/betSound';
import {
  displayHoleCards,
  exposeHoleCard,
  exposureFromPublicCards,
  mergeHoleCardExposure,
  type HoleCardIndex,
  type HoleCardExposure,
} from '../game/holeCardExposure';
import { playerTapActions } from '../game/playerActions';
import { botShowsHand, canMuck, showdownOrder } from '../game/showdownOrder';
import {
  advanceReveal,
  awaitingChoiceFrom,
  pendingPlayer,
  revealComplete,
  startReveal,
} from '../game/showdownReveal';
import { resolveCardBack, resolveFelt } from '../game/cosmetics';
import { captureError } from '../services/telemetry';
import { palFromSeed, normalizePal, type PalConfig } from '../avatar/palConfig';
import { RootStackParamList } from '../navigation/types';
import { isResumable, resumedTurnStartedAt } from '../game/savedGame';
import { emptyObservedTable, observeTransition } from '../game/observedStats';
import { BOARD_THROW_MS, boardDealDelay } from '../game/boardDeal';
import { isRunningOut, runoutAction, runoutFelt, runoutLabel, runoutRunLabel, SHOWDOWN_STEP_MS, SHOW_CHOICE_MS } from '../game/runout';
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
  createGame, startHand, canStartHand, applyAction, legalActions, decideAction, handName, evaluateHand, compareHands, randomFloat, rerunShowdownFromSettled,
  type GameState, type PlayerAction, type PlayerInput,
} from '../engine';
import {
  agreedRuns,
  canRunItTwice,
  MAX_RUNS,
  votingComplete,
  type RunCount,
  type RunVote,
} from '../game/runItTwice';
import {
  endRoom,
  clearRebuyRequest,
  removePlayerFromRoom,
  getAuthUid,
  getCachedHostGame,
  isFirebaseConfigured,
  leaveRoom,
  publishHostGameState,
  pushAction,
  requestRebuy,
  voteRunItTwice,
  subscribeActions,
  subscribeRebuyRequests,
  sendEmoteToRoom,
  subscribeEmotes,
  exposeOwnCard,
  subscribeExposedCards,
  revealOwnHand,
  subscribeShownHands,
  subscribePrivateView,
  subscribeRoom,
  type RoomPrivateView,
  type RoomState,
} from '../services/firebase';

type Props = NativeStackScreenProps<RootStackParamList, 'Table'>;

const HUMAN_ID = 'me';

/**
 * The felt oval, as geometry rather than as decoration.
 *
 * The rail is drawn by `styles.feltOval`, and the board is sized from the
 * cloth inside it, so the two have to agree: a rail widened in the stylesheet
 * alone would quietly push the cards over it.
 */
const FELT_INSET = 4;
const FELT_RAIL = 10;
const BOT_NAMES = ['Ravi', 'Mika', 'Jules', 'Nina', 'Theo', 'Zoe', 'Kai', 'Lena'];
const DIFFS: Difficulty[] = ['easy', 'medium', 'hard', 'expert'];

const BOT_FOLD_EMOTES: Emote[] = [{ type: 'emoji', value: '😤' }, { type: 'text', value: 'Fold.' }, { type: 'emoji', value: '🙄' }];
const BOT_AGGRO_EMOTES: Emote[] = [{ type: 'emoji', value: '😎' }, { type: 'text', value: 'All in!' }, { type: 'emoji', value: '🔥' }];
const BOT_NEUTRAL_EMOTES: Emote[] = [{ type: 'emoji', value: '🤔' }, { type: 'emoji', value: '👍' }, { type: 'text', value: 'Hmm…' }];
const RUN_VOTE_MS = 8000;

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
  const { profile, recordHand, savedGame, saveGame, clearSavedGame, reportUser, blockUser, isBlocked, opponentHistory, absorbObservedTable, cosmetics, updateSettings } = app;
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
  /*
   * A longer felt.
   *
   * The old ceiling of 380 left obvious dead space below the seats on a
   * modern phone, because the proportion was tuned when the cap bound far
   * sooner. Raising both the share and the ceiling spreads the seats out and
   * gives the board room, and the floor still protects small screens.
   */
  const stageH = Math.round(Math.max(210, Math.min(470, winH * (winH < 750 ? 0.38 : 0.46))));

  // Resume support: use the saved game's settings/seed when resuming.
  // A friends game abandoned for >15s is not resumable.
  const resuming = !!route.params.resume && isResumable(savedGame);
  const settings = resuming && savedGame ? savedGame.settings : route.params.settings;
  const seed = resuming && savedGame ? savedGame.seed : route.params.seed;
  const roomCode = resuming && savedGame ? savedGame.roomCode : route.params.roomCode;
  const tournament = isTournamentMode(settings.gameMode);
  const [localTournamentStartedAt] = useState(() =>
    resuming && savedGame?.tournamentStartedAt && isTournamentMode(savedGame.settings.gameMode)
      ? savedGame.tournamentStartedAt
      : Date.now());
  const isFriends = !!roomCode;
  const firebaseOnline = isFriends && isFirebaseConfigured();
  const [room, setRoom] = useState<RoomState | null>(null);
  const [privateView, setPrivateView] = useState<RoomPrivateView | null>(null);
  const [onlinePlayerId, setOnlinePlayerId] = useState<string | null>(() => getAuthUid());
  const authRoomId = onlinePlayerId ?? getAuthUid();
  const isOnlineHost = !!firebaseOnline && !!room && !!authRoomId && room.hostId === authRoomId;
  const hasOnlinePublicState = !!firebaseOnline && !!room?.publicState;
  const tournamentStartedAt = tournament
    ? (roomCode ? room?.tournamentStartedAt ?? null : localTournamentStartedAt)
    : null;
  /*
   * Synced means the table has arrived, not that you personally hold cards.
   *
   * Requiring a private view treated anyone not dealt into the current hand,
   * someone busted, sitting out, or who joined after the deal, as still
   * connecting: they were shown "Connecting to the live table" over a table
   * that was in fact arriving perfectly well, and their turn handling was
   * suspended with it.
   */
  const onlineSyncActive = hasOnlinePublicState;
  const localPlayerId = firebaseOnline && authRoomId && (onlineSyncActive || !!getCachedHostGame(roomCode ?? ''))
    ? authRoomId
    : HUMAN_ID;

  const botSpeedMs = settings.botSpeed === 'fast' ? 550 : settings.botSpeed === 'slow' ? 1700 : 1050;
  const animsOff = settings.animationSpeed === 'off' || settings.reduceMotion;

  const pals = useMemo<Record<string, PalConfig>>(() => {
    /*
     * The outfit is applied here rather than at each seat, so every surface
     * that draws the local Pal draws the dressed one. Outfits were sold for
     * up to 5,000 coins while `equippedByCategory.outfits` was read nowhere
     * at all, so a bought outfit changed nothing.
     */
    const dressed = applyOutfit(profile.pal, cosmetics.equippedByCategory.outfits);
    const map: Record<string, PalConfig> = { [HUMAN_ID]: dressed, [localPlayerId]: dressed };
    for (let i = 0; i < settings.numOpponents; i++) map[`bot-${i}`] = palFromSeed(`bot-${i}-${seed}`);
    Object.values(room?.players ?? {}).forEach((player) => {
      if (player.id !== localPlayerId) {
        // Their own Pal if the room carries it, so the face at the table
        // matches the one in the friends list rather than a doodle from an id.
        let pal: PalConfig | undefined;
        if (player.palJson) {
          try { pal = normalizePal(JSON.parse(player.palJson) as Partial<PalConfig>); } catch { pal = undefined; }
        }
        map[player.id] = pal ?? palFromSeed(player.palSeed || player.id);
      }
    });
    return map;
  }, [profile.pal, cosmetics.equippedByCategory.outfits, settings.numOpponents, seed, localPlayerId, room?.players]);

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
    /*
     * A table that can never deal must not take the app down with it.
     *
     * startHand throws when fewer than two seats have chips, which a room
     * reaches on its own: a guest busts, or a saved game is resumed after one.
     * createGame throws on a config it cannot normalise. Both used to escape
     * this useState initialiser and land on the error boundary, so the player
     * got a red screen with engine text instead of being told the table was
     * finished. Returning an undealt game leaves handNumber at 0, which the
     * effect below turns into a plain "Table over".
     */
    try {
      const openingBlinds = blindsForMode(settings.gameMode, settings);
      const game = createGame(
        {
          ...openingBlinds,
          startingStack: settings.startingStack,
          maxPlayers: Math.max(settings.numOpponents + 1, settings.maxPlayers),
          turnTimerSec: settings.turnTimerSec,
        },
        players,
        seed,
      );
      try {
        return startHand(game);
      } catch (error) {
        captureError(error, { tags: { area: 'table', operation: 'start-first-hand' } });
        return game;
      }
    } catch (error) {
      captureError(error, { tags: { area: 'table', operation: 'create-game' } });
      // Nothing about the requested table was usable, so stand up the
      // smallest valid one purely so there is a state to render the message
      // over. It has one seat, so it can never deal, which is the point.
      return createGame(
        { smallBlind: 1, bigBlind: 2, startingStack: 100, maxPlayers: 2, turnTimerSec: 30 },
        [{ id: HUMAN_ID, name: profile.name }],
        seed,
      );
    }
  });
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  /*
   * The table could not deal its very first hand.
   *
   * handNumber only stays at 0 when the initialiser above caught startHand
   * refusing, which means fewer than two seats had chips before a card was
   * dealt: a room that emptied, or a saved game resumed after someone busted.
   * There is no hand to show and no way to make one, so say so and leave
   * rather than render a dead table. Checking handNumber rather than
   * canStartHand matters, because players go to zero chips legitimately when
   * they are all in and a live hand must not be mistaken for a finished one.
   */
  const announcedDeadTable = useRef(false);
  useEffect(() => {
    if (state.handNumber !== 0 || announcedDeadTable.current) return;
    announcedDeadTable.current = true;
    showAlert(
      tournament ? 'Tournament over' : 'Table over',
      tournament
        ? 'There are not enough players with chips to start this tournament.'
        : 'There are not enough players with chips to deal a hand.',
      [
        {
          text: 'Back to menu',
          onPress: () => {
            clearSavedGame();
            navigation.replace('Home');
          },
        },
      ],
    );
  }, [state.handNumber, navigation, clearSavedGame, tournament]);

  useEffect(() => {
    if (!roomCode || !firebaseOnline) {
      return undefined;
    }

    // Just the state. Reacting to an ended room lives in one effect below,
    // so a guest is not told twice and the host is not told about its own
    // decision.
    const unsubRoom = subscribeRoom(roomCode, setRoom);
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

    /*
     * Hydrate whether or not there is a private view.
     *
     * Gating on one meant anybody holding no cards this hand, someone busted,
     * sitting out, or who joined after the deal, never took another update and
     * sat frozen watching a hand that had finished. hydrateGameState already
     * copes with an absent view by giving that player no hole cards, which is
     * exactly right: they are watching, not playing.
     */
    setState(hydrateGameState(room.publicState, privateView));
  }, [firebaseOnline, isOnlineHost, privateView, room?.publicState, roomCode]);

  useEffect(() => {
    // Deliberately not gated on the cached host game. That read is not
    // reactive and was not in the dependency list, so a single early run with
    // no cache meant the host never subscribed at all and never retried. The
    // callback below already falls back to the live state, and the lobby now
    // holds the host back until its game exists, so subscribing here is safe.
    if (!roomCode || !firebaseOnline || !isOnlineHost) {
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

        publishHostGameState(roomCode, result.state)
          .then((r) => noteSync(r.ok))
          .catch((error) => {
            noteSync(false);
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
  const [runoutRunIndex, setRunoutRunIndex] = useState(0);
  const [runVotes, setRunVotes] = useState<Record<string, RunCount>>({});
  const [runVoteClosed, setRunVoteClosed] = useState(false);
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [codeShown, setCodeShown] = useState(false);
  /** Which player the stats panel opens on, set by tapping their seat. */
  const [statsFocus, setStatsFocus] = useState<string | null>(null);
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

  /*
   * Fold this table's observations into the long view when the table is done.
   *
   * Once on unmount rather than continuously, so that while you are still
   * sitting there "Previous" means strictly before this game and the two tabs
   * cannot quietly converge into the same numbers. Bots and your own seat are
   * filtered out by the store, since a bot id is regenerated per table.
   */
  const observedRef = useRef(observed);
  observedRef.current = observed;
  useEffect(() => () => {
    absorbObservedTable(observedRef.current.counters);
  }, [absorbObservedTable]);
  useEffect(() => {
    // React runs effects twice in development; skipping a state we have already
    // folded in keeps every count honest.
    if (observedFrom.current === state) return;
    const prev = observedFrom.current;
    observedFrom.current = state;
    setObserved((t) => observeTransition(t, prev, state));
  }, [state]);
  const [reveal, setReveal] = useState<'auto' | 'show' | 'muck'>('auto');
  const [localCardExposure, setLocalCardExposure] = useState<HoleCardExposure>([false, false]);
  const [area, setArea] = useState({ w: width, h: 0 });
  // Pod heights are measured, but kept as *high-water marks*: a pod grows and
  // shrinks as bet chips and "Folded" tags come and go, and the community lane
  // is derived from them, so taking the running maximum is what stops the board
  // and pot drifting up and down mid-hand.
  const [podH, setPodH] = useState(78);
  /*
   * Null until the hero's pod has been laid out once.
   *
   * This used to start at 96, which was a guess, and `growHero` only ever
   * raises it, so the guess became a floor the table could never get back
   * under. The real pod is nearer 60, and the lane is measured from this, so
   * the board spent the whole session paying for forty points of felt nobody
   * was standing on. Starting from the first real measurement keeps the
   * high-water behaviour that stops the lane jumping, without inventing the
   * number it starts from.
   */
  const [heroH, setHeroH] = useState<number | null>(null);
  const growPod = useCallback((h: number) => setPodH((prev) => (h > prev ? h : prev)), []);
  const growHero = useCallback((h: number) => setHeroH((prev) => (prev === null || h > prev ? h : prev)), []);
  /** The pod's height before it has ever been measured, near enough to start. */
  const heroPodH = heroH ?? 96;
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
    // Reactions used to stop here, so the bubble appeared over your own seat
    // and the person it was aimed at never saw a thing. Voided rather than
    // awaited: a reaction that fails to send must not interrupt a hand.
    if (roomCode && firebaseOnline) void sendEmoteToRoom(roomCode, emote);
  }, [localPlayerId, showEmote, roomCode, firebaseOnline]);

  useEffect(() => {
    if (!roomCode || !firebaseOnline) return undefined;
    return subscribeEmotes(roomCode, (playerId, raw) => {
      if (playerId === localPlayerId) return;
      showEmote(playerId, {
        type: raw.type as Emote['type'],
        value: raw.value,
        ...(raw.anim ? { anim: raw.anim as Emote['anim'] } : {}),
      });
    });
  }, [roomCode, firebaseOnline, localPlayerId, showEmote]);

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
  const runResults = state.runResults?.length ? state.runResults : null;
  const runCount = runResults?.length ?? 1;
  const activeRunIndex = Math.min(runoutRunIndex, runCount - 1);
  const activeRunBoard = runResults?.[activeRunIndex]?.board ?? state.board;
  const activeRunBoardLength = activeRunBoard.length;
  const runResetBoardLength = useMemo(() => {
    if (!runResults || runResults.length < 2) return 0;
    let prefix = 0;
    while (prefix < 5) {
      const firstCard: GameState['board'][number] | undefined = runResults[0]?.board[prefix];
      if (!firstCard) break;
      const allMatch = runResults.every((run) => {
        const card = run.board[prefix];
        return !!card && card.rank === firstCard.rank && card.suit === firstCard.suit;
      });
      if (!allMatch) break;
      prefix += 1;
    }
    return prefix;
  }, [runResults]);
  const runningOut = isRunningOut({ street: state.street, board: activeRunBoard }, revealedBoard);
  const showingRunout = handOver && !resultsOpen && (tabledHand || runningOut || runCount > 1);

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
    () => (showingRunout ? runoutFelt(state, revealedBoard, activeRunIndex) : state),
    [state, showingRunout, revealedBoard, activeRunIndex],
  );

  /*
   * Which seat is mine.
   *
   * In a room this is the account and nothing else. It used to fall back to
   * the generic local id and then to whoever happened to be sitting first,
   * which was fine for a local game and wrong in every way for a room: when
   * the host left and sync dropped, a guest stopped finding their own seat,
   * fell through both fallbacks, and was rendered as the host. They were shown
   * the host's stack, the host's hand name, and would have been shown the
   * host's cards. A seat that cannot be found is not a seat to borrow.
   */
  const localSeat = felt.players.find((p) => p.id === localPlayerId);
  const notSeated = !!roomCode && !localSeat;
  const human = localSeat
    ?? (roomCode
      ? felt.players[0]!
      : felt.players.find((p) => p.id === HUMAN_ID) ?? felt.players[0]!);
  /*
   * Bots reacting to what just happened.
   *
   * Gated on the reaction being a *bot's*: in an online room the other seats
   * are real people who send their own, and a local phone puppeting them
   * would be inventing messages nobody wrote.
   *
   * `humanActionElapsedMs` is deliberately not passed, so the "human is
   * tanking" situation never fires. It would need a timer ticking every
   * second purely to decide whether to post a shrug, which is a re-render a
   * second for a joke. Everything that happens at a showdown works from the
   * state transition alone.
   */
  const botReactionMemory = useRef(BOT_REACTION_INITIAL_MEMORY);
  const botReactionFrom = useRef<GameState | null>(null);
  useEffect(() => {
    const previous = botReactionFrom.current;
    botReactionFrom.current = state;
    if (animsOff || !previous || previous === state) return;

    const nowMs = Date.now();
    for (const player of state.players) {
      if (!player.id.startsWith('bot-')) continue;
      const decision = maybeBotReaction(
        {
          state,
          previousState: previous,
          botId: player.id,
          nowMs,
          humanPlayerId: human.id,
          botDifficulty: botDiff[player.id],
          includeFreeReactions: true,
        },
        botReactionMemory.current,
      );
      botReactionMemory.current = decision.memory;
      if (decision.emote) showEmote(player.id, decision.emote as Emote);
    }
  }, [state, animsOff, human.id, botDiff, showEmote]);

  const current = felt.players[felt.currentPlayerIndex];
  const isAwaitingOnlineState = !!roomCode && firebaseOnline && !onlineSyncActive;
  const isHumanTurn = current?.id === human?.id && !handOver && !isAwaitingOnlineState;
  /*
   * Nobody is on the clock when the player to act cannot act.
   *
   * An all-in player has no decision left, so running a countdown over them
   * made the hand appear to be waiting on a choice that did not exist, and
   * the board only moved once the clock expired.
   */
  const actorCanAct = !!current && current.chips > 0 && !current.allIn && !current.folded;
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
  const contestingPlayers = useMemo(
    () => state.players.filter((p) => p.holeCards.length > 0 && !p.folded && !p.sittingOut),
    [state.players],
  );
  const runVotePossible =
    handOver &&
    !state.runResults &&
    !runVoteClosed &&
    state.board.length > revealedBoard &&
    canRunItTwice({ contesting: contestingPlayers, boardLength: revealedBoard });
  const runVoteChoices = room?.runVotes;
  const runVotesForDecision = useMemo<RunVote[]>(
    () => contestingPlayers.map((p) => ({
      playerId: p.id,
      isBot: p.isBot,
      choice: runVotes[p.id] ?? runVoteChoices?.[p.id]?.choice ?? null,
    })),
    [contestingPlayers, runVotes, runVoteChoices],
  );
  const runVoteHasHuman = runVotesForDecision.some((vote) => !vote.isBot);
  const runVotingActive = runVotePossible && runVoteHasHuman;
  const humanRunVote = runVotesForDecision.find((vote) => vote.playerId === human.id && !vote.isBot);
  const runVoteCanAnswer = runVotingActive && !!humanRunVote && humanRunVote.choice === null;
  /*
   * A hand only has losers if somebody stayed to be beaten. When everyone
   * folds the pot is simply uncontested, and painting the folders red would
   * claim their cards lost when nobody ever saw them.
   */
  const contestedShowdown = isShowdown && remainingAtEnd > 1 && felt.board.length === 5;
  const seatLost = (p: { id: string; folded?: boolean; sittingOut?: boolean; holeCards: unknown[] }) =>
    lostAtShowdown(p, felt.winners, { contested: contestedShowdown });

  /**
   * What the table is waiting on while a board runs out, or null when it is not
   * running one. Covers the beat after the river too, which is still part of the
   * wait even though there are no cards left to deal.
   */
  const baseRunoutStatus = runoutLabel(revealedBoard, activeRunBoardLength);
  const activeRunLabel = runoutRunLabel(activeRunIndex, runCount);
  const runoutStatus = runningOut || (handOver && tabledHand)
    ? activeRunLabel
      ? `${activeRunLabel} · ${baseRunoutStatus.replace(/^All in · /, '')}`
      : baseRunoutStatus
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

  /*
   * The showdown, walked in order rather than flipped all at once.
   *
   * Who shows first is a real rule: the last player to bet the river has to
   * back the claim up, and if it was checked through it starts left of the
   * button. Everyone after them decides having already seen what is face up,
   * which is the only reason the order is worth having.
   */
  const revealOrder = useMemo(
    () =>
      showdownOrder({
        players: felt.players,
        dealerIndex: felt.dealerIndex,
        lastAggressorIndex: felt.lastAggressorIndex ?? null,
        winnerIds: felt.winners.filter((w) => w.amount > 0).map((w) => w.playerId),
      }),
    [felt.players, felt.dealerIndex, felt.lastAggressorIndex, felt.winners],
  );
  const [revealProgress, setRevealProgress] = useState(startReveal);
  /** Hands already face up, which is what the layout below is allowed to show. */
  const revealShown = contestedShowdown ? revealProgress.shown : undefined;

  /*
   * Whether the human's cards are visible to the table.
   *
   * At a contested showdown this is no longer a setting, it is the answer they
   * gave when their turn came round: auto-muck decides what happens when they
   * say nothing, and the order decides whether they were ever asked. A hand
   * turned up for a run-out is already public and nothing can put it back.
   */
  const humanCardsShown = handsTabled && !human.folded
    ? true
    : contestedShowdown
      ? revealProgress.shown.includes(human.id)
      : isShowdown
        ? reveal === 'show' || (reveal === 'auto' && !settings.autoMuck && humanWon)
        : true;
  const exposedCardsForPlayer = useCallback(
    (playerId: string) => room?.publicState?.players?.[playerId]?.exposedHoleCards,
    [room?.publicState],
  );
  const cardExposureForPlayer = useCallback(
    (playerId: string): HoleCardExposure => {
      const published = exposureFromPublicCards(exposedCardsForPlayer(playerId));
      return playerId === human.id ? mergeHoleCardExposure(published, localCardExposure) : published;
    },
    [exposedCardsForPlayer, human.id, localCardExposure],
  );
  const humanCardExposure = cardExposureForPlayer(human.id);

  /**
   * The hand that gets laid out in the middle at showdown: the winner's two hole
   * cards, which are flipped, lifted and pushed across to join the board so all
   * seven cards are on show and the best five can be ringed.
   *
   * Null when the pot was won without a showdown (everybody folded): there is
   * no hand to lay out, and the winner is entitled to keep it hidden.
   */
  const showdownHands = useMemo(() => {
    if (!isShowdown) return [];
    return selectShowdownHands(felt.winners, felt.players, {
      localPlayerId: human.id,
      localCardsShown: humanCardsShown,
      label: (w) => handName(w.hand!.category),
      contested: contestedShowdown,
      shownIds: revealShown,
      cardExposure: cardExposureForPlayer,
    });
  }, [isShowdown, felt.winners, felt.players, human.id, humanCardsShown, contestedShowdown, revealShown, cardExposureForPlayer]);
  /** The first hand laid out, which is what drives the single-winner layout. */
  const showdownHand = showdownHands[0] ?? null;

  /*
   * Start every hand with nothing shown, so the previous showdown's decisions
   * cannot leak into the next one.
   */
  useEffect(() => {
    setRevealProgress(startReveal());
    setLocalCardExposure([false, false]);
    setRunoutRunIndex(0);
    setRunVotes({});
    setRunVoteClosed(false);
  }, [felt.handNumber]);

  /** Whether a hand is still unbeaten by anything already face up. */
  const stillBestAgainstShown = useCallback(
    (playerId: string): boolean => {
      const me = felt.players.find((p) => p.id === playerId);
      if (!me || me.holeCards.length < 2 || felt.board.length < 5) return true;
      const mine = evaluateHand([...me.holeCards, ...felt.board]);
      return !revealProgress.shown.some((id) => {
        const other = felt.players.find((p) => p.id === id);
        if (!other || other.holeCards.length < 2) return false;
        return compareHands(evaluateHand([...other.holeCards, ...felt.board]), mine) > 0;
      });
    },
    [felt.players, felt.board, revealProgress.shown],
  );

  const awaitingShowChoice =
    isShowdown && contestedShowdown && awaitingChoiceFrom(revealOrder, revealProgress, human.id);

  /*
   * Do not hold the table up forever waiting for an answer.
   *
   * Auto-muck decides what silence means, which is exactly what that setting
   * is for: on, a hand nobody has to see goes in the muck; off, it gets
   * tabled. Either way the next player stops waiting.
   */
  useEffect(() => {
    if (!awaitingShowChoice) return undefined;
    const timer = setTimeout(() => {
      setRevealProgress((prev) => advanceReveal(revealOrder, prev, !settings.autoMuck));
    }, SHOW_CHOICE_MS);
    return () => clearTimeout(timer);
  }, [awaitingShowChoice, revealOrder, settings.autoMuck]);

  const answerShowChoice = (show: boolean) => {
    sound.play('tap');
    setRevealProgress((prev) => advanceReveal(revealOrder, prev, show));
    if (show && roomCode && firebaseOnline) void revealOwnHand(roomCode);
  };

  const promptExposeCard = useCallback(() => {
    sound.play('tap');
    const shown = humanCardExposure;
    showAlert('Show one card', 'The whole table will see it, and you cannot take it back.', [
      ...(shown[0] ? [] : [{ text: 'Show left card', onPress: () => exposeCardToTable(0) }]),
      ...(shown[1] ? [] : [{ text: 'Show right card', onPress: () => exposeCardToTable(1) }]),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
    // exposeCardToTable is declared below and is stable, so it is safe to omit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [humanCardExposure]);

  const exposeCardToTable = useCallback((index: HoleCardIndex) => {
    sound.play('tap');
    setLocalCardExposure((prev) => exposeHoleCard(prev, index));
    if (!roomCode || !firebaseOnline) return;
    exposeOwnCard(roomCode, index).then((ok) => {
      if (ok) return;
      showAlert('Card not shown', 'The table could not publish that card. Check your connection and try again.', [
        { text: 'OK', style: 'cancel' },
      ]);
    });
  }, [roomCode, firebaseOnline]);

  const applyRunDecision = useCallback((runs: RunCount) => {
    if (roomCode && firebaseOnline && !isOnlineHost && runs > 1) return;
    setRunVoteClosed(true);
    if (runs === 1) return;

    const source = stateRef.current ?? state;
    const next = rerunShowdownFromSettled(source, runs, revealedBoard);
    stateRef.current = next;
    setRunoutRunIndex(0);
    setState(next);
    if (roomCode && firebaseOnline && isOnlineHost) {
      publishHostGameState(roomCode, next)
        .then((r) => noteSync(r.ok))
        .catch((error) => {
          noteSync(false);
          captureError(error, { tags: { area: 'firebase-room-sync', operation: 'publish-run-count' } });
        });
    }
  }, [firebaseOnline, isOnlineHost, revealedBoard, roomCode, state]); // eslint-disable-line react-hooks/exhaustive-deps

  const finishRunVote = useCallback((defaultMissing: boolean) => {
    if (!runVotingActive) return;
    const votes = runVotesForDecision.map((vote) => ({
      ...vote,
      choice: vote.choice ?? (defaultMissing ? 1 : null),
    }));
    if (!votingComplete(votes)) return;
    applyRunDecision(agreedRuns(votes));
  }, [applyRunDecision, runVotesForDecision, runVotingActive]);

  const chooseRunCount = useCallback((choice: RunCount) => {
    sound.play('tap');
    setRunVotes((prev) => ({ ...prev, [human.id]: choice }));
    if (!roomCode || !firebaseOnline) return;
    voteRunItTwice(roomCode, choice)
      .then((result) => {
        if (result.ok) return;
        showAlert('Vote not sent', result.reason ?? 'Your run count vote could not be sent. Check your connection and try again.', [
          { text: 'OK', style: 'cancel' },
        ]);
      })
      .catch((error) => {
        captureError(error, { tags: { area: 'firebase-room-sync', operation: 'vote-run-it-twice' } });
        showAlert('Vote not sent', 'Your run count vote could not be sent. Check your connection and try again.');
      });
  }, [firebaseOnline, human.id, roomCode]);

  useEffect(() => {
    if (runVotingActive && votingComplete(runVotesForDecision)) {
      finishRunVote(false);
    }
  }, [finishRunVote, runVotesForDecision, runVotingActive]);

  /*
   * Step through the order, pausing on anyone who has an actual decision.
   *
   * Bots behave like players who would rather not be laughed at: they table a
   * hand that is still winning and throw away one that is already beaten by
   * something face up. The pause between hands is what makes it read as a
   * showdown rather than as a reveal.
   */
  useEffect(() => {
    if (!isShowdown || !contestedShowdown) return undefined;
    if (revealComplete(revealOrder, revealProgress)) return undefined;
    const pending = pendingPlayer(revealOrder, revealProgress);
    if (pending === null) return undefined;
    if (pending === human.id && canMuck(revealOrder, pending)) return undefined;

    const timer = setTimeout(() => {
      setRevealProgress((prev) => {
        const at = pendingPlayer(revealOrder, prev);
        if (at === null || at !== pending) return prev;
        const show =
          at === human.id
            ? true // forced: a winner or the player who made the claim
            : botShowsHand({ order: revealOrder, playerId: at, stillBest: stillBestAgainstShown(at) });
        return advanceReveal(revealOrder, prev, show);
      });
    }, SHOWDOWN_STEP_MS);
    return () => clearTimeout(timer);
  }, [
    isShowdown,
    contestedShowdown,
    revealOrder,
    revealProgress,
    human.id,
    stillBestAgainstShown,
  ]);

  /*
   * Checking, folding and putting chips in each sound like themselves.
   *
   * Betting, raising and shoving all played the same single chip clack as a
   * call, so the table sounded identical whether somebody called 20 or moved
   * all in, and you had to be looking at the screen to know which. Raising now
   * gets its own rising run of chips. Calling keeps the plain clack, because a
   * call really is the small version of the same act.
   */
  /**
   * What an action sounds like.
   *
   * Folding and checking have their own cue, and checking is a knock on the
   * table, which is what checking is. Everything else moves money, so it
   * sounds like money: coins, and more of them the bigger the bet is next to
   * the pot it is going into. A quarter-pot nudge is one coin and a shove is
   * a handful, which is the same comparison a player is already making.
   */
  const actionSound = (action: PlayerAction, amount?: number, actorId?: string) => {
    if (action === 'fold') { sound.play('fold'); return; }
    if (action === 'check') { sound.play('check'); return; }
    const actor = state.players.find((p) => p.id === (actorId ?? state.players[state.currentPlayerIndex]?.id));
    const chips = chipsCommitted({
      action,
      amount,
      playerBet: actor?.currentBet ?? 0,
      playerChips: actor?.chips ?? 0,
      tableBet: state.currentBet,
    });
    /*
     * The pot as it stands before this bet joins it, taken from `state` rather
     * than the rendered `felt` so the ratio cannot be measured against a pot
     * the animation has not caught up to yet.
     */
    sound.playChips(chipSoundsFor(chips, totalCommittedChips(state)));
  };

  /**
   * What the table is still showing.
   *
   * The pause before the next player moves is a pause to read the *last*
   * action, so it has to know what that action was. Kept in a ref rather than
   * state because nothing renders from it and a re-render for pacing would be
   * a re-render of the whole table.
   */
  const lastAction = useRef<PlayerAction | null>(null);
  const step = useCallback((action: PlayerAction, amount?: number, actorId?: string) => {
    lastAction.current = action;
    setState((prev) => {
      const id = actorId ?? prev.players[prev.currentPlayerIndex]?.id;
      if (!id) return prev;
      const res = applyAction(prev, id, action, amount);
      return res.ok ? res.state : prev;
    });
  }, []);

  const onHumanAction = (action: PlayerAction, amount?: number) => {
    if (action === 'fold' && settings.confirmFoldWhenCheckAvailable && legal?.actions.includes('check')) {
      showAlert('Fold this hand?', 'You can check for free. Are you sure you want to fold?', [
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
    actionSound(action, amount, human.id);

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
        /*
         * Only offer to retry something that retrying could fix.
         *
         * A refused permission is a decision, not a hiccup, so re-sending the
         * identical write produces the identical refusal. Offering Retry for
         * it turned one rejected bet into an unbounded loop of the same
         * dialog, which is how the sequence bug presented: not as "betting is
         * broken" but as a popup that would not go away.
         */
        const permanent = /permission[ _]denied/i.test(reason);
        showAlert(
          'Action not sent',
          permanent
            ? 'The table refused that action. It may have already moved on, so reopen the room and try again.'
            : reason,
          permanent
            ? [{ text: 'OK', style: 'cancel' }]
            : [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Retry', onPress: () => doHumanAction(action, amount) },
              ],
        );
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

  /*
   * The banner only earns its space when it has something to say.
   *
   * A working online table said "Room DP8E, live synced table" directly under
   * a header already showing #DP8E, which is the room code twice and a fact
   * the player can see for themselves from the table moving. Everything else
   * here is a real state worth interrupting for.
   */
  /*
   * A failed publish used to be swallowed into telemetry, so the table simply
   * stopped syncing and the two devices drifted apart with nothing on screen
   * to say so. If the host cannot publish, say so on the host's own screen.
   */
  const [syncFailed, setSyncFailed] = useState(false);
  const noteSync = useCallback((ok: boolean) => setSyncFailed(!ok), []);

  const tableNotice = useMemo(() => {
    if (syncFailed) return 'The table could not be published. Other players may be seeing an older hand.';
    if (!firebaseOnline) return `Room ${roomCode} · practice vs bots, live friend play needs Firebase setup`;
    if (room?.status === 'ended') return `Room ${roomCode} ended, host disconnected or left`;
    if (!onlineSyncActive) return 'Connecting to the live table…';
    return null;
  }, [firebaseOnline, onlineSyncActive, room?.status, roomCode, syncFailed]);

  /*
   * Leave the felt when the table is genuinely over.
   *
   * A guest used to be left sitting at a dead room with "waiting for host"
   * under it, because the only thing that noticed the room had ended was a
   * banner. Nothing was going to happen: the host had gone. Told once, then
   * taken back rather than stranded.
   */
  const evicted = useRef(false);
  useEffect(() => {
    if (!roomCode || isOnlineHost || room?.status !== 'ended' || evicted.current) return;
    evicted.current = true;
    clearSavedGame();
    showAlert('Table closed', room?.endedReason || 'The host ended this table.', [
      { text: 'Back to menu', onPress: () => navigation.replace('Home') },
    ]);
  }, [room?.status, room?.endedReason, roomCode, isOnlineHost]); // eslint-disable-line react-hooks/exhaustive-deps

  /*
   * Republish when somebody tables their hand.
   *
   * The reveal flag lives on the room, but the hole cards only reach anyone
   * through the published public state, so the host has to redact and publish
   * again once the flag changes. Host only: nobody else may publish.
   */
  useEffect(() => {
    if (!roomCode || !firebaseOnline || !isOnlineHost) return undefined;
    return subscribeShownHands(roomCode, () => {
      const current = getCachedHostGame(roomCode) ?? stateRef.current;
      if (!current || current.street !== 'showdown') return;
      publishHostGameState(roomCode, current)
        .then((r) => noteSync(r.ok))
        .catch((error) => {
          noteSync(false);
          captureError(error, { tags: { area: 'firebase-room-sync', operation: 'publish-after-reveal' } });
        });
    });
  }, [roomCode, firebaseOnline, isOnlineHost, noteSync]);

  /*
   * Republish when somebody exposes one card during the hand.
   *
   * The room node carries only the chosen slot. The host still owns the actual
   * cards and is the only device allowed to place that card into public state.
   */
  useEffect(() => {
    if (!roomCode || !firebaseOnline || !isOnlineHost) return undefined;
    return subscribeExposedCards(roomCode, () => {
      const current = getCachedHostGame(roomCode) ?? stateRef.current;
      if (!current) return;
      publishHostGameState(roomCode, current)
        .then((r) => noteSync(r.ok))
        .catch((error) => {
          noteSync(false);
          captureError(error, { tags: { area: 'firebase-room-sync', operation: 'publish-after-card-exposure' } });
        });
    });
  }, [roomCode, firebaseOnline, isOnlineHost, noteSync]);

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
    } else if (isOnlineHost && roomCode) {
      /*
       * A remote player who has run out of time.
       *
       * Nobody was handling this: the branch above covers the local human and
       * bots, and a real opponent fell through to nothing, so the clock hit
       * zero and the table simply stopped. The host has to act for them,
       * because it owns the authoritative game and is the only participant
       * that can move a hand on without that player's cooperation.
       *
       * It cannot be pushed as an action: pushAction signs as the sender, and
       * the rules quite rightly refuse one player acting as another. So it is
       * applied directly and published, exactly as an arriving intent is.
       */
      /*
       * An all-in player has nothing left to decide, so there is no action to
       * force and no reason for a clock to be running over them. Bailing out
       * without publishing anything would leave the table waiting on somebody
       * who cannot act, which is the stall this is meant to prevent.
       */
      const options = legalActions(state, actor.id);
      if (options.actions.length === 0) return;
      const type = options.actions.includes('check') ? 'check' : 'fold';
      const result = applyHostIntent(state, actor.id, { type });
      if (!result.ok) return;
      stateRef.current = result.state;
      setState(result.state);
      publishHostGameState(roomCode, result.state)
        .then((r) => noteSync(r.ok))
        .catch((error) => {
          noteSync(false);
          captureError(error, { tags: { area: 'firebase-room-sync', operation: 'publish-after-timeout' } });
        });
    }
  }, [handOver, state, legal, botDiff, settings.difficulty, step, isOnlineHost, roomCode]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentActorName = current?.id === human.id
    ? 'You'
    : current
      ? isBlocked(current.id) ? 'Blocked player' : current.name
      : undefined;

  const rebuy = () => {
    if (tournament) {
      showAlert('No rebuy', 'Tournament players are eliminated when they run out of chips.');
      return;
    }

    if (roomCode && firebaseOnline && !isOnlineHost) {
      requestRebuy(roomCode)
        .then((result) => {
          if (result.ok) {
            sound.play('coins');
            return;
          }
          showAlert('Rebuy not sent', result.reason ?? 'Your rebuy request could not be sent. Check your connection and try again.');
        })
        .catch((error) => {
          captureError(error, { tags: { area: 'firebase-room-sync', operation: 'request-rebuy' } });
          showAlert('Rebuy not sent', 'Your rebuy request could not be sent. Check your connection and try again.');
        });
      return;
    }

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
    if (runVotingActive) return undefined;
    const action = runoutAction({
      handOver,
      animationsOff: animsOff,
      revealed: revealedBoard,
      boardLength: activeRunBoardLength,
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
        const timer = setTimeout(() => {
          if (activeRunIndex < runCount - 1) {
            setRunoutRunIndex((currentRun) => currentRun + 1);
            setRevealedBoard(runResetBoardLength);
            return;
          }
          setResultsOpen(true);
        }, action.delayMs);
        return () => clearTimeout(timer);
      }
      default:
        return undefined;
    }
  }, [
    activeRunBoardLength,
    activeRunIndex,
    animsOff,
    handOver,
    revealedBoard,
    resultsOpen,
    runCount,
    runResetBoardLength,
    runVotingActive,
    tabledHand,
  ]);

  // Follows the felt rather than the engine, so during a run-out each street is
  // dealt with a sound as it lands instead of all five at once.
  useEffect(() => {
    if (revealedBoard > prevBoard.current) sound.play('deal');
    prevBoard.current = revealedBoard;
  }, [revealedBoard]);

  useEffect(() => {
    /*
     * Whose turn it is, audibly.
     *
     * Only your own turn made a sound, so the table was silent while waiting
     * and there was no way to tell from audio that play had moved on at all.
     * The two cues are deliberately inverted, rising for you and falling for
     * everyone else, so they are distinguishable without being compared.
     */
    if (isHumanTurn) sound.play('turn');
    else if (current && !handOver) sound.play('turnOther');
    // Keyed on who is to act, not on whether it is you. Keying on the latter
    // meant play passing between two opponents made no sound at all, because
    // the flag never changed.
  }, [current?.id, isHumanTurn, handOver]); // eslint-disable-line react-hooks/exhaustive-deps

  const shouldSaveLocalState = !roomCode || !firebaseOnline || isOnlineHost;

  // Persist the active game for resume-after-leaving. Debounced to avoid disk
  // thrash (state changes many times/sec during bot sequences). Full state is
  // kept so a mid-hand resume is correct; this snapshot is local-only.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The latest snapshot, so the unmount flush below writes current data without
  // re-subscribing the effect on every state change.
  const snapshot = useRef({ state, settings, seed, roomCode, turnStartedAt, shouldSaveLocalState, tournamentStartedAt });
  snapshot.current = { state, settings, seed, roomCode, turnStartedAt, shouldSaveLocalState, tournamentStartedAt };
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
        ...(tournamentStartedAt !== null ? { tournamentStartedAt } : {}),
      });
    }, 600);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [state, turnStartedAt, shouldSaveLocalState, tournamentStartedAt]); // eslint-disable-line react-hooks/exhaustive-deps

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
    // Chips are played on a stagger, so leaving mid-rattle would otherwise
    // carry the sound onto whatever screen comes next.
    sound.stopChips();
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
      ...(s.tournamentStartedAt !== null ? { tournamentStartedAt: s.tournamentStartedAt } : {}),
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Drive bots on their turn.
  useEffect(() => {
    if (handOver) return;
    const actor = state.players[state.currentPlayerIndex];
    if (roomCode && firebaseOnline) return;
    if (!actor || actor.id === human.id || !actor.isBot) return;
    /*
     * Measured from the last action rather than fixed, so a bet is left on
     * the felt long enough to be read before the next player answers it. A
     * check or a fold keeps the short beat; the table should not dawdle over
     * nothing happening.
     */
    const delayMs = botSpeedMs + actionReadDelayMs(animsOff, lastAction.current);
    botTimer.current = setTimeout(() => {
      const decision = decideAction(state, actor.id, botDiff[actor.id] ?? settings.difficulty);
      actionSound(decision.action, decision.amount, actor.id);
      // Occasionally a bot reacts, so the table feels alive both ways.
      const emoteRoll = randomFloat(`${String(seed)}:emote:${state.handNumber}:${actor.id}:${state.log.length}`);
      if (emoteRoll > 0.9) {
        const pool = decision.action === 'fold' ? BOT_FOLD_EMOTES
          : decision.action === 'raise' || decision.action === 'allin' ? BOT_AGGRO_EMOTES
          : BOT_NEUTRAL_EMOTES;
        showEmote(actor.id, pool[Math.floor(emoteRoll * 997) % pool.length]);
      }
      step(decision.action, decision.amount, actor.id);
    }, delayMs);
    return () => {
      if (botTimer.current) clearTimeout(botTimer.current);
    };
  }, [state, isShowdown, step, botDiff, settings.difficulty, botSpeedMs, animsOff, showEmote, seed]);

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
    /*
     * Gated on being in a room, rather than on `firebaseOnline`.
     *
     * `firebaseOnline` is a configuration check, not a connection state, so
     * this reads the same either way today; being in a room is simply the
     * thing that actually matters, and it cannot be confused for one.
     *
     * The bogus "Table over" was never this condition. It came from a
     * disconnected player being marked sittingOut, which took them out of
     * every future hand and left the table with one live player. That is
     * fixed in applyConnectionStatusToGameState; the guard below is the
     * second line of defence.
     */
    if (roomCode && !isOnlineHost) {
      // The button is hidden for guests, so reaching here means a stray tap.
      return;
    }

    /*
     * Only the local, offline game can decide a table is finished from its own
     * player list. In a room the roster is authoritative and someone being
     * briefly absent is not the same as being out.
     */
    /*
     * A rebuy still on the clock is not a finished table.
     *
     * The auto-advance timer calls in here the moment a hand ends, so without
     * this the table declared itself over and offered only "Back to menu"
     * while the rebuy window underneath was still counting down, which is a
     * straight contradiction: the player was told to leave and invited to stay
     * at the same time. The window decides; when it expires, the eviction
     * effect takes over.
     */
    if (rebuyState.phase === 'waiting') return;
    /*
     * An expired window belongs to the eviction effect, which has its own
     * message about the clock running out. Falling through would put a second
     * alert on top of that one, and iOS would queue both, so the player
     * dismisses "you ran out of time" only to be told "table over" as well.
     */
    if (localPlayerEvicted(rebuyState, human.id)) return;

    const active = state.players.filter((p) => p.chips > 0 && !p.sittingOut);
    const roomSeated = Object.keys(room?.players ?? {}).length;
    const endTable = (title: string, message: string, roomReason = message) => {
      showAlert(title, message, [
        {
          text: 'Back to menu',
          onPress: () => {
            if (roomCode && firebaseOnline && isOnlineHost) {
              endRoom(roomCode, roomReason).catch(() => {});
            }
            clearSavedGame();
            navigation.replace('Home');
          },
        },
      ]);
    };

    if (tournamentWinnerId) {
      const name = tournamentWinnerPlayer?.name ?? 'A player';
      endTable(
        'Tournament over',
        tournamentWinnerId === human.id
          ? 'You won the tournament! 🎉'
          : `${name} won the tournament.`,
        `${name} won the tournament.`,
      );
      return;
    }
    if (humanEliminated && !isOnlineHost) {
      showAlert('Out of tournament', 'You are out of chips, so your tournament is over.', [
        { text: 'Back to menu', onPress: () => { clearSavedGame(); navigation.replace('Home'); } },
      ]);
      return;
    }
    if (active.length < 2 && (!roomCode || roomSeated < 2)) {
      /*
       * Who actually ran out matters. This said "Everyone else is out" to a
       * player who had just busted with chips still in front of the opponent,
       * which is the exact opposite of what had happened.
       */
      endTable(
        tournament ? 'Tournament over' : 'Table over',
        tournament
          ? 'The tournament cannot continue because fewer than two players have chips.'
          : human.chips > 0 ? 'You cleaned up! 🎉' : 'You are out of chips.',
      );
      return;
    }
    /*
     * A room with seats still filled but fewer than two stacks left.
     *
     * The check above deliberately lets a room through, because an absent
     * player is not an out player and the roster is what decides. But nobody
     * can be dealt in without chips, so falling through called startHand
     * anyway and it threw: the host got the error boundary the moment their
     * last opponent busted. Say what happened instead.
     */
    if (!canStartHand(state)) {
      endTable(
        tournament ? 'Tournament over' : 'Table over',
        tournament
          ? 'The tournament cannot continue because fewer than two players have chips.'
          : human.chips > 0
            ? 'Everyone else is out of chips.'
            : 'You are out of chips.',
      );
      return;
    }
    if (!tournament && human.chips <= 0) {
      showAlert('Out of chips', 'Rebuy for free and keep playing?', [
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
      /*
       * Last line of defence. This runs inside a state updater, so anything
       * thrown here tears down the tree and shows the error boundary. The
       * guards in nextHand catch the situations a table actually reaches; if
       * one is ever missed, hold the current hand rather than crash.
       */
      const dueLevel = tournamentLevelForMode({
        mode: settings.gameMode,
        startedAt: tournamentStartedAt,
        now: Date.now(),
      });
      const ready = dueLevel && blindsDue(prev.config, dueLevel.level)
        ? applyBlindLevel(prev, dueLevel.level)
        : prev;
      if (!canStartHand(ready)) return prev;
      let next: GameState;
      try {
        next = startHand(ready);
      } catch (error) {
        captureError(error, { tags: { area: 'table', operation: 'start-next-hand' } });
        return prev;
      }
      if (roomCode && firebaseOnline && isOnlineHost) {
        publishHostGameState(roomCode, next)
          .then((r) => noteSync(r.ok))
          .catch((error) => {
            noteSync(false);
            captureError(error, { tags: { area: 'firebase-room-sync', operation: 'publish-next-hand' } });
          });
      }
      return next;
    });
  };

  const leave = () => {
    if (roomCode && firebaseOnline) {
      showAlert(
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
                .finally(() => {
                  /*
                   * The room is gone, so the saved game pointing at it is a
                   * shortcut on the home screen to a table that no longer
                   * exists. Offline games are deliberately kept, because
                   * resuming one is the whole point of saving it.
                   */
                  clearSavedGame();
                  navigation.replace('Home');
                });
            },
          },
        ],
      );
      return;
    }

    showAlert('Leave table?', 'Your game is saved. You can resume it from the home screen.', [
      { text: 'Stay', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => navigation.replace('Home') },
    ]);
  };

  const opponents = felt.players.filter((p) => p.id !== human.id);
  const dealerId = state.players[state.dealerIndex]?.id;
  /*
   * The community cards carry the hand, so they get the space.
   *
   * This is a ceiling rather than a size: the board is clamped against the
   * width of the cloth and the height of the lane further down, and on every
   * phone tried so far one of those two is what actually decides. It is set
   * above both deliberately, so that raising the ceiling is never the thing
   * standing between the board and the felt it has room for.
   */
  const cardSize = width < 380 ? 68 : 76;

  /*
   * The cloth this table is played on.
   *
   * Read from the game's settings rather than from the player, so an online
   * room looks the same to everyone sitting at it: the host's settings travel
   * with the room, and a felt is a property of the table. Falls back to the
   * classic green for anything unowned or unrecognised.
   */
  const feltPalette = resolveFelt({
    setting: settings.feltStyle,
    equippedId: cosmetics.equippedByCategory.tables,
    owned: cosmetics.ownedCosmeticIds,
  });
  /*
   * Same rule for the deck. The store sold five card backs that changed
   * nothing, because the setting only ever held one of the five built-in
   * names and no purchase could reach it.
   */
  const cardBack = resolveCardBack({
    setting: settings.cardBack,
    equippedId: cosmetics.equippedByCategory.cardBacks,
    owned: cosmetics.ownedCosmeticIds,
  });
  const [tournamentNow, setTournamentNow] = useState(() => Date.now());
  useEffect(() => {
    if (!tournament || tournamentStartedAt === null) return undefined;
    const timer = setInterval(() => setTournamentNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [tournament, tournamentStartedAt]);
  const tournamentStatus = useMemo(
    () => tournamentTableStatus({
      mode: settings.gameMode,
      startedAt: tournamentStartedAt,
      now: tournamentNow,
      currentBlinds: state.config,
    }),
    [settings.gameMode, tournamentStartedAt, state.config, tournamentNow],
  );
  const tournamentStatusText = tournamentStatus ? formatTournamentStatus(tournamentStatus) : null;
  const tournamentWinnerId = tournament ? tournamentWinner(state.players) : null;
  const tournamentWinnerPlayer = tournamentWinnerId
    ? state.players.find((p) => p.id === tournamentWinnerId)
    : null;
  const humanEliminated = tournament && isEliminated(human, true) && (handOver || human.holeCards.length === 0);
  const lowChips = !tournament && human.chips < state.config.bigBlind * 5;

  /*
   * Waiting on a rebuy, with a clock on it.
   *
   * A hand needs two players holding chips. When somebody busts the table used
   * to simply stop, saying only that it was waiting, with no sign of what for
   * or for how long, which was forever. Now the wait is named and bounded, and
   * whoever does not take the rebuy is shown out rather than left holding a
   * seat nobody can play against.
   *
   * `openedAt` is set when a hand first fails to start, not when a stack hits
   * zero, so busting on the final hand does not start a clock nobody is
   * watching.
   */
  const [rebuyOpenedAt, setRebuyOpenedAt] = useState<number | null>(null);
  const [rebuyTick, setRebuyTick] = useState(0);
  const tableBlocked = !tournament && handOver && !canDealHand(state.players);

  useEffect(() => {
    if (!tableBlocked) {
      if (rebuyOpenedAt !== null) setRebuyOpenedAt(null);
      return undefined;
    }
    if (rebuyOpenedAt === null) {
      setRebuyOpenedAt(Date.now());
      return undefined;
    }
    // One second is the resolution the countdown is displayed at, so polling
    // faster only burns renders.
    const timer = setInterval(() => setRebuyTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, [tableBlocked, rebuyOpenedAt]);

  const rebuyState = useMemo(
    () => rebuyPhase({ players: state.players, openedAt: rebuyOpenedAt, now: Date.now(), tournament }),
    // rebuyTick is the clock: it exists only to re-evaluate this on the second.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.players, rebuyOpenedAt, rebuyTick, tournament],
  );
  const rebuyMessage = rebuyNotice(rebuyState, human.id);
  const mustRebuy = rebuyState.phase === 'waiting' && rebuyState.players.some((p) => p.id === human.id);

  useEffect(() => {
    if (!roomCode || !firebaseOnline || !isOnlineHost) {
      return undefined;
    }

    return subscribeRebuyRequests(roomCode, (request) => {
      const currentState = getCachedHostGame(roomCode) ?? stateRef.current;
      if (!currentState) return;
      const clearHandledRequest = () => {
        clearRebuyRequest(roomCode, request.playerId).catch((error: unknown) => {
          captureError(error, { tags: { area: 'firebase-room-sync', operation: 'clear-rebuy-request' } });
        });
      };

      const decision = applyRebuyRequest({
        players: currentState.players,
        playerId: request.playerId,
        startingStack: currentState.config.startingStack,
        windowOpen: currentState.street === 'showdown' && !canDealHand(currentState.players),
        openedAt: rebuyOpenedAt,
        now: Date.now(),
        tournament,
      });

      if (decision.status === 'applied') {
        const next = { ...currentState, players: decision.players };
        stateRef.current = next;
        setState(next);
        publishHostGameState(roomCode, next)
          .then((r) => {
            noteSync(r.ok);
            if (r.ok) clearHandledRequest();
          })
          .catch((error) => {
            noteSync(false);
            captureError(error, { tags: { area: 'firebase-room-sync', operation: 'publish-after-rebuy' } });
          });
      } else if (decision.status === 'rejected') {
        captureError(new Error(`rebuy-request-${decision.reason}`), {
          tags: { area: 'firebase-room-sync', operation: 'reject-rebuy-request' },
        });
        clearHandledRequest();
      } else {
        clearHandledRequest();
      }
    });
  }, [firebaseOnline, isOnlineHost, noteSync, rebuyOpenedAt, roomCode, tournament]);

  /*
   * The window closed.
   *
   * Two different things happen, and confusing them would throw somebody out
   * of a table they were still playing at: being evicted yourself is a
   * navigation, and somebody else being evicted is a seat opening up. Only the
   * host can act on the room, for the same reason it deals.
   */
  const evictionHandled = useRef<number | null>(null);
  useEffect(() => {
    if (rebuyState.phase !== 'expired') {
      evictionHandled.current = null;
      return;
    }
    if (evictionHandled.current === state.handNumber) return;
    evictionHandled.current = state.handNumber;

    if (localPlayerEvicted(rebuyState, human.id)) {
      sound.play('lose');
      showAlert(
        'Out of chips',
        'You ran out of time to rebuy, so your seat has been freed up. Thanks for playing!',
        [{ text: 'Back to menu', onPress: () => { clearSavedGame(); navigation.replace('Home'); } }],
      );
      return;
    }

    if (roomCode && firebaseOnline && isOnlineHost) {
      for (const p of playersToEvict(state.players, tournament)) {
        removePlayerFromRoom(roomCode, p.id).catch((error: unknown) => {
          captureError(error, { tags: { area: 'firebase-room-sync', operation: 'evict-no-rebuy' } });
        });
      }
    }
    /*
     * Offline, a bot that cannot pay is simply dropped from the table rather
     * than navigated anywhere, and the hand can then be dealt.
     */
    if (!roomCode) {
      setState((prev) => ({
        ...prev,
        players: prev.players.filter((p) => p.chips > 0 || p.id === human.id),
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rebuyState, human.id, roomCode, isOnlineHost, state.handNumber]);

  const visiblePlayer = useCallback(
    (player: GameState['players'][number]) =>
      isBlocked(player.id) ? { ...player, name: 'Blocked player' } : player,
    [isBlocked],
  );
  const visibleEmote = useCallback((playerId: string): Emote | null =>
    isBlocked(playerId) ? null : emotes[playerId] ?? null, [emotes, isBlocked]);

  const reportTablePlayer = async (player: GameState['players'][number]) => {
    const result = await reportUser(player.id, player.name, 'table', roomCode);
    showAlert(
      result.ok ? 'Report sent' : 'Could not report',
      // Says what reporting actually did. It also cuts the line between you,
      // so they can no longer notify you, and someone should not have to
      // guess at that.
      result.reason || `Thanks. ${player.name} can no longer send you notifications.`,
    );
  };

  const confirmBlockTablePlayer = (player: GameState['players'][number]) => {
    showAlert('Block player?', `${player.name} will not be able to send you friend requests, and you will leave this table.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: async () => {
          const result = await blockUser(player.id, player.name);
          if (!result.ok) {
            showAlert('Could not block', result.reason || 'Try again in a moment.');
            return;
          }
          // Blocking someone and then being left sitting at their table is not
          // a block in any sense the player would recognise, so leaving is
          // part of the action rather than a suggestion afterwards.
          if (roomCode && firebaseOnline) {
            const away = isOnlineHost
              ? endRoom(roomCode, 'Host left the table.')
              : leaveRoom(roomCode, human.id).then(() => ({ ok: true }));
            away
              .catch((error) => {
                captureError(error, { tags: { area: 'firebase-room-sync', operation: 'leave-after-block' } });
              })
              .finally(() => navigation.replace('Home'));
          } else {
            navigation.replace('Home');
          }
        },
      },
    ]);
  };

  const openPlayerSafety = (player: GameState['players'][number]) => {
    const actions = playerTapActions({
      self: player.id === human.id,
      bot: !!player.isBot,
      showLiveStats: settings.showLiveStats,
    });
    if (actions.length === 0) return;
    const openStats = () => { setStatsFocus(player.id); setStatsOpen(true); };
    // Nothing to choose between, so do not make them choose.
    if (actions.length === 1 && actions[0] === 'stats') { openStats(); return; }
    showAlert(isBlocked(player.id) ? 'Blocked player' : player.name, undefined, [
      ...(actions.includes('stats') ? [{ text: 'View stats', onPress: openStats }] : []),
      ...(actions.includes('report')
        ? [{ text: 'Report offensive content', onPress: () => reportTablePlayer(player) }]
        : []),
      ...(actions.includes('block')
        ? [{
            text: 'Block and leave table',
            style: 'destructive' as const,
            onPress: () => confirmBlockTablePlayer(player),
          }]
        : []),
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
  /*
   * Packed rather than placed on a fixed arc. The arithmetic, and the proof
   * that no two pods can touch at any seat count on any screen, is in
   * `src/game/seatRing.ts`.
   */
  const seatPos = (idx: number, n: number) =>
    seatRingSlot({
      index: idx,
      count: n,
      width: area.w,
      height: stageH,
      podWidth: SEAT_W,
      podHeight: podH,
    });

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
  const laneBottom = heroPodH + 6;

  /*
   * How much cloth there actually is.
   *
   * The board used to take a flat 82% of the table area, which was a guess
   * made against one phone and then left alone: it put the five cards well
   * inside the rail with a band of empty felt either side, and shrank them to
   * pay for space nothing was using.
   *
   * The felt's geometry is knowable, so it is derived instead. It is an oval,
   * which means width is a function of height: a row under the board has less
   * of it than a row on the waist, and sizing both against the waist is how
   * the winning hands ended up drawn over the rail.
   */
  const clothOval = {
    width: Math.max(0, area.w - 2 * (FELT_INSET + FELT_RAIL)),
    height: Math.max(0, stageH - 2 * (FELT_INSET + FELT_RAIL)),
    centreY: stageH / 2,
  };
  const cloth = (y: number) => feltWidthAt(y, clothOval);

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
  /*
   * The board is always five cards wide.
   *
   * It used to grow to seven at showdown so the winner's hole cards had
   * somewhere to land, which made every card on the table smaller to show two
   * more: at seven across a phone the pips stop being countable. The winning
   * hand now gets a row of its own underneath instead, so the board is never
   * charged for it. `boardBox` is measured rather than derived so the flight
   * targets are exact instead of arithmetic guesses about margins and borders.
   */
  const layingOut = !!showdownHand;
  const BOARD_CELLS = 5;
  /*
   * What a board cell costs on top of the card itself, both sides added up:
   * the 2pt gold win ring, and nothing else.
   *
   * This was 10, which bought a 1pt inset inside the ring and a 2pt margin
   * outside it. Across five cells that is 30pt of felt spent on gaps, which
   * is half a card. The ring reads perfectly well sitting straight on the
   * card edge, and it still leaves 4pt between one card face and the next.
   */
  const CELL_PAD = 4;
  /** The gold win ring, top and bottom, which a card carries at every size. */
  const CARD_FRAME = 4;
  const POT_BLOCK_H = 40; // pot pill plus the gap above it
  const REVEAL_GAP = 8; // breathing room between the board and the hands below it
  /*
   * The winning hands sit smaller than the board. They are the supporting
   * evidence rather than the thing everyone is reading, and the board, the
   * hands and the hero's pod all have to come out of the same strip of felt,
   * so the hands are what gives way.
   */
  const REVEAL_SHRINK = 0.76;
  /*
   * What the hero's pod takes at a showdown.
   *
   * This was a hardcoded 50, on the reasoning that once the bets are swept
   * the pill is only avatar, name and chips. The pill is indeed about 50pt,
   * but it is not the bottom of the pod: a bet slot is reserved *beneath* it
   * whether or not there is a bet, deliberately, so the pod never changes
   * height mid hand. The pod is pinned by its bottom edge, so an empty slot
   * does not give the row 28pt of room, it pushes the pill 28pt *up* into
   * the felt the row wanted. Reserving 50 therefore ran the tabled hands
   * straight through the hero's name and chips, measured at 28pt of overlap
   * on an iPhone 17.
   *
   * `laneBottom` is the measured pod plus its margin, which is the only
   * number that cannot be wrong about this. It is a high-water mark, which
   * costs a few points when a bet chip has been out, and that is the correct
   * direction to be wrong in.
   */
  const heroShowdownH = laneBottom;
  const laneH = Math.max(0, stageH - laneTop - laneBottom);
  /*
   * At a showdown the board sits at the very top of the lane.
   *
   * It used to start 28pt lower, under a pill naming the winning hand. That
   * pill said what the result panel underneath already says, and it was
   * charging the one row that cannot afford it: everything below the board
   * has to clear the hero's pod, and the hands being tabled were landing on
   * top of it. The felt says who won now, in gold and red, so the words were
   * the cheapest thing to give up.
   */
  /**
   * How far below the lane's top the board sits while a hand is being played.
   *
   * A small, fixed inset rather than a centred position, so the row is in the
   * same place on every street no matter what else on the table changed size.
   */
  const BOARD_PIN_TOP = 10;
  const boardTopFor = (_showdown: boolean) => laneTop;
  /*
   * How tall a board card may be.
   *
   * Mid-hand it is the lane, less the pot block beneath it. At a showdown the
   * lane is the wrong measure: the winning hands are placed absolutely rather
   * than flowing inside it, and the hero's pod shrinks once the bets are
   * swept, so the real limit is the run from the board's top edge down to
   * that pod, shared between the two rows in proportion.
   */
  const boardMaxH = layingOut
    ? Math.max(28 * CARD_ASPECT,
      (stageH - boardTopFor(true) - heroShowdownH - REVEAL_GAP - CARD_FRAME) / (1 + REVEAL_SHRINK))
    : Math.max(28 * CARD_ASPECT, laneH - POT_BLOCK_H);
  /*
   * A touch smaller than a card is dealt at: the showdown board sits above a
   * second row of cards rather than empty felt, and the pair of them read
   * better slightly trimmed than filling the lane edge to edge.
   */
  const boardShrink = layingOut ? 0.88 : 1;
  /*
   * Where the row's bottom edge lands for a card of a given size, which is
   * what decides how much cloth it has. Mid-hand the board and the pot are
   * centred in the lane together; at a showdown the board is pinned to the
   * top of it with the winning hands beneath.
   */
  const boardRowBottom = (size: number) => {
    const h = size * CARD_ASPECT + CARD_FRAME;
    if (layingOut) return boardTopFor(true) + h;
    /*
     * Pinned, not centred.
     *
     * This used to centre the board in the lane, and the lane is measured up
     * from the hero's pod, so anything that changed the pod's height slid the
     * board with it. The pod no longer resizes mid hand, but centring would
     * still move the row for any other reason the lane changed. Putting the
     * five cards at a fixed offset means laying hands underneath them is the
     * only thing that ever moves them, which is the one time it should.
     */
    return laneTop + BOARD_PIN_TOP + h;
  };
  const sdCardSize = fitBoardCard({
    cells: BOARD_CELLS,
    cellPad: CELL_PAD,
    ceiling: Math.min(cardSize * boardShrink, boardMaxH / CARD_ASPECT),
    minSize: 28,
    rowBottom: boardRowBottom,
    widthAt: cloth,
  });
  const cellW = boardBox.w > 0 ? boardBox.w / BOARD_CELLS : sdCardSize + CELL_PAD;
  /*
   * At a showdown the board's own geometry is derived, not measured.
   *
   * `boardBox` is a frame behind: the first render of a showdown still holds
   * the mid-hand measurement, so the row below was told the board was taller
   * and lower than it had just become, and the clamp, correctly, shrank the
   * tabled hands to nothing for one frame. The showdown board is pinned to
   * the top of the lane at a size this render already knows, so there is
   * nothing to wait for a measurement to learn.
   */
  const boardTop = layingOut ? boardTopFor(true) : laneTop + boardBox.y;
  const boardBottom = layingOut
    ? boardTop + sdCardSize * CARD_ASPECT + CARD_FRAME
    : boardTop + boardBox.h;

  /** Where a winner's cards start their journey: the middle of their pod. */
  const revealFrom = useCallback((playerId: string) => {
    const idx = opponents.findIndex((p) => p.id === playerId);
    if (idx < 0) return { x: area.w / 2, y: Math.max(0, stageH - heroPodH / 2) };
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
  }, [opponents, area.w, stageH, heroPodH]);

  /*
   * One row holding every winning hand, beneath the board.
   *
   * The pot is awarded by the time a hand is tabled, so its block is not
   * rendered and the felt below the board is free. The row is sized by width
   * rather than by the lane, because the lane between the seats and the hero
   * is only about one card tall: stacking a split pot into it shrank both
   * hands to the legibility floor and still ran the lower one onto the hero.
   * Side by side, two hands are four cards under a five card board, so they
   * keep the size a single winner gets.
   */
  const revealTop = boardBottom + REVEAL_GAP;
  const revealSize = Math.floor(sdCardSize * REVEAL_SHRINK);
  const revealHands = layingOut
    ? layoutRevealHands({
      count: showdownHands.length,
      centreX: boardBox.x + boardBox.w / 2,
      top: revealTop,
      preferredSize: revealSize,
      // The cloth at the row's own height, not the board's. The oval has
      // narrowed by the time it gets down here, and giving the row the
      // board's width is what drew the outside hands over the rail.
      availableW: cloth(revealTop + (revealSize * CARD_ASPECT) / 2),
      // The felt below the board, which the awarded pot has vacated, less the
      // hero's own pod.
      //
      // Two faults, one line. It used to run to 8pt from the bottom of the
      // stage, which is straight through the pod sitting there, and it was
      // floored at `revealSize * CARD_ASPECT`, which guaranteed the height
      // offered was at least the height wanted. So the clamp could never
      // bind, and a backstop that cannot fire is not one. The budget above
      // keeps this generous in the ordinary case; this is what catches the
      // cases the budget did not foresee.
      availableH: Math.max(0, stageH - revealTop - heroShowdownH),
      playerIds: showdownHands.map((h) => h.playerId),
    })
    : [];
  const highlightFor = (hand: { hole: ({ rank: number; suit: string } | null)[] }) =>
    hand.hole.map((c) => !!c && winningCardKeys.has(`${c.rank}${c.suit}`));

  /**
   * Community cards are pitched in from the dealer's spot like the hole cards,
   * rather than fading in on the spot. They arrive already face-up (`noFlip`),
   * a dealer turns the flop as it's placed, and a mid-air flip here reads as the
   * board "changing" rather than being dealt.
   */
  const boardThrowFrom = (i: number) => {
    const offsetFromCentre = (i - (BOARD_CELLS - 1) / 2) * cellW;
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
        seatPoint = heroSeatChipPoint(area.w, stageH, heroPodH);
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
    heroPodH,
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

  /*
   * No seat here any more.
   *
   * Reached when the room's state no longer holds this player: the host ended
   * the table, or removed them from it. Every hook above has already run, so
   * this is only a question of what to draw, and the answer is not the table.
   * Rendering it would mean rendering somebody else's hand.
   */
  if (notSeated) {
    return (
      <ScreenBackground variant="felt" edges={['top', 'bottom']}>
        <View style={styles.notSeated}>
          <Text style={styles.notSeatedTitle}>You are no longer at this table</Text>
          <Text style={styles.notSeatedBody}>
            The host ended the table or your seat was taken. Your chips and stats are safe.
          </Text>
          <WiiButton
            label="Back to menu"
            variant="green"
            size="lg"
            onPress={() => { clearSavedGame(); navigation.replace('Home'); }}
          />
        </View>
      </ScreenBackground>
    );
  }

  const canExposeHoleCards = !handOver && !human.folded && human.holeCards.length >= 2;

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
        {/* The room code moved into the table menu behind the gear. It sat
            here on every hand of every friends game, holding the crown of the
            seat arc down to clear it, to show four characters that matter
            once: when you are inviting someone. */}
        {tournamentStatusText ? (
          <View style={[styles.roomPill, styles.tournamentPill]}>
            <Text style={styles.roomText} numberOfLines={1}>{tournamentStatusText}</Text>
          </View>
        ) : null}
        {/* The red "!" that used to sit here asked the player to pick someone
            from a list before it could do anything, which is the wrong way
            round: you already know who you mean, you are looking at them.
            Safety now lives behind tapping the player, where the intent
            starts. */}
        <View style={styles.topRight}>
          {settings.showLiveStats && (
            <Pressable onPress={() => { sound.play('tap'); setStatsFocus(null); setStatsOpen(true); }} style={[styles.iconBtn, shadows.soft]} hitSlop={8} accessibilityRole="button" accessibilityLabel="Open live stats">
              <StatsIcon size={22} color={colors.blueLight} />
            </Pressable>
          )}
        </View>
      </View>

      {isFriends && tableNotice && (
        <View style={styles.friendsBanner}>
          <Text style={styles.friendsBannerText}>{tableNotice}</Text>
        </View>
      )}

      <View style={[styles.tableArea, { height: stageH }]} onLayout={(e) => setArea({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        {/* felt oval: matte surface, top-lit rail edge, inner shadow at the rail */}
        <LinearGradient
          colors={[feltPalette.light, feltPalette.base, feltPalette.deep]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={[styles.feltOval, shadows.raised]}
          pointerEvents="none"
        >
          {/* woven cloth + suit watermark (CC0 / MIT sources).
              The oval is inset on every side of the table area and its rail
              border sits inside that, so the cloth fills what's left (see
              `feltInnerW`). */}
          <FeltSurface width={clothOval.width} height={clothOval.height} />
          <View style={styles.railHighlight} pointerEvents="none" />
          <View style={styles.feltInner} pointerEvents="none" />
          <View style={styles.feltGlow} pointerEvents="none" />
        </LinearGradient>

        {/* Community cards + pot, centred in the lane between the seat arc and
            the hero pod (see `laneTop`/`laneBottom`). */}
        {/* Centred mid-hand, but pinned to the top of the lane at a showdown:
            the lane then carries a second row of cards under the board, and
            centring the pair of them pushed the lower row onto the hero. */}
        <View
          style={[
            styles.centerZone,
            { top: laneTop, bottom: laneBottom },
            layingOut && styles.centerZoneTop,
          ]}
          pointerEvents="box-none"
        >
          <View style={styles.board} onLayout={(e) => setBoardBox({ x: e.nativeEvent.layout.x, y: e.nativeEvent.layout.y, w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
            {Array.from({ length: BOARD_CELLS }).map((_, i) => {
              const card = felt.board[i];
              if (!card) {
                return (
                  <View key={i} style={styles.boardCardWrap}>
                    <View style={[styles.cardSlot, { width: sdCardSize, height: sdCardSize * 1.42 }]} />
                  </View>
                );
              }
              const highlighted = isShowdown && winningCardKeys.has(`${card.rank}${card.suit}`);
              return (
                <View key={`card-${i}-${card.rank}${card.suit}`} style={[styles.boardCardWrap, highlighted && styles.winCard]}>
                  <DealtCard
                    rank={card.rank}
                    suit={card.suit as any}
                    size={sdCardSize}
                    faceUp
                    noFlip
                    animate={!animsOff}
                    throwMs={BOARD_THROW_MS}
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
                {/* Sized by how big the pot is in big blinds, so the number
                    says "this hand matters" before it is read. */}
                <AnimatedNumber
                  value={displayedPot}
                  style={[styles.potCenterValue, { fontSize: potFontSize(displayedPot, settings.bigBlind) }]}
                />
              </View>
            </View>
          )}
        </View>

        {/* The winner's cards: turned over at the seat, lifted so they can be
            read, then pushed across to join the board. Rendered above the seats
            so nothing clips them in flight. */}
        {boardBox.w > 0 && revealHands.map((placed, i) => {
          const hand = showdownHands[i];
          if (!hand) return null;
          return (
            <ShowdownReveal
              key={`${state.handNumber}-${placed.playerId}`}
              revealKey={`${state.handNumber}-${placed.playerId}`}
              cards={hand.hole}
              from={revealFrom(placed.playerId)}
              to={placed.targets}
              smallSize={18}
              bigSize={placed.size}
              tone={hand.outcome}
              highlight={highlightFor(hand)}
              animate={!animsOff}
            />
          );
        })}

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
          const showAllCards = (isShowdown || handsTabled) && !p.folded && remainingAtEnd > 1;
          const shownCards = showAllCards ? [true, true] : cardExposureForPlayer(p.id);
          return (
            <Pressable
              key={p.id}
              style={[styles.seatAbs, { left: pos.left, top: pos.top, width: SEAT_W }]}
              onLayout={idx === 0 ? (e) => growPod(e.nativeEvent.layout.height) : undefined}
              onPress={() => { sound.play('tap'); openPlayerSafety(p); }}
              accessibilityRole="button"
              accessibilityLabel={`${visible.name}, open player options`}
            >
              <Seat
                player={visible}
                pal={pals[p.id] ?? palFromSeed(p.id)}
                isHuman={false}
                compact
                isCurrent={current?.id === p.id && !isShowdown}
                isDealer={dealerId === p.id}
                showBet={!isShowdown}
                showCards={showAllCards}
                shownCards={shownCards}
                displayCards={displayHoleCards(p.holeCards, exposedCardsForPlayer(p.id))}
                back={cardBack}
                handOff={showdownHands.some((h) => h.playerId === p.id)}
                avatarSize={avatarSize}
                won={isShowdown && felt.winners.some((w) => w.playerId === p.id && w.amount > 0)}
                lost={seatLost(p)}
                reaction={reactionFor(p.id)}
                idleMotion={settings.avatarIdleMotion && !animsOff}
                emote={visibleEmote(p.id)}
                dealKey={`${state.handNumber}`}
                dealAnimate={dealAnimate}
                dealDelay={dealDelay(p.id, 0)}
                dealStep={state.players.length * DEAL_STEP}
                dealFrom={{ x: dealOrigin.x - (pos.left + SEAT_W / 2), y: dealOrigin.y - pos.top }}
              />
            </Pressable>
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
              back={cardBack}
              won={humanWon}
              lost={seatLost(human)}
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
          /*
           * Lifted clear of the result panel, but never so far that the cards
           * climb back onto the felt.
           *
           * The cap used to be 76, which was exactly enough for the panel as
           * it stood and nothing more. Any extra row, the free rebuy offered
           * to a short stack among them, grew the panel past the lift and it
           * printed straight through the hole cards. The cap now has room for
           * one more button, which is the most this panel ever adds.
           */
          isShowdown && { marginBottom: Math.max(0, Math.min(resultH - 96, 148)) },
        ]}
      >
        {handHint && !human.folded ? (
          <View style={styles.handChipSlot} pointerEvents="none">
            <View style={styles.handChip}>
              <Text style={styles.handChipText}>{handHint}</Text>
            </View>
          </View>
        ) : isShowdown && human.folded && !humanCardsShown ? (
          <View style={styles.handChipSlot} pointerEvents="none">
            <View style={styles.muckedChip}>
              <Text style={styles.muckedChipText}>Mucked</Text>
            </View>
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
            const forceOpen = openAlways ? true : humanCardExposure;
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
                forceOpen={reveal !== 'show' ? forceOpen : false}
                // Only a card turned over by hand mid hand gets enlarged. At a
                // showdown every card is open and scaling them all would say
                // nothing about who chose to show what.
                emphasize={openAlways ? undefined : humanCardExposure}
                // thrown down from the middle of the felt, which sits above this row
                fromY={-(tableH * 0.5 + 40)}
                back={cardBack}
                onPeek={() => sound.play('tap')}
              />
            );
          })()}
        </View>
        <View style={styles.emoteAnchor}>
          {/*
            * The gear sits above Show, which sits above chat: the three
            * things you reach for that are not a betting action, stacked out
            * of the way of the ones that are.
            */}
          <Pressable
            onPress={() => { sound.play('tap'); setMenuOpen(true); }}
            style={styles.gearFab}
            accessibilityRole="button"
            accessibilityLabel="Table menu"
          >
            <SettingsIcon size={20} color={colors.onDark} />
          </Pressable>
          {canExposeHoleCards && (
            <Pressable
              onPress={promptExposeCard}
              style={styles.exposeFab}
              accessibilityRole="button"
              accessibilityLabel="Show one of your cards to the table"
              accessibilityHint="Asks which card, then turns only that one face up"
            >
              {/*
                * One button, and it asks which card.
                *
                * Two buttons sat under the hole cards, where on a smaller
                * phone they overlapped the bet sizing row, so reaching for
                * half pot could expose a card instead. Showing a card cannot
                * be undone, so it is the one control on this screen that must
                * not be possible to hit by accident.
                */}
              <Text style={styles.exposeFabText}>Show</Text>
            </Pressable>
          )}
          <EmoteBar onEmote={sendEmote} ownedCosmeticIds={cosmetics.ownedCosmeticIds} pal={profile.pal} />
        </View>
      </View>

      <View style={styles.controls}>
        {isAwaitingOnlineState ? (
          <View style={styles.waiting}>
            <Text style={styles.waitingText}>Syncing live table…</Text>
            <Text style={styles.foldedNote}>No local bot actions are being played while the room connects.</Text>
          </View>
        ) : runVotingActive ? (
          <Animated.View
            entering={FadeInUp.duration(motion.base).easing(Easing.bezier(...easings.out))}
            style={styles.resultCard}
          >
            <Text style={styles.resultTitle}>Run it how many times?</Text>
            <Text style={styles.resultLine}>
              Highest vote wins. No answer means 1.
            </Text>
            <View style={styles.runVoteRow}>
              {Array.from({ length: MAX_RUNS }, (_, i) => (i + 1) as RunCount).map((choice) => (
                <WiiButton
                  key={choice}
                  label={`${choice}`}
                  variant={humanRunVote?.choice === choice ? 'gold' : 'blue'}
                  size="md"
                  style={styles.runVoteBtn}
                  disabled={!runVoteCanAnswer}
                  onPress={() => chooseRunCount(choice)}
                />
              ))}
            </View>
            {!runVoteCanAnswer && (
              <Text style={styles.foldedNote}>Waiting for the other all-in players…</Text>
            )}
            <View style={{ marginTop: spacing.xs }}>
              <TurnTimer
                seconds={RUN_VOTE_MS / 1000}
                active
                resetKey={`run-vote-${state.handNumber}`}
                onExpire={() => finishRunVote(true)}
                label="Defaulting to 1 in"
              />
            </View>
          </Animated.View>
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
                {tournamentWinnerId
                  ? tournamentWinnerId === human.id ? '🎉 Tournament champion!' : 'Tournament over'
                  : humanEliminated ? 'Out of tournament'
                    : humanWon ? '🎉 You win!'
                      : remainingAtEnd === 1 && !human.folded ? 'You take it!' : 'Hand over'}
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
            {tournamentWinnerId ? (
              <Text style={styles.resultLine} numberOfLines={1}>
                {tournamentWinnerId === human.id
                  ? 'You hold every chip.'
                  : `${tournamentWinnerPlayer?.name ?? 'A player'} holds every chip.`}
              </Text>
            ) : humanEliminated ? (
              <Text style={styles.resultLine} numberOfLines={1}>
                No rebuys in tournament play.
              </Text>
            ) : null}
            {/*
              * Per run when the hand was run more than once.
              *
              * The aggregate was actively misleading: a player who won one
              * run with two pair and lost the other to a flush was printed as
              * "wins 60 - Two Pair" next to a board showing the flush, with
              * no mention of which run either belonged to. `runResults`
              * already scopes the board and the winners per run, so say so.
              */}
            {runResults && runResults.length > 1
              ? runResults.map((run, runIndex) => (
                <View key={`run-${runIndex}`} style={styles.runResultRow}>
                  <Text style={styles.runResultTag}>{`Run ${runIndex + 1}`}</Text>
                  <Text style={styles.resultLine} numberOfLines={1}>
                    {run.winners.length === 0
                      ? 'No winner'
                      : run.winners
                        .map((w) => {
                          const p = state.players.find((pp) => pp.id === w.playerId);
                          const name = p ? visiblePlayer(p).name : 'Player';
                          const hand = w.hand ? ` \u00b7 ${handName(w.hand.category)}` : '';
                          return `${name} ${w.amount.toLocaleString()}${hand}`;
                        })
                        .join(', ')}
                  </Text>
                </View>
              ))
              : state.winners.map((w) => {
                const p = state.players.find((pp) => pp.id === w.playerId);
                const name = p ? visiblePlayer(p).name : 'Player';
                return (
                  <Text key={w.playerId} style={styles.resultLine} numberOfLines={1}>
                    {name} wins {w.amount.toLocaleString()}
                    {w.hand ? ` \u00b7 ${handName(w.hand.category)}` : ''}
                  </Text>
                );
              })}

            {!animsOff && !rebuyMessage && (!roomCode || !firebaseOnline || isOnlineHost) && (
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

            {/* The countdown rides on the button rather than taking a line of
                its own: this panel is the one thing tall enough to reach the
                hole cards above it, and every row added here is a row that
                has to be cleared. */}
            {rebuyMessage && !mustRebuy && (
              <Text style={styles.rebuyNotice}>{rebuyMessage}</Text>
            )}
            {(lowChips || mustRebuy) && (
              <View style={{ marginTop: spacing.sm }}>
                <WiiButton
                  label={mustRebuy && rebuyState.phase === 'waiting'
                    ? `Rebuy (free) \u00b7 ${rebuyState.secondsLeft}s`
                    : 'Rebuy (free)'}
                  variant="gold"
                  size="md"
                  fullWidth
                  onPress={rebuy}
                />
              </View>
            )}
            <View style={{ height: spacing.sm }} />
            {/* Keyed off being in a room rather than on `firebaseOnline`,
                which is a configuration check rather than a connection
                state and so cannot answer the question being asked here. */}
            {/* The flip toggle rides beside Next Hand rather than taking a
                row of its own. Mucking is the default, so this is a single
                opt-in rather than a two-button choice, and a round icon says
                "turn these over" without spending the width a label needs.
                This panel is the one thing tall enough to reach the hole
                cards above it, so every row it does not take is a row the
                cards keep. */}
            {/*
              * Your turn to show or muck.
              *
              * Only appears when there is a real choice: forced hands are
              * tabled without asking. Seeing what is already face up before
              * answering is the whole point of the order.
              */}
            {awaitingShowChoice && (
              <View style={styles.showChoiceRow}>
                <Text style={styles.showChoiceLabel}>Show your hand?</Text>
                <WiiButton label="Show" variant="blue" onPress={() => answerShowChoice(true)} />
                <WiiButton label="Muck" variant="white" onPress={() => answerShowChoice(false)} />
              </View>
            )}
            <View style={styles.nextRow}>
              <WiiButton
                label={
                  /*
                   * Say what is actually being waited on. A guest was always
                   * told "Waiting for host", including while the table sat on
                   * a rebuy window, which made it look like the host was idle
                   * when the table was waiting for somebody to buy back in.
                   */
                  rebuyState.phase === 'waiting'
                    ? 'Waiting for players…'
                    : tournamentWinnerId
                      ? 'Finish Tournament'
                      : roomCode && !isOnlineHost
                      ? 'Waiting for host…'
                      : 'Next Hand'
                }
                variant="green"
                size="lg"
                style={styles.nextBtn}
                disabled={!!roomCode && !isOnlineHost}
                onPress={nextHand}
              />
              {/*
                * Only while the hand is still yours to hide.
                *
                * Two ways it stops being a choice. All in, and the cards were
                * turned up for the run-out before this panel ever appeared.
                * Or the showdown already tabled them, by winning with
                * auto-muck off or by tapping show. Either way the table has
                * seen them and the toggle was offering to put them back,
                * which is not a thing poker lets you do: it did nothing, or
                * worse, it hid locally what everyone else had already read.
                *
                * A pot won on a fold is deliberately not covered. Nobody saw
                * that hand, so showing a bluff is still a real choice.
                */}
              {!handsTabled && !(isShowdown && humanCardsShown) && (
                <Pressable
                  onPress={() => {
                    sound.play('tap');
                    setReveal('show');
                    // Showing is only meaningful if the others see it. Voided:
                    // a failed publish must not block the local reveal.
                    if (roomCode && firebaseOnline) void revealOwnHand(roomCode);
                  }}
                  style={styles.muckBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Show your cards to the table"
                  accessibilityHint="Turns your hole cards face up for the rest of the table"
                >
                  <CardFlipIcon size={26} color={colors.onDarkMuted} />
                </Pressable>
              )}
            </View>
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
            <ActionBar legal={legal} potSize={wageringPot} step={state.config.bigBlind} onAction={onHumanAction} />
          </View>
        ) : (
          <View style={styles.waiting}>
            {current && !isShowdown && actorCanAct ? (
              <TurnTimer
                seconds={settings.turnTimerSec}
                active
                resetKey={`${state.handNumber}:${state.street}:${state.currentPlayerIndex}`}
                startedAt={turnStartedAt}
                onExpire={onTimerExpire}
                label={`${currentActorName}'s turn`}
              />
            ) : null}
            <Text style={[styles.waitingText, !!runoutStatus && styles.runoutText, !!rebuyMessage && styles.rebuyNotice]}>
              {humanEliminated
                ? 'You are out of the tournament.'
                : rebuyMessage ?? runoutStatus ?? (current ? `Waiting for ${visiblePlayer(current).name}…` : 'Dealing…')}
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
        focusPlayerId={statsFocus}
        sessionHands={sessionHands}
        handHint={handHint}
        opponents={opponents.map((p) => ({ id: p.id, name: visiblePlayer(p).name }))}
        observed={observed}
        history={opponentHistory}
      />

      <TableMenu
        visible={menuOpen}
        onClose={() => { setMenuOpen(false); setCodeShown(false); }}
        roomCode={roomCode}
        codeShown={codeShown}
        onRevealCode={() => setCodeShown(true)}
        isHost={!roomCode || isOnlineHost}
        settings={settings}
        ownedCosmeticIds={cosmetics.ownedCosmeticIds}
        onChange={(patch) => updateSettings(pickMidGameSafe(patch))}
        onLeave={() => { setMenuOpen(false); leave(); }}
      />
    </ScreenBackground>
  );
}

/**
 * The table menu, behind the gear.
 *
 * Two jobs. It holds the room code, which used to sit in the header on every
 * hand of every friends game to show four characters that matter once, when
 * you are inviting somebody. And it lets the host change the few things that
 * are safe to change while a game is running.
 *
 * "Safe" is not a judgement made here: `pickMidGameSafe` decides, and the
 * test beside it asserts that every term players agreed to by sitting down,
 * the blinds, the stack, the clock, is refused. See `src/game/hostControls.ts`.
 */
function TableMenu({
  visible,
  onClose,
  roomCode,
  codeShown,
  onRevealCode,
  isHost,
  settings,
  ownedCosmeticIds,
  onChange,
  onLeave,
}: {
  visible: boolean;
  onClose: () => void;
  roomCode?: string;
  codeShown: boolean;
  onRevealCode: () => void;
  isHost: boolean;
  settings: GameSettings;
  ownedCosmeticIds: readonly string[];
  onChange: (patch: Partial<GameSettings>) => void;
  onLeave: () => void;
}) {
  if (!visible) return null;

  const cycle = (key: 'feltStyle' | 'chipStyle' | 'cardBack') => {
    const field = findSettingField(key);
    if (!field) return;
    const options = availableSettingOptions(field, ownedCosmeticIds);
    if (options.length < 2) return;
    const at = options.findIndex((option) => option.value === settings[key]);
    const next = options[(at + 1) % options.length];
    onChange({ [key]: next.value } as Partial<GameSettings>);
  };

  const labelFor = (key: 'feltStyle' | 'chipStyle' | 'cardBack') => {
    const field = findSettingField(key);
    const match = field?.options?.find((option) => option.value === settings[key]);
    return match?.label ?? String(settings[key]);
  };

  const isPublic = settings.roomVisibility === 'public';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.menuBackdrop} onPress={onClose} accessibilityLabel="Close menu">
        {/* Swallows taps on the sheet so only the backdrop closes it. */}
        <Pressable style={styles.menuSheet} onPress={() => {}}>
          <Text style={styles.menuTitle}>Table</Text>

          {roomCode ? (
            <Pressable
              style={styles.menuRow}
              onPress={onRevealCode}
              accessibilityRole="button"
              accessibilityLabel={codeShown ? `Room code ${roomCode}` : 'Show game code'}
            >
              <Text style={styles.menuRowLabel}>Game code</Text>
              {/* Hidden until asked for: the reason it left the header is
                  that it was on screen for people sitting next to you during
                  every hand, and a room code is what lets someone in. */}
              <Text style={styles.menuRowValue}>{codeShown ? `#${roomCode}` : 'Show'}</Text>
            </Pressable>
          ) : null}

          {isHost ? (
            <>
              {roomCode ? (
                <Pressable
                  style={styles.menuRow}
                  onPress={() => onChange({ roomVisibility: isPublic ? 'private' : 'public' })}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: isPublic }}
                  accessibilityLabel="Table visibility"
                >
                  <Text style={styles.menuRowLabel}>Visible to everyone</Text>
                  <Text style={[styles.menuRowValue, isPublic && styles.menuRowValueOn]}>
                    {isPublic ? 'Public' : 'Private'}
                  </Text>
                </Pressable>
              ) : null}

              {(['feltStyle', 'cardBack', 'chipStyle'] as const).map((key) => (
                <Pressable
                  key={key}
                  style={styles.menuRow}
                  onPress={() => cycle(key)}
                  accessibilityRole="button"
                  accessibilityLabel={`${MENU_COSMETIC_LABELS[key]}, currently ${labelFor(key)}`}
                  accessibilityHint="Changes to the next one you own"
                >
                  <Text style={styles.menuRowLabel}>{MENU_COSMETIC_LABELS[key]}</Text>
                  <Text style={styles.menuRowValue}>{labelFor(key)}</Text>
                </Pressable>
              ))}

              {/* Said plainly, because the absence of the blinds and the
                  stack from this list is a deliberate promise to everyone
                  else at the table, not an oversight. */}
              <Text style={styles.menuNote}>
                Stakes, stacks and the clock were agreed when everyone sat down, so they stay put.
              </Text>
            </>
          ) : null}

          <View style={styles.menuActions}>
            <WiiButton label="Close" size="sm" variant="white" onPress={onClose} />
            <WiiButton label="Leave game" size="sm" variant="red" onPress={onLeave} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const MENU_COSMETIC_LABELS = {
  feltStyle: 'Felt',
  cardBack: 'Card back',
  chipStyle: 'Chips',
} as const;

/** The schema is grouped, so a key has to be hunted for. */
function findSettingField(key: keyof GameSettings) {
  for (const group of SETTINGS_SCHEMA) {
    const found = group.fields.find((field) => field.key === key);
    if (found) return found;
  }
  return undefined;
}

const styles = StyleSheet.create({
  // The safe-area inset already clears the status bar and the island, so the
  // padding on top of it was a second gap for the same hazard and simply
  // pushed the whole table down the screen.
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: 0 },
  iconBtn: { width: 44, height: 44, borderRadius: radii.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.surfaceBorder, alignItems: 'center', justifyContent: 'center' },
  topRight: { minWidth: 44, flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
  safetyBtn: { width: 44, height: 44, borderRadius: radii.pill, backgroundColor: colors.red, borderWidth: 1, borderColor: colors.surfaceBorder, alignItems: 'center', justifyContent: 'center' },
  safetyBtnText: { fontFamily: fonts.bold, fontSize: 22, color: colors.onDark },
  potWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing.sm },
  potCenter: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.surfaceBorder, borderRadius: radii.pill, paddingHorizontal: spacing.lg, paddingVertical: 6 },
  potCenterLabel: { ...type.label, color: colors.onDarkMuted },
  potCenterValue: { fontFamily: fonts.bold, fontSize: 26, color: colors.onDark, ...numeric },
  roomPill: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.surfaceBorder, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minWidth: 44, alignItems: 'center' },
  tournamentPill: { flexShrink: 1, maxWidth: '58%' },
  roomText: { ...type.label, color: colors.onDarkSoft },
  // The gold win ring must not change the board's geometry, or every card
  // visibly jumps outward the moment a hand is won. The border is therefore
  // always present and merely changes colour.
  boardCardWrap: { marginHorizontal: 0, borderRadius: radii.sm + 2, borderWidth: 2, borderColor: 'transparent' },
  winCard: { borderColor: colors.gold, backgroundColor: 'rgba(214,180,92,0.16)' },
  /*
   * Out of the flow, so the cards stay on the table's centre line.
   *
   * These sat in the row as a sibling of the hole cards, so the moment a hand
   * name appeared it took width and shoved the cards to the right of centre.
   * It is the same fault as the bet pill resizing the pod and the pod sliding
   * the board: anything conditional that occupies layout space moves whatever
   * is next to it. Absolute means the label can come and go without the cards
   * knowing about it. Pinned top to bottom so it stays vertically centred
   * without needing to know how tall a card is.
   */
  handChip: { alignSelf: 'flex-start', backgroundColor: colors.surfaceAlt, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, marginBottom: 6, borderWidth: 1, borderColor: colors.surfaceBorderStrong },
  /*
   * The slot stretches, the label does not.
   *
   * Making the pill itself absolute and full height took it out of the flow,
   * which was the point, but stretched its background into a tall blob down
   * the side of the cards. Only this wrapper is full height, and it has no
   * background of its own, so the label sits vertically centred at its own
   * size and still costs the cards no width.
   */
  handChipSlot: { position: 'absolute', left: 0, top: 0, bottom: 0, justifyContent: 'center', zIndex: 2 },
  handChipText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.onDark },
  muckedChip: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.surfaceBorder, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, marginBottom: 6 },
  muckedChipText: { fontFamily: fonts.medium, fontSize: 12, color: colors.onDarkSoft },
  friendsBanner: { marginHorizontal: spacing.lg, marginTop: spacing.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.surfaceBorder, borderRadius: radii.md, paddingVertical: 6, paddingHorizontal: spacing.md },
  friendsBannerText: { fontFamily: fonts.medium, fontSize: 11, color: colors.onDarkSoft, textAlign: 'center' },
  // Wider than it looks: every point here is taken off the felt twice over,
  // once on each side, and the board is sized from what is left of the cloth.
  // The table still clears the screen edge, which is all this margin was for.
  tableArea: { marginTop: 0, marginHorizontal: 2, position: 'relative' },
  feltOval: { position: 'absolute', top: FELT_INSET, left: FELT_INSET, right: FELT_INSET, bottom: FELT_INSET, borderRadius: 200, borderWidth: FELT_RAIL, borderColor: colors.feltRail, overflow: 'hidden' },
  // top-lit sliver along the inside of the rail, the single light source
  railHighlight: { position: 'absolute', top: 0, left: 0, right: 0, height: '38%', borderTopLeftRadius: 190, borderTopRightRadius: 190, backgroundColor: colors.feltRailEdge, opacity: 0.35 },
  // inner shadow where the felt meets the rail, so the surface reads as recessed
  feltInner: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 190, borderWidth: 14, borderColor: colors.feltInnerShadow, opacity: 0.55 },
  feltGlow: { position: 'absolute', alignSelf: 'center', top: '18%', width: 300, height: 300, borderRadius: 150, backgroundColor: colors.feltLight, opacity: 0.22 },
  centerZone: { position: 'absolute', left: 0, right: 0, alignItems: 'center', justifyContent: 'center', gap: 6 },
  centerZoneTop: { justifyContent: 'flex-start' },
  // Width is set per-render from SEAT_W: it has to match the width `seatPos`
  // positions the pod with, or the pod sits off-centre by half the difference.
  seatAbs: { position: 'absolute', alignItems: 'center' },
  humanSeatAbs: { position: 'absolute', left: 0, right: 0, bottom: 2, alignItems: 'center' },
  board: { flexDirection: 'row', alignItems: 'center' },
  // The board always occupies five slots so the cards never jump sideways as
  // streets are dealt. The empty ones therefore have to be *visible*, as shallow
  // recesses in the cloth, or a 3- or 4-card board reads as being off-centre.
  cardSlot: { borderRadius: radii.sm, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', backgroundColor: 'rgba(0,0,0,0.22)' },
  // A peeled card swings well outside its own bounds, so this row has to sit
  // above the controls or the action bar paints over the lifted corner.
  humanCardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md, marginBottom: spacing.sm, minHeight: 142, zIndex: 41 },
  humanCards: { flexDirection: 'row', position: 'relative' },
  gearFab: { marginBottom: spacing.sm, alignSelf: 'flex-end', width: 36, height: 36, borderRadius: radii.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.surfaceBorder, alignItems: 'center', justifyContent: 'center' },
  menuBackdrop: { flex: 1, backgroundColor: 'rgba(8,10,18,0.74)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  menuSheet: { width: '100%', maxWidth: 420, borderRadius: radii.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.surfaceBorderStrong, padding: spacing.lg, gap: spacing.xs },
  menuTitle: { fontFamily: fonts.bold, fontSize: 19, color: colors.onDark, marginBottom: spacing.xs },
  menuRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, minHeight: 44, paddingVertical: 4 },
  menuRowLabel: { fontFamily: fonts.medium, fontSize: 15, color: colors.onDarkSoft, flexShrink: 1 },
  menuRowValue: { fontFamily: fonts.bold, fontSize: 15, color: colors.onDark },
  menuRowValueOn: { color: colors.green },
  menuNote: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16, color: colors.onDarkMuted, marginTop: spacing.xs },
  menuActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginTop: spacing.md },
  exposeFab: { marginBottom: spacing.sm, alignSelf: 'flex-end', paddingHorizontal: spacing.md, height: 30, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.goldDeep, backgroundColor: 'rgba(214,180,92,0.22)', alignItems: 'center', justifyContent: 'center' },
  exposeFabText: { fontFamily: fonts.bold, fontSize: 12, color: colors.gold },
  exposeBtn: { minWidth: 70, height: 26, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.goldDeep, backgroundColor: 'rgba(214,180,92,0.18)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm },
  exposeBtnDone: { borderColor: colors.surfaceBorder, backgroundColor: colors.surface },
  exposeBtnText: { fontFamily: fonts.bold, fontSize: 11, color: colors.gold },
  exposeBtnTextDone: { color: colors.onDarkMuted },
  emoteAnchor: { position: 'absolute', right: spacing.lg, bottom: 6 },
  controls: { flex: 1, paddingHorizontal: spacing.lg, minHeight: 140, justifyContent: 'flex-end' },
  waiting: { alignItems: 'center', paddingVertical: spacing.lg },
  rebuyNotice: { fontFamily: fonts.semibold, fontSize: 14, color: colors.gold, textAlign: 'center', marginTop: spacing.xs },
  rebuyNoticeUrgent: { color: colors.red },
  waitingText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.onDarkSoft },
  // A run-out is the loudest moment in the hand, so its status line is the one
  // thing in this row that is allowed to shout.
  runoutText: { fontFamily: fonts.bold, fontSize: 17, color: colors.onDark, letterSpacing: 0.3 },
  foldedNote: { fontFamily: fonts.medium, fontSize: 12, color: colors.onDarkMuted, marginTop: spacing.xs },
  resultCard: { position: 'absolute', left: 0, right: 0, bottom: spacing.sm, marginHorizontal: spacing.lg, backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.surfaceBorder, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, zIndex: 40, ...shadows.panel },
  resultHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  resultTitle: { fontFamily: fonts.bold, fontSize: 17, color: colors.onDark, textAlign: 'center' },
  resultLine: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.onDarkSoft, textAlign: 'center', marginTop: 1, ...numeric },
  runResultRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 1 },
  runResultTag: {
    fontFamily: fonts.bold,
    fontSize: 10,
    letterSpacing: 0.4,
    color: colors.gold,
    borderWidth: 1,
    borderColor: 'rgba(214,180,92,0.5)',
    borderRadius: radii.pill,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  coinRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  coin: { width: 17, height: 17, borderRadius: 8.5, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.goldDeep },
  coinT: { fontFamily: fonts.bold, color: '#2A2210', fontSize: 11 },
  coinEarned: { fontFamily: fonts.bold, fontSize: 13, color: colors.gold, ...numeric },
  nextRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  nextBtn: { flex: 1 },
  // 44pt because that is the smallest target iOS considers reachable, and the
  // button is now a circle with no words to widen it.
  showChoiceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  showChoiceLabel: { fontFamily: fonts.bold, fontSize: 13, color: colors.onDarkSoft },
  runVoteRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.sm },
  runVoteBtn: { flex: 1 },
  notSeated: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  notSeatedTitle: { fontFamily: fonts.bold, fontSize: 20, color: colors.onDark, textAlign: 'center' },
  notSeatedBody: { fontFamily: fonts.regular, fontSize: 14, color: colors.onDarkSoft, textAlign: 'center', marginBottom: spacing.md },
  muckBtn: { width: 62, height: 62, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.surfaceBorder, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  adWrap: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, paddingTop: spacing.xs },
});
