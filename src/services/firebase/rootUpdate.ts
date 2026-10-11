import { ref, update, type Database } from 'firebase/database';
import { addBreadcrumb } from '../telemetry';

/*
 * Every multi-path write here goes through the database root, so when the
 * rules refuse one, Firebase reports only "update at / failed:
 * permission_denied". Sentry then gets an error that names no feature: one
 * such report came from the Home screen at launch with nothing to say which of
 * twenty-odd root writes it was.
 *
 * So a refused write leaves a breadcrumb with the shape of its paths, e.g.
 * "localpoker/users/*", which Sentry attaches to the report. The error itself
 * is rethrown untouched: callers hand its message back as the reason a move
 * failed, and that must not change.
 *
 * Ids are masked, not dropped. The collection and field names are what point
 * at the rule; uids, room codes and handles would only identify a player.
 */
const STATIC_SEGMENT = /^[a-z][a-zA-Z]{0,23}$/;

const maskSegment = (segment: string, index: number): string => (
  // Index 2 is always the id under a collection: localpoker/<collection>/<id>.
  // Handles are plain lowercase words, so the pattern alone would leak them.
  index === 2 || !STATIC_SEGMENT.test(segment) ? '*' : segment
);

export const describeUpdatePaths = (updates: Record<string, unknown>): string[] => (
  [...new Set(Object.keys(updates).map((path) => (
    path.split('/').filter(Boolean).map(maskSegment).join('/')
  )))].sort()
);

export const updateRoot = async (db: Database, updates: Record<string, unknown>): Promise<void> => {
  try {
    await update(ref(db), updates);
  } catch (error) {
    addBreadcrumb({
      category: 'firebase',
      level: 'error',
      message: `update at / refused for ${describeUpdatePaths(updates).join(', ')}`,
    });
    throw error;
  }
};
