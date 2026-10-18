import { expect, it } from "vitest";
import { routeFromQuestion } from "./rail-intent";
it("recognises Darbhanga se Delhi train enquiry without model extraction", () => {
  expect(routeFromQuestion("Darbhanga se Delhi ke liye kaun kaun si train hai check kar ke batao"))
    .toEqual({ from: "darbhanga", to: "delhi" });
});
it("recognises English station routes", () => {
  expect(routeFromQuestion("trains from DBG to NDLS today")).toEqual({ from: "dbg", to: "ndls" });
});