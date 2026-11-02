import { cookies } from "next/headers";
import { handle } from "@/server/http";
import { deleteSession, SESSION_COOKIE } from "@/server/session";

export const POST = handle(async () => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(token);
  jar.delete(SESSION_COOKIE);
});
