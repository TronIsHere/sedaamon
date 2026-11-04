import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { DeleteObjectsCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

/**
 * Where uploaded files live: an S3-compatible bucket when S3_ENDPOINT is set (ParsPack, Arvan, MinIO…),
 * otherwise a folder on this machine, which is enough for development and for a single small server.
 */
interface Storage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  remove(keys: string[]): Promise<void>;
}

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function s3Storage(): Storage {
  const client = new S3Client({
    endpoint: requireEnv("S3_ENDPOINT"),
    region: process.env.S3_REGION ?? "us-east-1",
    credentials: { accessKeyId: requireEnv("S3_ACCESS_KEY_ID"), secretAccessKey: requireEnv("S3_SECRET_ACCESS_KEY") },
    // Most Iranian providers serve buckets path-style: https://endpoint/bucket/key
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
  });
  const Bucket = requireEnv("S3_BUCKET");
  return {
    async put(key, body, contentType) {
      await client.send(new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: contentType }));
    },
    async get(key) {
      try {
        const res = await client.send(new GetObjectCommand({ Bucket, Key: key }));
        return res.Body ? Buffer.from(await res.Body.transformToByteArray()) : null;
      } catch (err) {
        if ((err as { name?: string }).name === "NoSuchKey") return null;
        throw err;
      }
    },
    async remove(keys) {
      if (!keys.length) return;
      await client.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true } }));
    },
  };
}

function diskStorage(): Storage {
  const root = path.resolve(process.env.UPLOAD_DIR ?? "uploads");
  // Keys are made on the server from ids, but never let one walk out of the folder.
  const fileOf = (key: string) => {
    const file = path.resolve(root, key);
    if (!file.startsWith(root + path.sep)) throw new Error(`Bad storage key: ${key}`);
    return file;
  };
  return {
    async put(key, body) {
      const file = fileOf(key);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, body);
    },
    async get(key) {
      return readFile(fileOf(key)).catch(() => null);
    },
    async remove(keys) {
      await Promise.all(keys.map((key) => rm(fileOf(key), { force: true })));
    },
  };
}

let storage: Storage | null = null;

export function getStorage() {
  storage ??= process.env.S3_ENDPOINT ? s3Storage() : diskStorage();
  return storage;
}
