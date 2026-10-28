// Invented clubs, players and venues. Nothing here is a real team or a real result.
import type { Sport } from "../types";

export const FOOTBALL: { league: string; clubs: string[] }[] = [
  { league: "Premier North", clubs: ["Kingsport Rovers", "Calder City", "Ashby Town", "Northgate United", "Harbour Athletic", "Millbrook FC", "Redcliffe Albion", "Westmoor Wanderers"] },
  { league: "Coastal Liga", clubs: ["Porto Vale", "Atlético Marisol", "Deportivo Brisa", "Real Costa Azul", "Sporting Ribeira", "Unión Playa Honda"] },
  { league: "Alpine Division", clubs: ["Grauberg 04", "Alpenstadt FC", "Union Sankt Felden", "Inter Lago", "FC Bergtal", "Olympique Maresse"] },
];

export const BASKETBALL = { league: "Coast League", clubs: ["Bayside Breakers", "Ironvale Miners", "Summit Owls", "Delta Herons", "Capital Comets", "Riverport Kings"] };
export const TENNIS = { league: "Harbour Open", players: ["L. Marchetti", "D. Okafor", "S. Lindqvist", "K. Haraguchi", "M. Duarte", "A. Petrova", "J. Whitcombe", "R. Santoro"] };
export const HOCKEY = { league: "North Ice League", clubs: ["Northlake Pike", "Frostburg Lynx", "Granite Bay Moose", "Copper Ridge Owls", "Pine Hollow Bears", "Silverton Wolves"] };
export const FIGHT = { league: "Fight Night 41", fighters: ["T. Kade", "R. Ilunga", "M. Varga", "D. Achebe", "J. Moreau", "S. Brandt"] };

export const SPORT_LABEL: Record<Sport, string> = {
  football: "Football",
  basketball: "Basketball",
  tennis: "Tennis",
  hockey: "Ice hockey",
  fight: "Fights",
};

export function venueOf(sport: Sport, home: string) {
  const first = home.replace(/^(FC|Real|Atlético|Deportivo|Sporting|Unión|Union|Inter|Olympique) /, "").split(" ")[0];
  if (sport === "tennis") return "Centre Court, Harbour Open";
  if (sport === "fight") return "Dockside Hall";
  if (sport === "basketball" || sport === "hockey") return `${first} Arena`;
  return `${first} Park`;
}
