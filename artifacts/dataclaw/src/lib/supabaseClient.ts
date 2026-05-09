// Local-only stub — the original used Supabase for cross-device sync.
// In this Replit deployment we keep state in localStorage only via zustand persist.
// This stub keeps the existing API surface so components that imported `supabase`
// continue to compile, but every operation is a safe no-op.

type AuthLike = {
  getUser: () => Promise<{ data: { user: null } }>;
  getSession: () => Promise<{ data: { session: null } }>;
  signInAnonymously: () => Promise<{ error: null }>;
};

type QueryBuilder = {
  select: (..._args: unknown[]) => QueryBuilder;
  upsert: (..._args: unknown[]) => Promise<{ error: null; data: null }>;
  insert: (..._args: unknown[]) => Promise<{ error: null; data: null }>;
  update: (..._args: unknown[]) => Promise<{ error: null; data: null }>;
  delete: (..._args: unknown[]) => Promise<{ error: null; data: null }>;
  eq: (..._args: unknown[]) => QueryBuilder;
  order: (..._args: unknown[]) => QueryBuilder;
  limit: (..._args: unknown[]) => QueryBuilder;
  single: () => Promise<{ error: null; data: null }>;
  then: <T>(onFulfilled?: (v: { error: null; data: never[] }) => T) => Promise<T>;
};

function makeBuilder(): QueryBuilder {
  const empty = { error: null, data: [] as never[] };
  const noopAsync = async () => ({ error: null, data: null });
  const builder: QueryBuilder = {
    select: () => builder,
    upsert: noopAsync,
    insert: noopAsync,
    update: noopAsync,
    delete: noopAsync,
    eq: () => builder,
    order: () => builder,
    limit: () => builder,
    single: async () => ({ error: null, data: null }),
    then: (onFulfilled) =>
      Promise.resolve(onFulfilled ? onFulfilled(empty) : (empty as never)),
  };
  return builder;
}

type ChannelLike = {
  on: (..._args: unknown[]) => ChannelLike;
  subscribe: () => ChannelLike;
};

function makeChannel(): ChannelLike {
  const ch: ChannelLike = {
    on: () => ch,
    subscribe: () => ch,
  };
  return ch;
}

export const supabase = {
  auth: {
    getUser: async () => ({ data: { user: null } }),
    getSession: async () => ({ data: { session: null } }),
    signInAnonymously: async () => ({ error: null }),
  } as AuthLike,
  from: (_table: string) => makeBuilder(),
  channel: (_name: string) => makeChannel(),
  removeChannel: (_ch: unknown) => {},
};
