import { readFile } from "node:fs/promises";

/** POST the eggs source to the dev live-runner endpoint and print the result. */
const text = await readFile("artifacts/sources/eggs-wikipedia.txt", "utf8");
const res = await fetch("http://localhost:5173/api/build", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ text, title: "Egg as food, health and nutrition", question: "Is eating eggs bad for cardiovascular health?" }),
});
const json = (await res.json()) as { ok?: boolean; stats?: unknown; bundle?: { claims: unknown[]; inferences: unknown[]; matches: unknown[]; challenges: unknown[] }; error?: string };
console.log("HTTP", res.status);
if (json.error) { console.log("ERROR:", json.error); process.exit(1); }
console.log("ok:", json.ok, "| stats:", JSON.stringify(json.stats));
console.log("bundle:", json.bundle?.claims.length, "claims,", json.bundle?.inferences.length, "inferences,", json.bundle?.matches.length, "matches,", json.bundle?.challenges.length, "challenges");
