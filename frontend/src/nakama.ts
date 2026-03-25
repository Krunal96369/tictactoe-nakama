import { Client } from "@heroiclabs/nakama-js";

export const client = new Client(
  import.meta.env.VITE_NAKAMA_KEY || "defaultkey",
  "nakama.krunalchauhan.me",
  "443",
  true,
);

export function getDeviceId(): string {
  let id = localStorage.getItem("deviceId");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("deviceId", id);
  }
  return id;
}
