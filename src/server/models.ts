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
  },
  { timestamps: true },
);

const memberSchema = new Schema(
  {
    server: { type: ObjectId, ref: "Server", required: true },
    user: { type: ObjectId, ref: "User", required: true, index: true },
    role: { type: String, enum: ["owner", "admin", "member"], default: "member" },
    mutedUntil: { type: Date, default: null },
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
  },
  { timestamps: true },
);

const messageSchema = new Schema(
  {
    channel: { type: ObjectId, ref: "Channel", required: true },
    author: { type: ObjectId, ref: "User", required: true },
    content: { type: String, required: true },
    editedAt: { type: Date, default: null },
    replyTo: { type: ObjectId, ref: "Message", default: null },
    // People pinged with "@name", and whether the whole server was pinged with "@everyone".
    mentions: { type: [{ type: ObjectId, ref: "User" }], default: [] },
    mentionEveryone: { type: Boolean, default: false },
    reactions: {
      type: [{ _id: false, emoji: { type: String, required: true }, users: [{ type: ObjectId, ref: "User" }] }],
      default: [],
    },
  },
  { timestamps: true },
);
messageSchema.index({ channel: 1, _id: -1 });

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
export const Friendship = getModel("Friendship", friendshipSchema);
export const Avatar = getModel("Avatar", avatarSchema);
export const Conversation = getModel("Conversation", conversationSchema);
export const Event = getModel("Event", eventSchema);
export const Notification = getModel("Notification", notificationSchema);
