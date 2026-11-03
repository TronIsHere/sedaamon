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
  const { Channel, Conversation, Member } = await import("./src/server/models");
  const { channelAudience, memberCanView } = await import("./src/server/access");
  const { toUser } = await import("./src/server/serialize");
  const { DM_SCOPE } = await import("./src/lib/types");
  const { isValidObjectId } = await import("mongoose");
  const { userFromToken, SESSION_COOKIE } = await import("./src/server/session");
  const { emitToUsers, realtime, serverRoom, userRoom } = await import("./src/server/realtime");
  const { syncVoiceFromLiveKit } = await import("./src/server/livekit");
  const { userConnected, userDisconnected } = await import("./src/server/presence");
  const { startEventScheduler } = await import("./src/server/events");

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
    socket.data.user = toUser(user);
    nextFn();
  });

  io.on("connection", async (socket) => {
    const userId: string = socket.data.userId;
    // The socket can close while we look up its rooms; only count it as online if it is still open afterwards.
    let counted = false;
    socket.on("disconnect", () => counted && userDisconnected(userId));
    const memberships = await Member.find({ user: userId }, { server: 1 }).lean();
    socket.join([userRoom(userId), ...memberships.map((m) => serverRoom(String(m.server)))]);
    if (socket.disconnected) return;
    counted = true;
    userConnected(userId);

    // "Someone is typing…": relayed to the rest of the server, only for servers this socket belongs to.
    socket.on("typing", async (payload: { serverId?: unknown; channelId?: unknown }) => {
      const { serverId, channelId } = payload ?? {};
      if (typeof serverId !== "string" || typeof channelId !== "string") return;
      if (serverId === DM_SCOPE) {
        // Direct conversations go to the other person only, and only if the sender is part of it.
        if (!isValidObjectId(channelId)) return;
        const dm = await Conversation.findOne({ _id: channelId, participants: userId }, { participants: 1 }).lean().catch(() => null);
        const others = dm?.participants.map(String).filter((p) => p !== userId) ?? [];
        if (others.length) socket.to(others.map(userRoom)).emit("typing", { channelId, user: socket.data.user });
        return;
      }
      if (!socket.rooms.has(serverRoom(serverId)) || !isValidObjectId(channelId)) return;
      // Typing in a private channel is only shown to the people who can see it.
      const channel = await Channel.findOne({ _id: channelId, server: serverId }, { server: 1, isPrivate: 1, allowedRoles: 1, allowedMembers: 1 }).lean().catch(() => null);
      if (!channel) return;
      if (!channel.isPrivate) return void socket.to(serverRoom(serverId)).emit("typing", { channelId, user: socket.data.user });
      const me = await Member.findOne({ server: serverId, user: userId }, { user: 1, role: 1 }).lean().catch(() => null);
      if (!me || !memberCanView(channel, me)) return;
      const audience = ((await channelAudience(channel).catch(() => null)) ?? []).filter((id) => id !== userId);
      emitToUsers(audience, "typing", { channelId, user: socket.data.user });
    });
  });

  httpServer.listen(port, hostname, () => {
    console.log(`> sedaamon ready on http://localhost:${port} (${dev ? "development" : "production"})`);
  });

  startEventScheduler();
  syncVoiceFromLiveKit().catch((err) => console.warn("[livekit] presence sync skipped:", err.message));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
