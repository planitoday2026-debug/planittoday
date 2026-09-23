import { z } from "zod";
export const cities = [
  "Mumbai",
  "Delhi",
  "Bengaluru",
  "Goa",
  "Jaipur",
  "Kerala",
  "Kyoto",
] as const;
export const destinations = ["Goa", "Jaipur", "Kerala", "Kyoto"] as const;
export const categorySchema = z.enum([
  "flights",
  "hotels",
  "trains",
  "buses",
  "packages",
  "cabs",
]);
export type Category = z.infer<typeof categorySchema>;
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    "Enter a valid date",
  );
export const searchSchema = z
  .object({
    category: categorySchema,
    from: z.enum(cities),
    to: z.enum(cities),
    start: date,
    end: date,
    travelers: z.number().int().min(1).max(9),
    rooms: z.number().int().min(1).max(5).default(1),
    cabin: z
      .enum([
        "Economy",
        "Premium economy",
        "Business",
        "AC chair car",
        "Sleeper",
        "AC sleeper",
      ])
      .default("Economy"),
    direction: z.enum(["outbound", "return"]).default("outbound"),
    roundtrip: z.boolean().default(true),
  })
  .superRefine((v, c) => {
    if (
      v.category === "flights" &&
      !["Economy", "Premium economy", "Business"].includes(v.cabin)
    )
      c.addIssue({
        code: "custom",
        path: ["cabin"],
        message: "Choose a valid flight cabin",
      });
    if (v.start < new Date().toISOString().slice(0, 10))
      c.addIssue({
        code: "custom",
        path: ["start"],
        message: "Choose a future departure date",
      });
    if (v.end < v.start)
      c.addIssue({
        code: "custom",
        path: ["end"],
        message: "Return must be on or after departure",
      });
    if (v.category === "hotels" && v.end === v.start)
      c.addIssue({
        code: "custom",
        path: ["end"],
        message: "A stay needs at least one night",
      });
    if (v.category !== "hotels" && v.category !== "packages" && v.from === v.to)
      c.addIssue({
        code: "custom",
        path: ["to"],
        message: "Choose different origin and destination cities",
      });
    if (nights(v.start, v.end) > 30)
      c.addIssue({
        code: "custom",
        path: ["end"],
        message: "Please choose a trip of 30 nights or fewer",
      });
  });
export type Search = z.infer<typeof searchSchema>;
export const defaultSearch: Search = {
  category: "flights",
  from: "Mumbai",
  to: "Goa",
  start: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  end: new Date(Date.now() + 34 * 86400000).toISOString().slice(0, 10),
  travelers: 2,
  rooms: 1,
  cabin: "Economy",
  direction: "outbound",
  roundtrip: true,
};
export const profileSchema = z
  .object({
    destination: z.enum(destinations),
    origin: z.enum(cities),
    start: date,
    end: date,
    adults: z.number().int().min(1).max(8),
    children: z.number().int().min(0).max(6),
    childAges: z.string().max(100),
    composition: z.enum([
      "Solo",
      "Couple",
      "Friends",
      "Family",
      "Multigenerational",
    ]),
    occasion: z.string().max(100),
    budget: z.number().int().min(5000).max(2000000),
    priority: z.enum([
      "Balanced",
      "Better stays",
      "More experiences",
      "Lowest cost",
    ]),
    flexibility: z.enum(["Fixed", "Flexible by 2 days"]),
    pace: z.enum(["Relaxed", "Balanced", "Packed"]),
    morning: z.enum(["Early start", "Slow mornings"]),
    interests: z
      .array(
        z.enum([
          "Food",
          "Culture",
          "Nature",
          "Beaches",
          "Adventure",
          "Shopping",
          "Wellness",
          "Nightlife",
        ]),
      )
      .min(1)
      .max(8),
    stay: z.enum(["Boutique", "Resort", "Budget", "Apartment"]),
    diet: z.enum(["No preference", "Vegetarian", "Vegan", "Halal", "Other"]),
    mobility: z.enum([
      "No restrictions",
      "Limit walking",
      "Step-free required",
    ]),
    transport: z.enum(["Private cab", "Public transport", "Mix of both"]),
    mustDo: z.string().max(600),
    avoid: z.string().max(600),
    notes: z.string().max(1000),
    arrivalTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    departureTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    consent: z.literal(true),
  })
  .superRefine((v, c) => {
    const n = nights(v.start, v.end);
    if (n < 1 || n > 13)
      c.addIssue({
        code: "custom",
        path: ["end"],
        message: "Choose a trip between 2 and 14 days",
      });
    if (v.start < new Date().toISOString().slice(0, 10))
      c.addIssue({
        code: "custom",
        path: ["start"],
        message: "Choose a future trip date",
      });
    if (v.adults + v.children > 9)
      c.addIssue({
        code: "custom",
        path: ["adults"],
        message: "The preview supports up to 9 travellers",
      });
    if (v.origin === v.destination)
      c.addIssue({
        code: "custom",
        path: ["origin"],
        message: "Choose a different starting city",
      });
    if (v.children > 0) {
      const ages = v.childAges.split(",").map((s) => Number(s.trim()));
      if (
        !v.childAges.trim() ||
        v.childAges.split(",").some((a) => !a.trim()) ||
        ages.length !== v.children ||
        ages.some((a) => !Number.isInteger(a) || a < 0 || a > 17)
      )
        c.addIssue({
          code: "custom",
          path: ["childAges"],
          message: "Enter one age (0–17) per child, separated by commas",
        });
    }
  });
