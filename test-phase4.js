const fetch = require("node-fetch");

const BASE = "http://localhost:8088";

async function testAIHealth() {
  const res = await fetch(`${BASE}/internal/ai-health`);
  const data = await res.json();
  console.log("AI Health:", res.status, data);
}

async function testScan() {
  const res = await fetch(`${BASE}/scan?lat=10.77&lon=106.69&radiusKm=2`, {
    method: "POST"
  });
  const data = await res.json();
  console.log("Scan:", res.status, "events:", data?.events?.length);
  return data?.events?.[0]?.id;
}

async function testExpand(eventId) {
  const res = await fetch(`${BASE}/events/${eventId}/expand?level=1`, {
    method: "POST"
  });
  const data = await res.json();
  const wordCount = (data?.story_text || "")
    .split(/\s+/)
    .filter(Boolean).length;

  console.log("Expand:", res.status, "wordCount:", wordCount);
}

async function run() {
  await testAIHealth();
  const eventId = await testScan();
  if (eventId) {
    await testExpand(eventId); // first expand
    await testExpand(eventId); // second expand (should NOT call AI)
  } else {
    console.log("No event ID returned.");
  }
}

run();
