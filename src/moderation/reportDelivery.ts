/**
 * Getting an abuse report out of the app.
 *
 * The old path froze the screen, and the reason is worth stating plainly
 * because it is a trap the Firebase SDK sets for everyone:
 *
 *   await update(ref(db), { ...report })
 *
 * A Realtime Database write **does not reject when the device is offline**.
 * The SDK queues it and the promise settles only once a server acknowledges
 * it, which may be never. So `reportUser` never returned, the confirmation
 * alert after it never ran, and the player was left holding a dead screen
 * having just tried to report something offensive. That is the worst possible
 * moment to appear broken.
 *
 * Two fixes, both here:
 *
 * 1. **Nothing waits forever.** `withTimeout` bounds the remote write, so the
 *    UI always gets an answer.
 * 2. **The report reaches a human.** Reports were pushed into a database node
 *    with no reader. An email composed on the device actually arrives, which
 *    is what App Review expects of a reporting flow and what the user asked
 *    for.
 *
 * Pure, so the message can be asserted rather than eyeballed.
 */

export type ReportContext = 'table' | 'friends' | 'chat' | 'profile';

/** Where abuse reports go. Matches the published support address. */
export const REPORT_EMAIL = 'maskndafi@gmail.com';

/**
 * How long the database write may take before the UI stops waiting on it.
 *
 * Six seconds is long enough for a slow but working connection and short
 * enough that nobody believes the app has hung. The write is not abandoned
 * when this fires: the SDK keeps it queued and it lands later if the device
 * comes back, so the timeout costs nothing but the waiting.
 */
export const REPORT_TIMEOUT_MS = 6000;

/**
 * Resolve with `fallback` if `promise` has not settled within `ms`.
 *
 * Deliberately resolves rather than rejects. A report is best effort, and a
 * rejection here would just become another error path for the caller to get
 * wrong.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(fallback);
    }, ms);
    const finish = (value: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    promise.then(finish, () => finish(fallback));
  });
}

export interface ReportEmailInput {
  reportedName: string;
  context: ReportContext;
  roomCode?: string;
  /** The reporter's own handle, so a reply can find them. */
  reporterHandle?: string;
  /** Anonymous ids, which are what actually identify the account to act on. */
  reportedUid?: string;
  reporterUid?: string;
  appVersion?: string;
  at?: Date;
}

export interface ReportEmail {
  to: string;
  subject: string;
  body: string;
}

const CONTEXT_LABEL: Record<ReportContext, string> = {
  table: 'at a table',
  friends: 'in the friends list',
  chat: 'in chat',
  profile: 'on a profile',
};

/**
 * The message the device offers to send.
 *
 * It carries the identifiers needed to act on the report and nothing else.
 * No hand histories, no chat transcript, no contact details: a report is not
 * a licence to ship someone's data off the device.
 */
export function buildReportEmail(input: ReportEmailInput): ReportEmail {
  const when = (input.at ?? new Date()).toISOString();
  const name = input.reportedName.trim() || 'Unnamed player';
  const lines = [
    'Reporting offensive content.',
    '',
    `Player: ${name}`,
    `Where: ${CONTEXT_LABEL[input.context] ?? input.context}`,
    ...(input.roomCode ? [`Room: ${input.roomCode}`] : []),
    `When: ${when}`,
    ...(input.reportedUid ? [`Reported uid: ${input.reportedUid}`] : []),
    ...(input.reporterUid ? [`Reporter uid: ${input.reporterUid}`] : []),
    ...(input.reporterHandle ? [`Reporter handle: ${input.reporterHandle}`] : []),
    ...(input.appVersion ? [`App version: ${input.appVersion}`] : []),
    '',
    'What happened (please add any detail you can):',
    '',
  ];
  return {
    to: REPORT_EMAIL,
    subject: `LocalPoker report: ${name}`,
    body: lines.join('\n'),
  };
}

/** The `mailto:` URL for a composed report, correctly escaped. */
export function reportMailtoUrl(email: ReportEmail): string {
  const query = `subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`;
  return `mailto:${email.to}?${query}`;
}
