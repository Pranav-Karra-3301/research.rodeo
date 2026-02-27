import { DbConnection, type SubscriptionHandle } from "./index";
import type { SubscriptionEventContext, ErrorContext } from "./index";

// SpacetimeDB config (NEXT_PUBLIC_ so client can read them; see .env.example)
const SPACETIMEDB_URI = process.env.NEXT_PUBLIC_SPACETIMEDB_URI ?? "wss://maincloud.spacetimedb.com";
const MODULE_NAME = process.env.NEXT_PUBLIC_SPACETIMEDB_DATABASE ?? "rabbit-hole-db";
const AUTH_TOKEN_KEY = "rh_stdb_token";

let _connection: DbConnection | null = null;
let _connecting = false;
const _onConnectCallbacks: Array<(conn: DbConnection) => void> = [];

/** Singleton connection. Call once from a Provider component. */
export function getConnection(): DbConnection | null {
  return _connection;
}

export function isConnected(): boolean {
  return _connection !== null;
}

type ConnectCallbacks = {
  onConnect?: (conn: DbConnection) => void;
  onDisconnect?: () => void;
  onError?: (err: Error) => void;
};

export function connect(callbacks: ConnectCallbacks = {}): void {
  if (_connection || _connecting) {
    if (_connection && callbacks.onConnect) callbacks.onConnect(_connection);
    return;
  }
  _connecting = true;

  const token = typeof window !== "undefined"
    ? localStorage.getItem(AUTH_TOKEN_KEY) ?? undefined
    : undefined;

  DbConnection.builder()
    .withUri(SPACETIMEDB_URI)
    .withDatabaseName(MODULE_NAME)
    .withToken(token)
    .onConnect((conn, _identity, newToken) => {
      _connection = conn;
      _connecting = false;
      if (typeof window !== "undefined") {
        localStorage.setItem(AUTH_TOKEN_KEY, newToken);
      }
      callbacks.onConnect?.(conn);
      for (const cb of _onConnectCallbacks) cb(conn);
      _onConnectCallbacks.length = 0;
    })
    .onDisconnect(() => {
      _connection = null;
      _connecting = false;
      callbacks.onDisconnect?.();
    })
    .onConnectError((_ctx: ErrorContext, err: Error) => {
      _connecting = false;
      callbacks.onError?.(err);
      console.error("[SpacetimeDB] Connection error:", err);
    })
    .build();
}

/** Wait for a connection to be established. */
export function whenConnected(cb: (conn: DbConnection) => void): void {
  if (_connection) {
    cb(_connection);
  } else {
    _onConnectCallbacks.push(cb);
  }
}

/** Subscribe to a SQL query. Returns the handle so you can unsubscribe later. */
export function subscribe(
  queries: string[],
  onApplied?: (ctx: SubscriptionEventContext) => void,
  onError?: (ctx: ErrorContext) => void
): SubscriptionHandle | null {
  const conn = _connection;
  if (!conn) return null;
  let builder = conn.subscriptionBuilder();
  if (onApplied) builder = builder.onApplied(onApplied);
  if (onError) builder = builder.onError(onError);
  return builder.subscribe(queries);
}
