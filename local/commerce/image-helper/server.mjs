import { createServer } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";
import { readLocalCommerceConfig } from "../../../app/application/local-commerce-environment.ts";
import { MAX_IMAGE_BYTES, processLocalImage } from "./processor.mjs";

function equalSecret(left, right) {
  return timingSafeEqual(createHash("sha256").update(left).digest(), createHash("sha256").update(right).digest());
}

export function createLocalImageHelper(environment) {
  const parsed = readLocalCommerceConfig(environment);
  const secret = environment.LOCAL_COMMERCE_IMAGE_HELPER_SECRET;
  const marker = environment.LOCAL_COMMERCE_MARKER_DIGEST;
  if (parsed.status !== "ready" || !["development", "test"].includes(environment.NODE_ENV)
    || environment.NODE_ENV !== parsed.config.environment
    || !/^[A-Za-z0-9_-]{43,128}$/.test(secret ?? "") || !/^[a-f0-9]{64}$/.test(marker ?? "")) {
    throw new Error("Local image helper configuration unavailable.");
  }
  const { config } = parsed;
  const expectedHost = new URL(config.endpoints.imageHelperUrl).host;
  let processing = false;
  const server = createServer(async (request, response) => {
    const send = (status, body) => {
      response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
      response.end(JSON.stringify(body));
    };
    try {
      if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress)
        || request.headers.host !== expectedHost || request.headers.origin !== undefined
        || request.headers["sec-fetch-site"] !== undefined
        || request.method !== "POST" || request.url !== "/process"
        || request.headers["content-type"] !== "application/octet-stream"
        || request.headers["x-commerce-project"] !== config.projectId
        || request.headers["x-commerce-marker"] !== marker
        || !equalSecret(String(request.headers.authorization ?? ""), `Bearer ${secret}`)) {
        send(403, { status: "unavailable" }); return;
      }
      const rawPolicy = request.headers["x-image-policy"];
      if (typeof rawPolicy !== "string" || rawPolicy.length > 2048) { send(400, { status: "rejected" }); return; }
      const policy = JSON.parse(rawPolicy);
      // One bounded decode at a time, including while receiving its input.
      if (processing) { send(503, { status: "unavailable" }); return; }
      processing = true;
      try {
        let length = 0;
        const chunks = [];
        for await (const chunk of request) {
          length += chunk.length;
          if (length > MAX_IMAGE_BYTES) { send(413, { status: "rejected" }); return; }
          chunks.push(chunk);
        }
        const result = await processLocalImage(Buffer.concat(chunks, length), policy);
        if (result.status !== "processed") { send(400, result); return; }
        const { png, ...metadata } = result;
        send(200, { ...metadata, png: png.toString("base64") });
      } finally { processing = false; }
    } catch { send(400, { status: "rejected" }); }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  return { server, port: config.ports.imageHelper };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { server, port } = createLocalImageHelper(process.env);
  server.listen(port, "127.0.0.1", () => {
    // No credentials, filenames, input payloads, paths or locators in logs.
    process.stdout.write("Local development/test image helper ready.\n");
  });
}
