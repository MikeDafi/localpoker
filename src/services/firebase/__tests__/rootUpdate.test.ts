import { beforeEach, describe, expect, it, vi } from 'vitest';

const breadcrumbs: { message?: string }[] = [];
let updateError: Error | null = null;

vi.mock('firebase/database', () => ({
  ref: () => ({}),
  update: async () => { if (updateError) throw updateError; },
}));
vi.mock('../../telemetry', () => ({
  addBreadcrumb: (breadcrumb: { message?: string }) => { breadcrumbs.push(breadcrumb); },
}));

const { describeUpdatePaths, updateRoot } = await import('../rootUpdate');

describe('describing a refused root update', () => {
  it('keeps collections and fields but masks ids', () => {
    expect(describeUpdatePaths({
      'localpoker/users/Xy7aB2cD9eF0gH1iJ2kL3mN4oP5': { handle: 'mike' },
      'localpoker/rooms/ABCD12/players/Xy7aB2cD9eF0gH1iJ2kL3mN4oP5/stack': 100,
    })).toEqual(['localpoker/rooms/*/players/*/stack', 'localpoker/users/*']);
  });

  it('masks a handle even though it looks like a field name', () => {
    expect(describeUpdatePaths({ 'localpoker/handles/mike': 'uid' })).toEqual(['localpoker/handles/*']);
  });

  it('collapses writes to the same shape into one entry', () => {
    expect(describeUpdatePaths({
      'localpoker/friends/aaa111/bbb222': true,
      'localpoker/friends/bbb222/aaa111': true,
    })).toEqual(['localpoker/friends/*/*']);
  });
});

describe('updateRoot', () => {
  beforeEach(() => {
    breadcrumbs.length = 0;
    updateError = null;
  });

  it('leaves a breadcrumb naming the refused paths and rethrows the same error', async () => {
    updateError = new Error('permission_denied');
    await expect(updateRoot({} as never, { 'localpoker/presence/u1': { online: true } })).rejects.toBe(updateError);
    expect(updateError.message).toBe('permission_denied');
    expect(breadcrumbs.map((b) => b.message)).toEqual(['update at / refused for localpoker/presence/*']);
  });

  it('records nothing when the write succeeds', async () => {
    await updateRoot({} as never, { 'localpoker/presence/u1': { online: true } });
    expect(breadcrumbs).toEqual([]);
  });
});
