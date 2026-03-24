import { Client } from "@heroiclabs/nakama-js";

export const client = new Client(
  "defaultkey",
  "140.238.227.116",
  "7350",
  false,
);

export function getDeviceId(): string {
  let id = localStorage.getItem("deviceId");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("deviceId", id);
  }
  return id;
}
