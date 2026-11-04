import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const { ObjectId } = Schema.Types;

const userSchema = new Schema(
  {
    phone: { type: String, required: true, unique: true },
    name: { type: String, default: "" },
    color: { type: String, required: true },
    bio: { type: String, default: "" },
    // Set when a picture is uploaded; it versions the avatar URL. The picture itself lives in the Avatar collection.
    avatarAt: { type: Date, default: null },
    status: { type: String, enum: ["available", "busy", "away", "gaming"], default: "available" },
    statusText: { type: String, default: "" },
    // Written when the user's last open connection goes away.
    lastSeenAt: { type: Date, default: null },
  },
  { timestamps: true },
);

const sessionSchema = new Schema({
  tokenHash: { type: String, required: true, unique: true },
  user: { type: ObjectId, ref: "User", required: true, index: true },
  // TTL index: MongoDB removes the document once expiresAt passes.
  expiresAt: { type: Date, required: true, expires: 0 },
});

const otpSchema = new Schema({
  phone: { type: String, required: true, unique: true },
  codeHash: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  sentAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true, expires: 0 },
});

const serverSchema = new Schema(
  {
    name: { type: String, required: true },
    owner: { type: ObjectId, ref: "User", required: true },
    inviteCode: { type: String, required: true, unique: true },
    // Listing in the public directory. Only listed servers can be found and joined without an invite link.
    isPublic: { type: Boolean, default: false },
    description: { type: String, default: "" },
    category: { type: String, default: "other" },
    tags: { type: [String], default: [] },
    listedAt: { type: Date, default: null },
    // What a new member sees on joining. Existing members are never asked to accept rules retroactively.
    welcome: {
      enabled: { type: Boolean, default: false },
      title: { type: String, default: "" },
      message: { type: String, default: "" },
      rules: { type: [String], default: [] },
      requireRules: { type: Boolean, default: false },
      // Channels shown to newcomers; the private ones among them are opened to each new member.
      channels: { type: [{ type: ObjectId, ref: "Channel" }], default: [] },
    },
  },
  { timestamps: true },
);
serverSchema.index({ isPublic: 1, category: 1 });