export type Profile = z.infer<typeof profileSchema>;
export const defaultProfile: Profile = {
  destination: "Goa",
  origin: "Mumbai",
  start: defaultSearch.start,
  end: defaultSearch.end,
  adults: 2,
  children: 0,
  childAges: "",
  composition: "Couple",
  occasion: "A little escape",
  budget: 65000,
  priority: "Balanced",
  flexibility: "Fixed",
  pace: "Balanced",
  morning: "Slow mornings",
  interests: ["Food", "Nature", "Beaches"],
  stay: "Boutique",
  diet: "No preference",
  mobility: "No restrictions",
  transport: "Mix of both",
  mustDo: "",
  avoid: "",
  notes: "",
  arrivalTime: "12:00",
  departureTime: "18:00",
  consent: true,
};
export type Offer = {
  id: string;
  category: Category;
  name: string;
  subtitle: string;
  detail: string;
  badge: string;
  price: number;
  unit: string;
  quantity: number;
  total: number;
  departure?: string;
  arrival?: string;
  duration?: string;
  rating?: string;
  params: Search;
  terms: string;
};
export type Item = Offer & { itemId: string };
export type Activity = {
  id: string;
  time: string;
  title: string;
  description: string;
  duration: string;
  cost: number;
  tag: string;
  area: string;
};
export type Day = {
  id: string;
  day: number;
  date: string;
  title: string;
  area: string;
  activities: Activity[];
};
export type Itinerary = {
  title: string;
  summary: string;
  days: Day[];
  source: string;
  notices: string[];
  mode: "preview" | "ai";
};
export type Message = { id: string; role: "user" | "assistant"; text: string };
export type Trip = {
  id: string;
  version: number;
  title: string;
  items: Item[];
  profile: Profile | null;
  itinerary: Itinerary | null;
  messages: Message[];
  status: string;
  createdAt: number;
};
export type Quote = {
  id: string;
  tripId: string;
  expiresAt: number;
  subtotal: number;
  fee: number;
  total: number;
  items: Item[];
  status: string;
};
export type Order = {
  id: string;
  tripId: string;
  quoteId: string;
  total: number;
  createdAt: number;
  items: Item[];
  status: string;
  name: string;
  email: string;
};
export function nights(a: string, b: string) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}
export function money(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount / 100);
}
export function dateLabel(date: string) {
  return new Date(date + "T12:00:00").toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}
