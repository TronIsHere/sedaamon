import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const { ObjectId } = Schema.Types;

const userSchema = new Schema(
  {
    phone: { type: String, required: true, unique: true },
    name: { type: String, default: "" },
    color: { type: String, required: true },
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
    role: { type: String, enum: ["owner", "member"], default: "member" },
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
  },
  { timestamps: true },
);
messageSchema.index({ channel: 1, _id: -1 });

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
