const { calculateRSI, rsiLabel } = require("../src/rsi");

describe("RSI", () => {
  test("calculateRSI returns null with insufficient data", () => {
    const result = calculateRSI([
      { ts: 1, price: 100 },
      { ts: 2, price: 101 },
    ]);
    expect(result).toBeNull();
  });

  test("calculateRSI returns a number between 0 and 100", () => {
    const entries = Array.from({ length: 20 }, (_, i) => ({
      ts: i,
      price: 100 + Math.sin(i) * 4,
    }));

    const result = calculateRSI(entries);
    expect(typeof result).toBe("number");
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(100);
  });

  test("rsiLabel maps thresholds", () => {
    expect(rsiLabel(80)).toBe("Overbought");
    expect(rsiLabel(20)).toBe("Oversold");
    expect(rsiLabel(50)).toBe("Neutral");
  });
});
