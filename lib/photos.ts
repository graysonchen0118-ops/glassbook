// Real photos from Unsplash, checked for crests, sponsors and brand names before use.
// Keys match the `photo` field of each event and the page banners.
const ID: Record<string, string> = {
  stadium_night_1: "photo-1789476332262-3f9826198129",
  stadium_night_2: "photo-1791820606704-19d0def620b2",
  stadium_night_3: "photo-1647118868186-70d38e10b0dc",
  stadium_night_4: "photo-1782471714754-4d0197e7570e",
  football_action_1: "photo-1431324155629-1a6deb1dec8d",
  football_action_2: "photo-1759210720456-c9814f721479",
  football_action_3: "photo-1560272564-c83b66b1ad12",
  fans_1: "photo-1783335329013-a2b063f969e7",
  fans_2: "photo-1558151748-f2621b5e52f0",
  fans_3: "photo-1775725181770-33ffdd9b8e96",
  basketball_1: "photo-1639843091936-bb5fca7b5684",
  basketball_2: "photo-1556168505-d00e911d52eb",
  tennis_1: "photo-1554068865-24cecd4e34b8",
  tennis_2: "photo-1545151414-8a948e1ea54f",
  tennis_3: "photo-1711290453815-43c5651e8ac8",
  fight_1: "photo-1552072092-7f9b8d63efcb",
  fight_2: "photo-1777305628889-13832df3e542",
  phone_watch_1: "photo-1509473383868-b934025a9bc3",
  phone_watch_2: "photo-1545558490-d4ca82897db4",
  floodlights_1: "photo-1509928015542-fcc9b3bcd048",
  floodlights_2: "photo-1638573615178-6f2950746614",
  ice_hockey_1: "photo-1768309793461-39ed3736e937",
  ball_grass_1: "photo-1660926655155-8b1f8f9079f5",
  ball_grass_2: "photo-1634114441919-7636abb21cae",
};

/** imgix crops that keep a brand out of frame */
const CROP: Record<string, string> = {
  stadium_night_4: "rect=0,0,3000,2790",
};

const FALLBACK = "photo-1789476332262-3f9826198129";

function resolve(key: string) {
  if (ID[key]) return key;
  const first = key.replace(/_\d+$/, "_1");
  return ID[first] ? first : "stadium_night_1";
}

export function photoId(key: string) {
  return ID[resolve(key)] ?? FALLBACK;
}

export function photo(key: string, w: number, h: number) {
  const k = resolve(key);
  const crop = CROP[k] ? `&${CROP[k]}` : "";
  return `https://images.unsplash.com/${photoId(k)}?w=${w}&h=${h}&fit=crop&q=75&auto=format${crop}`;
}
