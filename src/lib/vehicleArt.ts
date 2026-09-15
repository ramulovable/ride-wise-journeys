import bike from "@/assets/vehicle-bike.png";
import scooty from "@/assets/vehicle-scooty.png";
import auto from "@/assets/vehicle-auto.png";
import erickshaw from "@/assets/vehicle-erickshaw.png";
import car from "@/assets/vehicle-car.png";

/** Built-in artwork for the five ride categories. Admin uploads always take priority. */
const BY_NAME: Record<string, string> = {
  bike: bike,
  scooty: scooty,
  scooter: scooty,
  auto: auto,
  "auto rickshaw": auto,
  "electric auto": auto,
  "e-rickshaw": erickshaw,
  "e rickshaw": erickshaw,
  toto: erickshaw,
  car: car,
};

const BY_CLASS: Record<string, string> = {
  two_wheeler: bike,
  three_wheeler: auto,
  four_wheeler: car,
};

export function categoryArtwork(name?: string | null, vehicleClass?: string | null): string {
  const key = (name ?? "").trim().toLowerCase();
  return BY_NAME[key] ?? BY_CLASS[vehicleClass ?? ""] ?? car;
}
