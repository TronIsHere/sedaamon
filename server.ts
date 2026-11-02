import { createServer } from "node:http";
import { parseCookie } from "cookie";
import { loadEnvConfig } from "@next/env";
import next from "next";
import { Server as IOServer } from "socket.io";

const dev = process.env.NODE_ENV !== "production";
loadEnvConfig(process.cwd(), dev);

const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOST ?? "0.0.0.0";

async function main() {
  // Imported after the env is loaded so they see MONGODB_URI, LIVEKIT_* etc.
  const { connectDB } = await import("./src/server/db");
  const { Member } = await import("./src/server/models");
  const { userFromToken, SESSION_COOKIE } = await import("./src/server/session");
  const { realtime, serverRoom, userRoom } = await import("./src/server/realtime");
  const { syncVoiceFromLiveKit } = await import("./src/server/livekit");

  await connectDB();

  const httpServer = createServer();
  const app = next({ dev, hostname, port, httpServer });
  const handle = app.getRequestHandler();
  await app.prepare();

  httpServer.on("request", (req, res) => {
    // socket.io answers its own long-polling requests on this path.
    if (req.url?.startsWith("/socket.io/")) return;
    handle(req, res);
  });

  // destroyUpgrade: false leaves other websocket upgrades (Next's dev HMR) alone.
  const io = new IOServer(httpServer, { destroyUpgrade: false, serveClient: false });
  realtime.io = io;

  io.use(async (socket, nextFn) => {
    const token = parseCookie(socket.handshake.headers.cookie ?? "")[SESSION_COOKIE];
    const user = await userFromToken(token).catch(() => null);
    if (!user) return nextFn(new Error("unauthorized"));
    socket.data.userId = String(user._id);
    socket.data.user = { id: String(user._id), name: user.name ?? "", color: user.color };
    nextFn();
  });

  io.on("connection", async (socket) => {
    const userId: string = socket.data.userId;
    const memberships = await Member.find({ user: userId }, { server: 1 }).lean();
    socket.join([userRoom(userId), ...memberships.map((m) => serverRoom(String(m.server)))]);

    // "Someone is typing…": relayed to the rest of the server, only for servers this socket belongs to.
    socket.on("typing", (payload: { serverId?: unknown; channelId?: unknown }) => {
      const { serverId, channelId } = payload ?? {};
      if (typeof serverId !== "string" || typeof channelId !== "string") return;
      if (!socket.rooms.has(serverRoom(serverId))) return;
      socket.to(serverRoom(serverId)).emit("typing", { channelId, user: socket.data.user });
    });
  });

  httpServer.listen(port, hostname, () => {
    console.log(`> sedaamon ready on http://localhost:${port} (${dev ? "development" : "production"})`);
  });

  syncVoiceFromLiveKit().catch((err) => console.warn("[livekit] presence sync skipped:", err.message));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
