import React, { useCallback } from 'react';
import { CoachMark, useCoachTarget } from './CoachMark';
import { useTutorialFlow } from './useTutorialFlow';
import { TUTORIAL_COPY, tutorialScreenFor, type TutorialEvent } from '../game/tutorial';

/** Clears the back and stats buttons along the top of the table. */
const TOP_BAR_CLEARANCE = 64;

/**
 * The tutorial's half of the table, kept out of TableScreen.
 *
 * The table only has to spread three target props onto controls it already
 * renders, report what the player did, and draw `overlay`. With `enabled`
 * false every target is undefined and `note` does nothing, so an ordinary
 * table renders exactly as it did.
 */
export function useTableCoach(enabled: boolean) {
  const flow = useTutorialFlow();
  const step = enabled && flow.step && tutorialScreenFor(flow.step) === 'Table' ? flow.step : null;
  const cards = useCoachTarget(step === 'peel');
  const react = useCoachTarget(step === 'react');
  const actions = useCoachTarget(step === 'call' || step === 'fold');
  const { note: flowNote } = flow;

  const note = useCallback((event: TutorialEvent) => {
    if (enabled) flowNote(event);
  }, [enabled, flowNote]);

  /**
   * `actionsShown` is whether the betting buttons are on screen. They only
   * appear on the player's turn, and a ring round where they will be is a
   * ring round nothing, so until then the card says to wait instead.
   */
  const overlay = (actionsShown: boolean) => {
    if (!step) return null;
    const copy = TUTORIAL_COPY[step];
    const betting = step === 'call' || step === 'fold';
    const target = step === 'peel' ? cards.rect
      : step === 'react' ? react.rect
        : betting && actionsShown ? actions.rect
          : null;
    return (
      <CoachMark
        title={copy.title}
        body={copy.body}
        target={target}
        // Only the peel can open its card right beside the control. The chat
        // button and the betting bar sit beside and below the hole cards,
        // which draw above anything placed over them, so those cards pin to
        // the top of the felt where they cover seats rather than controls.
        pinned={step !== 'peel'}
        edgeOffset={TOP_BAR_CLEARANCE}
        hint={betting && !actionsShown ? 'Your buttons appear down here when it is your turn.' : undefined}
        nextLabel={copy.next}
        onNext={copy.next ? flow.next : undefined}
        onSkip={flow.skip}
      />
    );
  };

  return {
    active: !!step,
    note,
    skip: flow.skip,
    cardsTarget: cards.props,
    reactTarget: react.props,
    actionsTarget: actions.props,
    overlay,
  };
}
