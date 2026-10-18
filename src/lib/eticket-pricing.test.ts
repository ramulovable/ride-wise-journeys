import { describe, expect, it } from "vitest";
import { ticketOptions } from "./eticket-pricing";

const category = (fares: Array<{ fare: number; journeyType: string; requestedAc: boolean | null }>) => [{
  categoryId: "bike", categoryName: "Bike", vehicleClass: "two_wheeler", seatCapacity: 2,
  fares: fares.map(f => ({ ...f, unitFare: f.fare, available: false, ruleId: "rule", calculation: {}, pricingPeriod: "day" })),
}];
describe("E-Ticket uses the online ride fare without recalculation", () => {
  it("preserves the exact distance-derived bike fare", () => {
    expect(ticketOptions(category([{ fare: 42, journeyType: "standard", requestedAc: null }]), 1)[0]?.fare).toBe(42);
  });
  it("does not multiply standard vehicle fares by passengers", () => {
    expect(ticketOptions(category([{ fare: 42, journeyType: "standard", requestedAc: null }]), 2)[0]?.fare).toBe(42);
  });
  it("preserves fractional shared totals from the ride engine", () => {
    expect(ticketOptions(category([{ fare: 25.2, journeyType: "share", requestedAc: null }]), 1)[0]?.fare).toBe(25.2);
  });
  it("preserves the night total rather than applying a second multiplier", () => {
    const cats = category([{ fare: 84, journeyType: "standard", requestedAc: null }]);
    cats[0].fares[0].pricingPeriod = "night";
    expect(ticketOptions(cats, 1)[0]?.fare).toBe(84);
  });
  it("keeps AC and non-AC separate with their own exact prices", () => {
    const options = ticketOptions(category([{ fare: 150, journeyType: "standard", requestedAc: true }, { fare: 120, journeyType: "standard", requestedAc: false }]), 1);
    expect(options.map(o => o.fare)).toEqual([150, 120]);
    expect(new Set(options.map(o => o.optionId)).size).toBe(2);
  });
});