import pg from "pg";
import { createDecipheriv } from "crypto";

const { Client } = pg;
const encKey = Buffer.from("cdcc1ea6785326c3bf7031e9552eeeffaac50c5e7f52a2df9a2622f9181d6808", "hex");

function decrypt(encoded) {
  if (encoded.startsWith("enc:")) encoded = encoded.slice(4);
  const combined = Buffer.from(encoded, "base64");
  const iv = combined.subarray(0, 12);
  const authTag = combined.subarray(12, 28);
  const ciphertext = combined.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", encKey, iv, { authTagLength: 16 });
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

const client = new Client({ connectionString: "postgresql://supabase_admin:79556eed6283216114e83d96beb7ad5a@db.buildmatic.ai:54401/postgres" });
await client.connect();
const { rows } = await client.query("SELECT ipv4_address, mgmt_api_token, mgmt_api_port FROM droplets WHERE ipv4_address = '134.209.74.255'");
const d = rows[0];
const mgmtToken = decrypt(d.mgmt_api_token);
await client.end();

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const mgmtBase = `https://${d.ipv4_address}:${d.mgmt_api_port}`;
const headers = { "Authorization": "Bearer " + mgmtToken, "Content-Type": "application/json" };

// Force restart via systemctl
console.log("=== Restarting gateway via systemctl ===");
const shRes = await fetch(mgmtBase + "/shell", {
  method: "POST", headers,
  body: JSON.stringify({ command: 'bash -c "systemctl restart openclaw 2>&1; echo exit=$?"' }),
  signal: AbortSignal.timeout(15000),
});
const shData = await shRes.json();
console.log(shData.stdout?.trim() || shData.error);

// Wait for gateway to come back up
console.log("\nWaiting for gateway startup...");
for (let i = 0; i < 36; i++) {
  await new Promise(r => setTimeout(r, 5000));
  process.stdout.write(`  ${(i + 1) * 5}s...`);
  try {
    const healthRes = await fetch(mgmtBase + "/health", { headers, signal: AbortSignal.timeout(3000) });
    const h = await healthRes.json();
    if (h.ok && h.gatewayRunning && h.uptime < 120) {
      console.log(` UP! (uptime: ${Math.round(h.uptime)}s, agents: ${h.agentCount})`);
      break;
    }
  } catch {}
}

// Final health
console.log("\n=== Final Health ===");
const finalHealth = await fetch(mgmtBase + "/health", { headers, signal: AbortSignal.timeout(5000) });
console.log(JSON.stringify(await finalHealth.json(), null, 2));
