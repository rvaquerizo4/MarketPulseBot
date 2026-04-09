const {
  calculatePercentageChange,
  shouldSendAlert,
  buildAlertMessage,
} = require("../src/alerts/engine");

describe("alerts engine", () => {
  test("calculatePercentageChange returns correct percentage", () => {
    expect(calculatePercentageChange(110, 100)).toBeCloseTo(10, 6);
    expect(calculatePercentageChange(90, 100)).toBeCloseTo(-10, 6);
  });

  test("calculatePercentageChange returns null for invalid previous price", () => {
    expect(calculatePercentageChange(100, 0)).toBeNull();
    expect(calculatePercentageChange(100, Number.NaN)).toBeNull();
  });

  test("shouldSendAlert returns true when movement exceeds threshold and no cooldown", () => {
    const nowMs = Date.now();
    const item = {
      key: "etf:SPY",
      category: "ETF",
      symbol: "SPY",
      price: 505,
      isStale: false,
    };
    const prev = { price: 500 };

    expect(shouldSendAlert(item, prev, null, nowMs)).toBe(true);
  });

  test("shouldSendAlert returns false when in cooldown", () => {
    const nowMs = Date.now();
    const item = {
      key: "etf:SPY",
      category: "ETF",
      symbol: "SPY",
      price: 505,
      isStale: false,
    };
    const prev = { price: 500 };
    const lastAlertIso = new Date(nowMs).toISOString();

    expect(shouldSendAlert(item, prev, lastAlertIso, nowMs)).toBe(false);
  });

  test("buildAlertMessage formats a Telegram-ready message", () => {
    const message = buildAlertMessage({
      symbol: "AAPL",
      category: "Stocks",
      currentPrice: 190,
      previousPrice: 185,
      name: "Apple Inc.",
      currency: "USD",
      deltaPct: 2.7,
      change24hPct: 1.9,
      accumulatedChangePct: 3.2,
      volume: 1234567,
      level: { key: "strong", label: "Strong", emoji: "🟠" },
    });

    expect(message).toContain("<b>Strong</b>");
    expect(message).toContain("<b>AAPL</b>");
    expect(message).toContain("since the last check");
    expect(message).toContain("Accumulated");
  });
});