const memberSchema = new Schema(
  {
    server: { type: ObjectId, ref: "Server", required: true },
    user: { type: ObjectId, ref: "User", required: true, index: true },
    role: { type: String, enum: ["owner", "admin", "moderator", "organizer", "channel_manager", "member"], default: "member" },
    mutedUntil: { type: Date, default: null },
    // How the person got in; "discovery" earns the explorer badge.
    joinedVia: { type: String, enum: ["owner", "invite", "discovery"], default: "invite" },
    // Set when the server had a welcome screen at the moment they joined, until they dismiss it.
    welcomePending: { type: Boolean, default: false },
    // Set while the server's rules are still to be accepted; a member in this state can read but not write.
    rulesPending: { type: Boolean, default: false },
    rulesAcceptedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
memberSchema.index({ server: 1, user: 1 }, { unique: true });

const channelSchema = new Schema(
  {
    server: { type: ObjectId, ref: "Server", required: true, index: true },
    name: { type: String, required: true },
    type: { type: String, enum: ["text", "voice"], required: true },
    position: { type: Number, default: 0 },
    // A private channel is hidden from everyone but those who see every private channel, these roles and these people.
    isPrivate: { type: Boolean, default: false },
    allowedRoles: { type: [String], default: [] },
    allowedMembers: { type: [{ type: ObjectId, ref: "User" }], default: [] },
  },
  { timestamps: true },
);

const attachmentSchema = new Schema(
  {
    // Also the last part of the storage key.
    id: { type: String, required: true },
    // Where the bytes are kept (see storage.ts).
    key: { type: String, required: true },
    kind: { type: String, enum: ["image", "voice", "file"], required: true },
    name: { type: String, required: true },
    contentType: { type: String, required: true },
    size: { type: Number, required: true },
    width: Number,
    height: Number,
    // A tiny blurred data: URL shown before the picture is loaded.
    preview: String,
    // Voice notes: length in seconds, and loudness bars (0–31) drawn before anything is downloaded.
    duration: Number,
    waveform: { type: [Number], default: undefined },
  },
  { _id: false },
);

const messageSchema = new Schema(
  {
    channel: { type: ObjectId, ref: "Channel", required: true },
    author: { type: ObjectId, ref: "User", required: true },
    // Empty when the message is only attachments.
    content: { type: String, default: "" },
    editedAt: { type: Date, default: null },
    // Set while the message is pinned to its channel.
    pinnedAt: { type: Date, default: null },
    // A built-in sticker id ("pack/name"); the content then holds the sticker's text.
    sticker: { type: String, default: null },
    replyTo: { type: ObjectId, ref: "Message", default: null },
    // Where a forwarded message came from. Names are copied so the note survives renames, deletions and private channels.
    forwardedFrom: {
      type: new Schema({ author: { type: ObjectId, ref: "User", default: null }, authorName: String, source: String }, { _id: false }),
      default: null,
    },
    // People pinged with "@name", and whether the whole server was pinged with "@everyone".
    mentions: { type: [{ type: ObjectId, ref: "User" }], default: [] },
    mentionEveryone: { type: Boolean, default: false },
    reactions: {
      type: [{ _id: false, emoji: { type: String, required: true }, users: [{ type: ObjectId, ref: "User" }] }],
      default: [],
    },
    // Copied from the upload when the message is sent. A forwarded copy shares the same stored file.
    attachments: { type: [attachmentSchema], default: [] },
  },
  { timestamps: true },
);
messageSchema.index({ channel: 1, _id: -1 });
messageSchema.index({ "attachments.key": 1 });

// A file uploaded to a channel but not sent yet. It joins a message when sent; the sweeper in files.ts drops unsent
// ones after a day, together with their stored bytes (which a TTL index would leave behind).
const uploadSchema = new Schema({
  channel: { type: ObjectId, required: true },
  uploader: { type: ObjectId, ref: "User", required: true },
  file: { type: attachmentSchema, required: true },
  expiresAt: { type: Date, required: true, index: true },
});

// Kept apart from User so the picture is only read when someone asks for it.
const avatarSchema = new Schema({
  user: { type: ObjectId, ref: "User", required: true, unique: true },
  contentType: { type: String, required: true },
  data: { type: Buffer, required: true },
});

// A direct conversation. Its id doubles as the channel id of its messages.
const conversationSchema = new Schema(
  {
    // Sorted ids joined with ":", so the same two people always map to one conversation.
    key: { type: String, required: true, unique: true },
    participants: { type: [{ type: ObjectId, ref: "User" }], required: true, index: true },
    lastMessageAt: { type: Date, default: null },
  },
  { timestamps: true },
);

const eventSchema = new Schema(
  {
    server: { type: ObjectId, ref: "Server", required: true, index: true },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    startsAt: { type: Date, required: true, index: true },
    channel: { type: ObjectId, ref: "Channel", default: null },
    createdBy: { type: ObjectId, ref: "User", required: true },
    interested: [{ type: ObjectId, ref: "User" }],
    // Each alert goes out once; the scheduler marks them here.
    remindedAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    // TTL index: MongoDB removes the event a week after it began.
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { timestamps: true },
);

// One row per pair and direction. A request is "pending" until the other side accepts it.
const friendshipSchema = new Schema(
  {
    requester: { type: ObjectId, ref: "User", required: true },
    recipient: { type: ObjectId, ref: "User", required: true, index: true },
    status: { type: String, enum: ["pending", "accepted"], default: "pending" },
  },
  { timestamps: true },
);
friendshipSchema.index({ requester: 1, recipient: 1 }, { unique: true });

// One row per person pinged by a message (mentioned, replied to, or reached by @everyone).
const notificationSchema = new Schema(
  {
    user: { type: ObjectId, ref: "User", required: true },
    kind: { type: String, enum: ["mention", "everyone", "reply"], required: true },
    message: { type: ObjectId, ref: "Message", required: true, index: true },
    channel: { type: ObjectId, ref: "Channel", required: true },
    server: { type: ObjectId, ref: "Server", required: true },
    author: { type: ObjectId, ref: "User", required: true },
    preview: { type: String, default: "" },
    readAt: { type: Date, default: null },
    // TTL index: MongoDB removes the notification after two weeks.
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { timestamps: true },
);
notificationSchema.index({ user: 1, _id: -1 });

type ModelOf<S extends Schema> = Model<InferSchemaType<S>>;

function getModel<S extends Schema>(name: string, schema: S): ModelOf<S> {
  return (models[name] as ModelOf<S> | undefined) ?? (model(name, schema) as unknown as ModelOf<S>);
}

export const User = getModel("User", userSchema);
export const Session = getModel("Session", sessionSchema);
export const Otp = getModel("Otp", otpSchema);
export const Server = getModel("Server", serverSchema);
export const Member = getModel("Member", memberSchema);
export const Channel = getModel("Channel", channelSchema);
export const Message = getModel("Message", messageSchema);
export const Upload = getModel("Upload", uploadSchema);
export const Friendship = getModel("Friendship", friendshipSchema);
export const Avatar = getModel("Avatar", avatarSchema);
export const Conversation = getModel("Conversation", conversationSchema);
export const Event = getModel("Event", eventSchema);
export const Notification = getModel("Notification", notificationSchema);
