import dgram from "node:dgram";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";

const MESSAGE = "TASK10_DATABASE_DISABLED_SENTINEL: network, database, Storage, RPC, and remote-provider I/O are forbidden";

function blocked() {
  throw new Error(MESSAGE);
}

globalThis.__TASK10_DATABASE_DISABLED_SENTINEL__ = Object.freeze({ active: true, message: MESSAGE });
globalThis.fetch = blocked;
net.connect = blocked;
net.createConnection = blocked;
tls.connect = blocked;
http.request = blocked;
http.get = blocked;
https.request = blocked;
https.get = blocked;
dgram.createSocket = blocked;
