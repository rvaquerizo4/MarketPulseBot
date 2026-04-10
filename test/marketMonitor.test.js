const { buildDailyReport } = require("../src/marketMonitor");

describe("buildDailyReport", () => {
  test("does not include positive movers in Top Losers", () => {
    const quotes = [
      {
        key: "crypto:BTC",
        symbol: "BTC",
        name: "Bitcoin",
        category: "Crypto",
        currency: "USD",
        price: 71720,
        change24hPct: 1.04,
        volume: 39600000000,
        isStale: false,
      },
      {
        key: "index:WSML.L",
        symbol: "WSML.L",
        name: "iShares MSCI World Small Cap UCITS ETF USD (Acc)",
        category: "Index",
        currency: "USD",
        price: 9.69,
        change24hPct: -0.07,
        volume: 10690,
        isStale: false,
      },
      {
        key: "etf:GLD",
        symbol: "GLD",
        name: "SPDR Gold Shares",
        category: "ETF",
        currency: "USD",
        price: 437.91,
        change24hPct: 0.78,
        volume: 6410000,
        isStale: false,
      },
    ];

    const report = buildDailyReport(quotes, {}, {}, []);
    const losersSection = report.split("<b>⚠️ Top Losers (24h)</b>")[1].split("\n\n")[0];

    expect(losersSection).toContain("WSML.L");
    expect(losersSection).not.toContain("BTC");
    expect(losersSection).not.toContain("GLD");
  });

  test("shows explicit message when there are no losers", () => {
    const quotes = [
      {
        key: "crypto:BTC",
        symbol: "BTC",
        name: "Bitcoin",
        category: "Crypto",
        currency: "USD",
        price: 71720,
        change24hPct: 1.04,
        volume: 39600000000,
        isStale: false,
      },
      {
        key: "etf:GLD",
        symbol: "GLD",
        name: "SPDR Gold Shares",
        category: "ETF",
        currency: "USD",
        price: 437.91,
        change24hPct: 0.78,
        volume: 6410000,
        isStale: false,
      },
    ];

    const report = buildDailyReport(quotes, {}, {}, []);

    expect(report).toContain("No assets with negative 24h change in fresh data.");
  });
});