export const cityCode: Record<string, string> = {
  Mumbai: "BOM",
  Delhi: "DEL",
  Bengaluru: "BLR",
  Goa: "GOX",
  Jaipur: "JAI",
  Kerala: "COK",
  Kyoto: "KIX",
};
export function offersFor(p: Search): Offer[] {
  const international = p.to === "Kyoto" || p.from === "Kyoto";
  if (international && ["trains", "buses", "cabs"].includes(p.category))
    return [];
  const travelers = p.travelers,
    n = Math.max(1, nights(p.start, p.end)),
    from = p.direction === "return" ? p.to : p.from,
    to = p.direction === "return" ? p.from : p.to;
  const factor = international
    ? 5.7
    : 1 + Math.max(0, cities.indexOf(p.to) - 3) * 0.13;
  const cabinFactor =
    p.cabin === "Business" ? 2.8 : p.cabin === "Premium economy" ? 1.5 : 1;
  const data: Partial<Offer>[] =
    p.category === "flights"
      ? [
          {
            name: "IndiGo",
            subtitle: "6E 6172 · " + p.cabin,
            detail: "Nonstop · 15 kg check-in + 7 kg cabin",
            badge: "Best value",
            price: Math.round(425000 * factor * cabinFactor),
            departure: "07:15",
            arrival: international
              ? p.direction === "return"
                ? "11:45"
                : "18:45"
              : "08:30",
            duration: international ? "8h 00m · 1 stop" : "1h 15m",
          },
          {
            name: "Air India",
            subtitle: "AI 2855 · " + p.cabin,
            detail: "Nonstop · 15 kg check-in · Meal included",
            badge: "Comfort pick",
            price: Math.round(589000 * factor * cabinFactor),
            departure: "11:40",
            arrival: international
              ? p.direction === "return"
                ? "16:10"
                : "23:10"
              : "13:05",
            duration: international ? "8h 00m · 1 stop" : "1h 25m",
          },
          {
            name: "Akasa Air",
            subtitle: "QP 1393 · " + p.cabin,
            detail: "Nonstop · 15 kg check-in + 7 kg cabin",
            badge: "Evening flight",
            price: Math.round(468000 * factor * cabinFactor),
            departure: "18:20",
            arrival: international
              ? p.direction === "return"
                ? "22:50"
                : "05:50 +1"
              : "19:40",
            duration: international ? "8h 00m · 1 stop" : "1h 20m",
          },
        ]
      : p.category === "hotels"
        ? [
            {
              name:
                (p.to === "Goa"
                  ? "Palm & Tide"
                  : p.to === "Kyoto"
                    ? "Maple House"
                    : p.to === "Jaipur"
                      ? "The Pink Courtyard"
                      : "Backwater House") + " · Boutique stay",
              subtitle: p.to + " · Quiet neighbourhood",
              detail: "Breakfast included · Double room · Wi-Fi",
              badge: "Our kind of place",
              price: international ? 1250000 : 480000,
              rating: "4.8",
            },
            {
              name: "The " + p.to + " Retreat",
              subtitle: p.to + " · Resort",
              detail: "Pool · Breakfast · Spacious double room",
              badge: "Room to unwind",
              price: international ? 1800000 : 720000,
              rating: "4.9",
            },
            {
              name: "Little " + p.to + " House",
              subtitle: p.to + " · Budget stay",
              detail: "Private double room · Wi-Fi · Central location",
              badge: "Smart spend",
              price: international ? 780000 : 260000,
              rating: "4.5",
            },
          ]
        : p.category === "trains"
          ? [
              {
                name: "Coastal Express",
                subtitle: "2A · AC 2-tier",
                detail: "Sample rail connection · Berth allocation simulated",
                badge: "Scenic route",
                price: 185000,
                departure: "06:30",
                arrival: "17:45",
                duration: "11h 15m",
              },
              {
                name: "Intercity Express",
                subtitle: "CC · AC chair car",
                detail: "Sample rail connection · Seated journey",
                badge: "Day journey",
                price: 125000,
                departure: "07:10",
                arrival: "18:20",
                duration: "11h 10m",
              },
            ]
          : p.category === "buses"
            ? [
                {
                  name: "Coastal Travels",
                  subtitle: "AC sleeper · 2+1",
                  detail: "Sample intercity service · One overnight journey",
                  badge: "Best value",
                  price: 145000,
                  departure: "20:30",
                  arrival: "08:00 +1",
                  duration: "11h 30m",
                },
                {
                  name: "Orange Routes",
                  subtitle: "Premium AC sleeper · 2+1",
                  detail: "Sample intercity service · Blanket & charging point",
                  badge: "Comfort pick",
                  price: 185000,
                  departure: "21:15",
                  arrival: "08:30 +1",
                  duration: "11h 15m",
                },
              ]
            : p.category === "packages"
              ? [
                  {
                    name: p.to + " at your own pace",
                    subtitle: n + " nights · Stay + local experiences",
                    detail:
                      "Accommodation + guided highlights; flights excluded",
                    badge: "Easy escape",
                    price: Math.round(n * (international ? 1600000 : 540000)),
                    rating: "4.8",
                  },
                  {
                    name: "The hidden side of " + p.to,
                    subtitle: n + " nights · Boutique stay + private guide",
                    detail:
                      "Accommodation + private local guide; flights excluded",
                    badge: "Go a little deeper",
                    price: Math.round(n * (international ? 2200000 : 740000)),
                    rating: "4.9",
                  },
                ]
              : [
                  {
                    name: "Airport transfer",
                    subtitle: to + " · Private sedan",
                    detail:
                      "One airport-to-hotel transfer · Up to 3 passengers",
                    badge: "Door to door",
                    price: 150000,
                  },
                  {
                    name: "Private day cab",
                    subtitle: to + " · SUV with driver",
                    detail: "8 hours / 80 km · Extra distance excluded",
                    badge: "Explore freely",
                    price: 390000,
                  },
                ];
  return data.map((d, i) => {
    const quantity =
      p.category === "hotels"
        ? Math.ceil(travelers / 2) * n
        : p.category === "cabs"
          ? Math.ceil(travelers / (i === 0 ? 3 : 6))
          : travelers;
    const actualQuantity =
      p.category === "hotels"
        ? Math.max(p.rooms, Math.ceil(travelers / 2)) * n
        : quantity;
    const price = d.price!;
    return {
      ...d,
      id: p.category + "-" + i,
      category: p.category,
      price,
      quantity: actualQuantity,
      total: price * actualQuantity,
      unit:
        p.category === "hotels"
          ? "room / night"
          : p.category === "cabs"
            ? "vehicle"
            : "traveller",
      params: p,
      subtitle:
        d.subtitle! +
        (p.category === "flights" ||
        p.category === "trains" ||
        p.category === "buses"
          ? " · " + cityCode[from] + " → " + cityCode[to]
          : ""),
      terms:
        "Demo offer only. No inventory is held. Cancellation, baggage, availability and fare rules require supplier confirmation.",
      ...(international && p.category === "flights"
        ? {
            detail: "Sample international connection · 1 stop · Verify routing",
          }
        : {}),
    } as Offer;
  });
}
export function recommendations(profile: Profile) {
  const p: Search = {
    ...defaultSearch,
    from: profile.origin,
    to: profile.destination,
    start: profile.start,
    end: profile.end,
    travelers: profile.adults + profile.children,
    rooms: Math.ceil((profile.adults + profile.children) / 2),
  };
  const flights = offersFor(p),
    returns = offersFor({ ...p, direction: "return" });
  const out = flights.find(
    (o) =>
      !o.arrival?.includes("+1") &&
      (o.arrival || "99:99") <= profile.arrivalTime,
  );
  const back = returns.find(
    (o) => (o.departure || "00:00") >= profile.departureTime,
  );
  const stays = offersFor({ ...p, category: "hotels" });
  let stay =
    stays[
      profile.stay === "Budget" || profile.priority === "Lowest cost"
        ? 2
        : profile.stay === "Resort"
          ? 1
          : 0
    ];
  const fixed = (out?.total || 0) + (back?.total || 0);
  if (
    fixed + stay.total > profile.budget * 100 * 0.8 &&
    profile.priority !== "Better stays"
  )
    stay = stays[2];
  return [
    out,
    back,
    profile.stay === "Apartment" ? undefined : stay,
    ...(profile.destination !== "Kyoto" &&
    profile.transport !== "Public transport"
      ? [
          offersFor({ ...p, category: "cabs" })[
            profile.transport === "Private cab" ? 1 : 0
          ],
        ]
      : []),
  ].filter((x): x is Offer => Boolean(x));
}
