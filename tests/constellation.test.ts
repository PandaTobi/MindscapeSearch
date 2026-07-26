import { describe, expect, it } from "vitest";
import { ART_HEIGHT, ART_WIDTH, buildConstellation } from "../src/lib/constellation";

describe("buildConstellation", () => {
  // The masthead is rendered on the server and hydrated on the client; any
  // drift between the two runs is a hydration mismatch on the homepage.
  it("is deterministic for a given seed", () => {
    expect(buildConstellation(7)).toEqual(buildConstellation(7));
  });

  it("varies with the seed", () => {
    expect(buildConstellation(7)).not.toEqual(buildConstellation(8));
  });

  it("collapses filaments into a handful of shared-style paths", () => {
    const { layers } = buildConstellation();
    expect(layers.length).toBeGreaterThan(0);
    expect(layers.length).toBeLessThan(40);
    for (const layer of layers) {
      expect(layer.d).toMatch(/^M[-\d. ]+L[-\d. ]/);
      expect(layer.opacity).toBeGreaterThan(0);
      expect(layer.opacity).toBeLessThanOrEqual(0.3);
    }
  });

  it("keeps every dot inside the artwork frame", () => {
    for (const dot of buildConstellation().dots) {
      expect(dot.cx).toBeGreaterThanOrEqual(0);
      expect(dot.cx).toBeLessThanOrEqual(ART_WIDTH);
      expect(dot.cy).toBeGreaterThanOrEqual(0);
      expect(dot.cy).toBeLessThanOrEqual(ART_HEIGHT);
      expect(dot.r).toBeGreaterThan(0);
    }
  });
});
