const test = require("node:test");
const assert = require("node:assert/strict");

const { calculateRSI, rsiLabel } = require("../src/rsi");

test("calculateRSI returns null with insufficient data", () => {
  const result = calculateRSI([
    { ts: 1, price: 100 },
    { ts: 2, price: 101 },
  ]);
  assert.equal(result, null);
});

test("calculateRSI returns a number between 0 and 100", () => {
  const entries = Array.from({ length: 20 }, (_, i) => ({
    ts: i,
    price: 100 + Math.sin(i) * 4,
  }));

  const result = calculateRSI(entries);
  assert.equal(typeof result, "number");
  assert.ok(result >= 0 && result <= 100);
});

test("rsiLabel maps thresholds", () => {
  assert.equal(rsiLabel(80), "Overbought");
  assert.equal(rsiLabel(20), "Oversold");
  assert.equal(rsiLabel(50), "Neutral");
});
