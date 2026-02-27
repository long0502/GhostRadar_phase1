const fetch = require("node-fetch");

const BASE = "http://localhost:8088";

async function testAIHealth() {
  const res = await fetch(`${BASE}/internal/ai-health`);
  const data = await res.json();
  console.log("AI Health:", res.status, data);
}

async function testScan(label) {
  const res = await fetch(`${BASE}/scan?lat=10.77&lon=106.69&radiusKm=2`, {
    method: "POST"
  });
  const data = await res.json();

  const eventCount = data?.events?.length || 0;
  const firstId = data?.events?.[0]?.id;

  console.log(`${label} Scan:`, res.status, "events:", eventCount, "firstId:", firstId);

  return { firstId };
}

async function testExpand(eventId, label) {
  const res = await fetch(`${BASE}/events/${eventId}/expand?level=1`, {
    method: "POST"
  });

  const data = await res.json();

  const wordCount = (data?.story_text || "")
    .split(/\s+/)
    .filter(Boolean).length;

  console.log(`${label} Expand:`, res.status, "wordCount:", wordCount);

  return { status: res.status, wordCount };
}

async function run() {
  await testAIHealth();

  // First scan (likely MISS)
  const first = await testScan("FIRST");

  if (!first.firstId) {
    console.log("No event ID returned. STOP.");
    return;
  }

  // Second scan (should be HIT)
  const second = await testScan("SECOND");

  if (first.firstId !== second.firstId) {
    console.log("WARNING: firstId mismatch between MISS and HIT");
  }

  // Expand first time (should generate story)
  const exp1 = await testExpand(first.firstId, "FIRST");

  // Expand second time (should NOT call AI again)
  const exp2 = await testExpand(first.firstId, "SECOND");

  console.log("TEST COMPLETE");
}

run();
