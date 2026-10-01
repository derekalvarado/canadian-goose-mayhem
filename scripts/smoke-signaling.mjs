import assert from "node:assert/strict";

const serviceUrl = new URL(process.argv[2] ?? "http://127.0.0.1:8787");
serviceUrl.protocol = serviceUrl.protocol === "https:" ? "wss:" : "ws:";
const roomId = "smoke_room_1234567890abcdefghijkl";
const key = "smoke_key_1234567890abcdefghijklmn";

function connect(role) {
  const url = new URL(`/rooms/${roomId}`, serviceUrl);
  url.search = new URLSearchParams({ role, key }).toString();
  const socket = new WebSocket(url);
  const messages = [];
  socket.addEventListener("message", (event) => {
    if (typeof event.data === "string") messages.push(JSON.parse(event.data));
  });
  return new Promise((resolve, reject) => {
    socket.addEventListener("open", () => resolve({ socket, messages }), { once: true });
    socket.addEventListener("error", () => reject(new Error(`${role} WebSocket failed to open.`)), { once: true });
  });
}

async function waitFor(messages, predicate, label) {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    const match = messages.find(predicate);
    if (match) return match;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

const host = await connect("host");
const guest = await connect("guest");
const offer = { type: "offer", version: 1, description: { type: "offer", sdp: "v=0\r\nsmoke-offer" } };
host.socket.send(JSON.stringify(offer));
assert.deepEqual(await waitFor(guest.messages, (message) => message.type === "offer", "offer"), offer);

const answer = { type: "answer", version: 1, description: { type: "answer", sdp: "v=0\r\nsmoke-answer" } };
guest.socket.send(JSON.stringify(answer));
assert.deepEqual(await waitFor(host.messages, (message) => message.type === "answer", "answer"), answer);

host.socket.close();
guest.socket.close();
console.log("Signaling room relayed one host offer and one guest answer.");
