import { describe, expect, it } from "vitest";
import { abortVerdict, formatTable, median, parseArgs, parseSseText, percentile } from "../scripts/latency-lib";

describe("latency-lib", () => {
  it("parseArgs: Pflichtfelder, Default runs, Grenzen", () => {
    expect(parseArgs(["--endpoint", "http://x:1/", "--models", "a, b"])).toEqual({ endpoint: "http://x:1", models: ["a", "b"], runs: 5 });
    expect(parseArgs(["--models", "a"])).toHaveProperty("error");
    expect(parseArgs(["--endpoint", "e"])).toHaveProperty("error");
    expect(parseArgs(["--endpoint", "e", "--models", "a", "--runs", "0"])).toHaveProperty("error");
    expect(parseArgs(["--endpoint", "e", "--models", "a", "--runs", "7"])).toMatchObject({ runs: 7 });
  });
  it("median und p90", () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90)).toBe(9);
    expect(percentile([5], 90)).toBe(5);
    expect(percentile([], 90)).toBeNull();
  });
  it("parseSseText: Chat und FIM, Rest bleibt", () => {
    const chat = parseSseText('data: {"choices":[{"delta":{"content":"ab"}}]}\ndata: [DONE]\ndata: {"cho', "chat");
    expect(chat.texts).toEqual(["ab"]);
    expect(chat.rest).toBe('data: {"cho');
    expect(parseSseText('data: {"choices":[{"text":"xy"}]}\n', "fim").texts).toEqual(["xy"]);
    expect(parseSseText('data: {"choices":[{"text":"xy"}]}\n', "chat").texts).toEqual([]);
  });
  it("Tabelle maskiert Pipes und Umbrueche", () => {
    const t = formatTable([{ model: "m", path: "Chat", cold: "1 ms", warmMedian: "2 ms", warmP90: "3 ms", abort: "–", sample: "a|b\nc" }]);
    expect(t.split("\n")).toHaveLength(3);
    expect(t).toContain("a\\|b c");
  });
  it("abortVerdict", () => {
    expect(abortVerdict(null, 100)).toBe("–");
    expect(abortVerdict(1500, 200)).toContain("rechnet weiter");
    expect(abortVerdict(250, 200)).toContain("ok");
  });
});
