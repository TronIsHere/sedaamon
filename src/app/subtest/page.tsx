"use client";
import { useState } from "react";
import { Room } from "livekit-client";
import { RoomContext } from "@livekit/components-react";
import { CinemaStage } from "@/components/app/Cinema";
const note = (m: string) => console.log(m);
export default function Page() {
  const [room] = useState(() => new Room());
  return (
    <RoomContext.Provider value={room}>
      <div className="flex h-dvh flex-col"><CinemaStage channelId="" participants={[]} onNotify={note} /></div>
    </RoomContext.Provider>
  );
}
