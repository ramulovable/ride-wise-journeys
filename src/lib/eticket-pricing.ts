type RideFare = {
  journeyType: string;
  requestedAc: boolean | null;
  fare: number | null;
  unitFare: number | null;
  available: boolean;
  ruleId: string | null;
  calculation: unknown;
  pricingPeriod: string;
};
type RideCategory = {
  categoryId: string;
  categoryName: string;
  vehicleClass: string;
  seatCapacity: number;
  fares: RideFare[];
};

/** No second price formula: each prepaid option carries the ride engine's exact total. */
export function ticketOptions(categories: RideCategory[], passengers: number) {
  return categories.flatMap((category) => category.fares.flatMap((option) => {
    if (option.fare == null || option.fare <= 0 || option.unitFare == null) return [];
    const suffix = option.journeyType === "share" ? "Shared" : option.journeyType === "reserve" ? "Reserve" : "";
    const ac = option.requestedAc == null ? "" : option.requestedAc ? "AC" : "Non-AC";
    return [{
      optionId: `${category.categoryId}:${option.journeyType}:${option.requestedAc == null ? "any" : option.requestedAc ? "ac" : "non_ac"}`,
      categoryId: category.categoryId,
      name: [category.categoryName, suffix, ac].filter(Boolean).join(" · "),
      seatCapacity: category.seatCapacity,
      fare: option.fare,
      available: passengers <= category.seatCapacity,
      journeyType: option.journeyType,
      requestedAc: option.requestedAc,
      snapshot: { ruleId: option.ruleId, vehicleClass: category.vehicleClass, categoryName: category.categoryName,
        journeyType: option.journeyType, requestedAc: option.requestedAc, unitFare: option.unitFare,
        totalFare: option.fare, passengers, calculation: option.calculation, pricingPeriod: option.pricingPeriod },
    }];
  }));
}