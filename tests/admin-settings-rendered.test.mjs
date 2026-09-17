import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("H19 settings page renders editable support email and read-only runtime states", () => {
  const page = readFileSync("app/admin/settings/page.tsx", "utf8");
  const editor = readFileSync("app/admin/settings/AdminSettingsEditor.tsx", "utf8");
  const route = readFileSync("app/api/admin/settings/route.ts", "utf8");
  assert.match(page, /AdminSettingsEditor/);
  assert.match(editor, /Support email/);
  assert.match(editor, /Brand name/);
  assert.match(editor, /Site origin/);
  assert.match(editor, /Provider activation/);
  assert.match(editor, /Digital delivery policy/);
  assert.match(editor, /expectedVersion/);
  assert.match(editor, /Idempotency-Key/);
  assert.match(route, /handleAdminSettings/);
  assert.doesNotMatch(`${page}\n${editor}`, /ADMIN_PASSWORD|SERVICE_ROLE|STRIPE_SECRET|RESEND_API|private.*key|provider.*configure/i);
});
