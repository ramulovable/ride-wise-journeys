export const rupees = (value: number | string) =>
  `₹${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export const RIDE_STATUS_LABEL: Record<string, string> = {
  requested: "Requested",
  searching: "Searching for a driver",
  accepted: "Driver accepted",
  on_the_way: "Driver on the way",
  arrived: "Driver arrived",
  started: "Trip started",
  completed: "Completed",
  cancelled: "Cancelled",
  no_rider_available: "No driver available",
};

export const RIDE_FLOW = ["accepted", "on_the_way", "arrived", "started", "completed"] as const;

export function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}
