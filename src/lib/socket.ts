import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

/** One socket per tab; the session cookie authenticates it. */
export function getSocket() {
  socket ??= io({ withCredentials: true });
  return socket;
}
