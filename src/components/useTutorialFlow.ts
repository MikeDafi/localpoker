import { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useApp } from '../state/AppContext';
import type { RootStackParamList } from '../navigation/types';
import {
  TUTORIAL_SEED,
  nextTutorialStep,
  tutorialScreenFor,
  tutorialTableSettings,
  type TutorialStep,
} from '../game/tutorial';
import type { GameSettings } from '../game/settings';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** The practice table's route params. */
export function tutorialTableParams(settings: GameSettings): RootStackParamList['Table'] {
  return { settings: tutorialTableSettings(settings), seed: TUTORIAL_SEED, tutorial: true };
}

/**
 * Moving between tutorial screens.
 *
 * Every move resets the stack to the menu with the next screen on top, so
 * going back from any tutorial screen lands on the menu rather than on the
 * practice table, and the menu is where finishing or skipping ends up.
 */
export function useTutorialFlow() {
  const navigation = useNavigation<Nav>();
  const { tutorialStep, noteTutorial, finishTutorial, startTutorial, settings } = useApp();

  const goTo = useCallback((step: TutorialStep | null) => {
    if (!step) {
      navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
      return;
    }
    const screen = tutorialScreenFor(step);
    navigation.reset({
      index: 1,
      routes: [
        { name: 'Home' },
        screen === 'Table' ? { name: 'Table', params: tutorialTableParams(settings) } : { name: screen },
      ],
    });
  }, [navigation, settings]);

  /** The coach mark's own button, for steps that only explain. */
  const next = useCallback(() => {
    if (!tutorialStep) return;
    const after = nextTutorialStep(tutorialStep, 'next');
    if (after === tutorialStep) return;
    noteTutorial('next');
    const leaving = after === 'done' || tutorialScreenFor(after) !== tutorialScreenFor(tutorialStep);
    if (leaving) goTo(after === 'done' ? null : after);
  }, [goTo, noteTutorial, tutorialStep]);

  const skip = useCallback(() => {
    finishTutorial();
    goTo(null);
  }, [finishTutorial, goTo]);

  const replay = useCallback(() => {
    startTutorial();
    goTo('peel');
  }, [goTo, startTutorial]);

  /** Back to wherever a paused tutorial was. */
  const resume = useCallback(() => goTo(tutorialStep), [goTo, tutorialStep]);

  return { step: tutorialStep, note: noteTutorial, next, skip, replay, resume };
}
