"use client";
import { useState, useEffect, useRef } from "react";
import { AccountForm } from "@/components/account-form";
import {
  Plane,
  Compass,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  ArrowLeftRight,
  MapPin,
  Luggage,
  ShieldCheck,
  Check,
  Plus,
  Trash2,
  Clock,
  Send,
  Download,
  CalendarDays,
  ChevronRight,
  UserRound,
  RefreshCw,
  Info,
  Star,
  CheckCircle2,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Toaster, toast } from "sonner";
import {
  categories,
  Picker,
  Busy,
  OfferCard,
} from "@/components/travel-controls";
import { PreferenceForm } from "@/components/preference-form";
import {
  defaultSearch,
  cities,
  money,
  dateLabel,
  cityCode,
  type Search,
  type Trip,
  type Offer,
  type Quote,
  type Order,
  type Profile,
} from "@/lib/travel";

type APIResponses = {
  state: {
    user: { name: string; email: string } | null;
    trips: Trip[];
    orders: Order[];
    plannerMode: string;
  };
  search: { offers: Offer[] };
  add: { trip: Trip };
  remove: { trip: Trip };
  plan: { trip: Trip; recommendations: Offer[] };
  recommend: { offers: Offer[] };
  chat: { trip: Trip; changed: boolean };
  quote: { quote: Quote; serverNow: number };
  checkout: { order: Order };
  "new-trip": { trip: Trip };
  "forget-profile": { trip: Trip };
};
async function api<A extends keyof APIResponses>(
  action: A,
  data?: unknown,
): Promise<APIResponses[A]> {
  const r = await fetch("/api/" + action, {
    method: data === undefined ? "GET" : "POST",
    headers: data === undefined ? {} : { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const result = (await r.json()) as APIResponses[A] & { error?: string };
  if (!r.ok)
    throw new Error(result.error || "Something went wrong. Please try again.");
  return result;
}
export default function Home() {
  const [view, setView] = useState<"book" | "planner" | "itinerary">("book"),
    [search, setSearch] = useState<Search>(defaultSearch),
    [offers, setOffers] = useState<Offer[] | null>(null),
    [sort, setSort] = useState("Recommended"),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [user, setUser] = useState<{ name: string; email: string } | null>(null),
    [mode, setMode] = useState("preview"),
    [trips, setTrips] = useState<Trip[]>([]),
    [activeId, setActiveId] = useState<string | null>(null),
    [orders, setOrders] = useState<Order[]>([]),
    [cart, setCart] = useState(false),
    [saved, setSaved] = useState(false),
    [account, setAccount] = useState(false),
    [auth, setAuth] = useState(false),
    [quote, setQuote] = useState<Quote | null>(null),
    [checkout, setCheckout] = useState(false),
    [order, setOrder] = useState<Order | null>(null),
    [contact, setContact] = useState({ name: "", email: "" }),
    [ack, setAck] = useState(false),
    [now, setNow] = useState(Date.now()),
    [skew, setSkew] = useState(0),
    [recs, setRecs] = useState<Offer[]>([]),
    [day, setDay] = useState(1),
    [activity, setActivity] = useState(0),
    [message, setMessage] = useState(""),
    [forget, setForget] = useState(false),
    [initialProfile, setInitialProfile] = useState<Partial<Profile>>({});
  const trip = trips.find((t) => t.id === activeId) || null;
  const tripRef = useRef(trip);
  tripRef.current = trip;
  const subtotal = trip?.items.reduce((s, i) => s + i.total, 0) || 0;
  function updateTrip(t: Trip) {
    setTrips((v) => [t, ...v.filter((x) => x.id !== t.id)]);
    setActiveId(t.id);
    tripRef.current = t;
  }
  async function run(name: string, fn: () => Promise<void>) {
    setBusy(name);
    setError("");
    try {
      await fn();
    } catch (e) {
      const text = e instanceof Error ? e.message : "Please try again.";
      setError(text);
      toast.error(text);
      if (text.includes("Sign in")) setAuth(true);
    } finally {
      setBusy("");
    }
  }
  async function refresh() {
    const s = await api("state");
    setUser(s.user);
    setTrips(s.trips);
    setOrders(s.orders);
    setMode(s.plannerMode);
    setActiveId((id) =>
      s.trips.some((t: Trip) => t.id === id)
        ? id
        : s.trips.find((t: Trip) => t.status === "draft")?.id ||
          s.trips[0]?.id ||
          null,
    );
    if (s.user)
      setContact({
        name: s.user.name.includes("@") ? "" : s.user.name,
        email: s.user.email,
      });
  }
  useEffect(() => {
    void run("load", refresh);
  }, []);
  useEffect(() => {
    if (!checkout) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [checkout]);
  useEffect(() => {
    if (view === "itinerary" && trip?.profile)
      void api("recommend", { tripId: trip.id })
        .then((r) => setRecs(r.offers))
        .catch(() => setRecs([]));
  }, [view, trip?.id]);
  function navigate(v: typeof view) {
    setView(v);
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function startPlanner(destination?: string) {
    setInitialProfile(destination ? { destination: destination as any } : {});
    navigate("planner");
  }
  function added(o: Offer) {
    return Boolean(
      trip?.items.some(
        (i) =>
          i.id === o.id &&
          JSON.stringify(i.params) === JSON.stringify(o.params),
      ),
    );
  }
  async function add(o: Offer, current = tripRef.current) {
    if (!user) {
      setAuth(true);
      return null;
    }
    if (current?.status !== "draft") current = null;
    const r = await api("add", {
      tripId: current?.id,
      version: current?.version,
      offerId: o.id,
      params: o.params,
    });
    updateTrip(r.trip);
    return r.trip as Trip;
  }
  async function searchOffers(p = search) {
    setSearch(p);
    const r = await api("search", p);
    setOffers(r.offers);
    setTimeout(
      () =>
        document
          .getElementById("results")
          ?.scrollIntoView({ behavior: "smooth", block: "start" }),
      80,
    );
  }
  async function beginCheckout() {
    if (!trip) return;
    const r = await api("quote", { tripId: trip.id, version: trip.version });
    setQuote(r.quote);
    setSkew(Date.now() - r.serverNow);
    setNow(Date.now());
    setAck(false);
    setOrder(null);
    setCheckout(true);
    setCart(false);
  }
  const seconds = quote
    ? Math.max(0, Math.ceil((quote.expiresAt - (now - skew)) / 1000))
    : 0;
  const selectedDay =
    trip?.itinerary?.days.find((d) => d.day === day) ||
    trip?.itinerary?.days[0];
  const futureTrip = trip?.status === "demo_confirmed";
  const budgetEstimate =
    recs.reduce((s, o) => s + o.total, 0) +
    (trip?.itinerary?.days.reduce(
      (s, d) => s + d.activities.reduce((n, a) => n + a.cost, 0),
      0,
    ) || 0);
  const pickSearch = (
    key: keyof Search,
    label: string,
    options: readonly string[],
    sub: string,
  ) => (
    <label className="search-field">
      <span>{label}</span>
      <Picker
        label={label}
        value={String(search[key])}
        options={options}
        onChange={(v) => setSearch((s) => ({ ...s, [key]: v }))}
      />
      <small>{sub}</small>
    </label>
  );
  return (
    <div className="site-shell">
      <Toaster richColors position="bottom-center" />
      <header className="topbar">
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate("book");
          }}
        >
          <span className="brand-icon">
            <Compass size={23} />
          </span>
          planitoday<span className="brand-dot">.</span>
        </a>
        <nav>
          <button
            className={view === "book" ? "active" : ""}
            onClick={() => navigate("book")}
          >
            Book a trip
          </button>
          <button
            className={view !== "book" ? "active" : ""}
            onClick={() =>
              trip?.itinerary ? navigate("itinerary") : startPlanner()
            }
          >
            AI planner <span className="tiny-badge">NEW</span>
          </button>
          <button
            onClick={() => {
              setView("book");
              setTimeout(
                () =>
                  document
                    .getElementById("discover")
                    ?.scrollIntoView({ behavior: "smooth" }),
                30,
              );
            }}
          >
            Discover
          </button>
        </nav>
        <div className="header-actions">
          <span className="currency">EN · INR</span>
          <button className="trip-btn" onClick={() => setCart(true)}>
            <Luggage size={17} /> My trip <span>{trip?.items.length || 0}</span>
          </button>
          <button
            className="avatar"
            aria-label="Your account and saved trips"
            onClick={() => setAccount(true)}
          >
            {user ? (
              user.name.slice(0, 1).toUpperCase()
            ) : (
              <UserRound size={16} />
            )}
          </button>
        </div>
      </header>
      {error && (
        <div className="page-error" role="alert">
          <Info size={17} />
          {error}
          <button onClick={() => void run("refresh", refresh)}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      )}
      <main>
        {view === "book" && (
          <>
            <section className="hero">
              <div className="hero-photo" />
              <div className="hero-copy">
                <div className="eyebrow">
                  <span /> LESS PLANNING. MORE LIVING.
                </div>
                <h1>
                  Your whole trip.
                  <br />
                  One happy place<span>.</span>
                </h1>
                <p>
                  Flights, stays, and everything in between.
                  <br />
                  Bring it all together, or let AI lead the way.
                </p>
                <button className="planner-link" onClick={() => startPlanner()}>
                  <Sparkles size={17} /> Plan my trip with AI{" "}
                  <ArrowRight size={17} />
                </button>
              </div>
              <div className="photo-caption">
                <MapPin size={15} />
                <span>Kakolem Beach, Goa</span>
                <span className="caption-small">
                  A little closer to getting away
                </span>
              </div>
            </section>
            <section className="booking-panel" id="book">
              <div className="booking-heading">
                <Tabs
                  value={search.category}
                  onValueChange={(v) => {
                    setSearch((s) => ({
                      ...s,
                      category: v as any,
                      direction: "outbound",
                    }));
                    setOffers(null);
                  }}
                >
                  <TabsList className="category-tabs">
                    {categories.map((c) => (
                      <TabsTrigger value={c.id} key={c.id}>
                        <c.icon size={20} />
                        {c.name}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
                <span className="booking-note">
                  <Check size={14} /> Pick one. Or piece together a trip.
                </span>
              </div>
              <div className="search-body">
                <div className="search-options">
                  {search.category === "flights" ? (
                    <RadioGroup
                      className="trip-type"
                      value={search.roundtrip ? "round" : "one"}
                      onValueChange={(v) =>
                        setSearch((s) => ({
                          ...s,
                          roundtrip: v === "round",
                          direction: "outbound",
                        }))
                      }
                    >
                      <label>
                        <RadioGroupItem value="round" /> Round trip
                      </label>
                      <label>
                        <RadioGroupItem value="one" /> One way
                      </label>
                    </RadioGroup>
                  ) : (
                    <span>
                      {search.category === "hotels"
                        ? "Find your happy place"
                        : search.category === "packages"
                          ? "A ready-made escape, at your pace"
                          : "Good journeys start here"}
                    </span>
                  )}
                  <span className="demo-tag">Demo inventory</span>
                </div>
                <form
                  className="search-grid"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run("search", () => searchOffers());
                  }}
                >
                  {search.category === "hotels" ||
                  search.category === "packages" ? (
                    <>
                      {pickSearch(
                        "to",
                        "DESTINATION",
                        cities,
                        "Explore stays & local highlights",
                      )}
                      <label className="search-field">
                        <span>ROOMS</span>
                        <input
                          aria-label="Rooms"
                          type="number"
                          min="1"
                          max="5"
                          value={search.rooms}
                          onChange={(e) =>
                            setSearch((s) => ({
                              ...s,
                              rooms: Number(e.target.value),
                            }))
                          }
                        />
                        <small>
                          {search.category === "hotels"
                            ? "At least 1 room per 2 travellers"
                            : "Rooms for your package"}
                        </small>
                      </label>
                    </>
                  ) : (
                    <>
                      {pickSearch(
                        "from",
                        "FROM",
                        cities,
                        cityCode[search.from] + " · Origin",
                      )}
                      <button
                        type="button"
                        className="swap"
                        aria-label="Swap destinations"
                        onClick={() =>
                          setSearch((s) => ({ ...s, from: s.to, to: s.from }))
                        }
                      >
                        <ArrowLeftRight size={16} />
                      </button>
                      {pickSearch(
                        "to",
                        "TO",
                        cities,
                        cityCode[search.to] + " · Destination",
                      )}
                    </>
                  )}
                  <label className="search-field">
                    <span>
                      {search.category === "hotels" ? "CHECK-IN" : "DEPARTURE"}
                    </span>
                    <input
                      aria-label="Departure date"
                      type="date"
                      required
                      value={search.start}
                      min={new Date().toISOString().slice(0, 10)}
                      onChange={(e) =>
                        setSearch((s) => ({ ...s, start: e.target.value }))
                      }
                    />
                    <small>Time for a change of scenery</small>
                  </label>
                  <label className="search-field">
                    <span>
                      {search.category === "hotels"
                        ? "CHECK-OUT"
                        : search.roundtrip
                          ? "RETURN"
                          : "TRIP END"}
                    </span>
                    <input
                      aria-label="Return date"
                      type="date"
                      required
                      value={search.end}
                      min={search.start}
                      onChange={(e) =>
                        setSearch((s) => ({ ...s, end: e.target.value }))
                      }
                    />
                    <small>
                      {search.category === "hotels"
                        ? "Stay a little longer"
                        : "Your trip, your timing"}
                    </small>
                  </label>
                  <label className="search-field">
                    <span>TRAVELLERS</span>
                    <input
                      type="number"
                      aria-label="Travellers"
                      min="1"
                      max="9"
                      required
                      value={search.travelers}
                      onChange={(e) =>
                        setSearch((s) => ({
                          ...s,
                          travelers: Number(e.target.value),
                        }))
                      }
                    />
                    <small>
                      {search.category === "flights"
                        ? "Economy · All travellers"
                        : "All travellers included"}
                    </small>
                  </label>
                  <button className="primary search-submit" disabled={!!busy}>
                    {busy === "search" ? (
                      <Busy />
                    ) : (
                      <>
                        Search <ArrowRight size={18} />
                      </>
                    )}
                  </button>
                </form>
              </div>
              <div className="booking-foot">
                <ShieldCheck size={15} />
                <span>One trip. One checkout.</span>
                <span className="foot-divider" />
                <span>Your choices, beautifully connected.</span>
              </div>
            </section>
            {offers !== null && (
              <section className="results-section" id="results">
                <div className="results-header">
                  <div>
                    <span className="eyebrow">LET’S GET YOU THERE</span>
                    <h2>
                      {search.category === "hotels"
                        ? "Stay a little closer to " + search.to
                        : search.from + " to " + search.to}
                    </h2>
                    <p>
                      {offers.length} demo options · {search.travelers}{" "}
                      traveller{search.travelers > 1 ? "s" : ""} ·{" "}
                      {dateLabel(search.start)} — {dateLabel(search.end)}
                    </p>
                  </div>
                  <Picker
                    label="Sort results"
                    value={sort}
                    options={["Recommended", "Price: low to high"]}
                    onChange={setSort}
                  />
                </div>
                {search.category === "flights" && search.roundtrip && (
                  <Tabs
                    value={search.direction}
                    onValueChange={(v) =>
                      void run("search", () =>
                        searchOffers({ ...search, direction: v as any }),
                      )
                    }
                  >
                    <TabsList className="direction-tabs">
                      <TabsTrigger value="outbound">
                        1. Outbound · {search.from} → {search.to}
                      </TabsTrigger>
                      <TabsTrigger value="return">
                        2. Return · {search.to} → {search.from}
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                )}
                <div className="results-layout">
                  <div className="offers-grid">
                    {offers.length ? (
                      [
                        ...(sort === "Price: low to high"
                          ? [...offers].sort((a, b) => a.total - b.total)
                          : offers),
                      ].map((o) => (
                        <OfferCard
                          key={o.id}
                          offer={o}
                          added={added(o)}
                          busy={!!busy}
                          onAdd={() =>
                            void run("add", async () => {
                              if (await add(o))
                                toast.success("Added to your trip");
                            })
                          }
                        />
                      ))
                    ) : (
                      <div className="empty-state">
                        <Compass size={32} />
                        <h3>No demo services on this route.</h3>
                        <p>
                          Try flights or stays for Kyoto, or choose an Indian
                          route for road and rail options.
                        </p>
                      </div>
                    )}
                  </div>
                  <aside className="trip-summary">
                    <span className="eyebrow">YOUR TRIP, COMING TOGETHER</span>
                    <h3>{trip?.title || "Room for possibilities"}</h3>
                    {trip?.items.length ? (
                      <>
                        <p>
                          {trip.items.length} selected item
                          {trip.items.length > 1 ? "s" : ""}
                        </p>
                        {trip.items.map((i) => (
                          <div className="mini-item" key={i.itemId}>
                            <span>
                              {i.name}
                              <small>
                                {i.params.direction === "return"
                                  ? "Return · "
                                  : ""}
                                {dateLabel(i.params.start)}
                              </small>
                            </span>
                            <strong>{money(i.total)}</strong>
                          </div>
                        ))}
                        <div className="summary-total">
                          <span>Subtotal</span>
                          <strong>{money(subtotal)}</strong>
                        </div>
                        <button
                          className="primary"
                          disabled={!!busy || futureTrip}
                          onClick={() => void run("quote", beginCheckout)}
                        >
                          Review & checkout <ArrowRight size={16} />
                        </button>
                        <button
                          className="text-button"
                          onClick={() => setCart(true)}
                        >
                          Manage your trip
                        </button>
                      </>
                    ) : (
                      <>
                        <p>
                          Add a flight, a stay, or anything else you need. You
                          can book just one thing, too.
                        </p>
                        <div className="empty-trip-icon">
                          <Luggage size={36} />
                        </div>
                      </>
                    )}
                    <small>Demo prices · No real booking or payment.</small>
                  </aside>
                </div>
              </section>
            )}
            <section className="feature-row">
              <div>
                <span className="feature-icon">
                  <Luggage />
                </span>
                <p>
                  <strong>Everything in one trip</strong>
                  <small>Add flights, stays & more as you go.</small>
                </p>
              </div>
              <div>
                <span className="feature-icon violet">
                  <Sparkles />
                </span>
                <p>
                  <strong>Personal, down to the details</strong>
                  <small>An itinerary built around your kind of travel.</small>
                </p>
              </div>
              <div>
                <span className="feature-icon green">
                  <ShieldCheck />
                </span>
                <p>
                  <strong>A companion all the way</strong>
                  <small>Rethink a day without redoing your trip.</small>
                </p>
              </div>
            </section>
            <section className="section-heading" id="discover">
              <div>
                <span className="eyebrow">A LITTLE INSPIRATION</span>
                <h2>Where will your next story begin?</h2>
              </div>
              <button
                className="text-button"
                onClick={() =>
                  document
                    .getElementById("book")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
              >
                Explore your options <ArrowRight size={16} />
              </button>
            </section>
            <section className="inspiration-grid">
              <article className="destination-feature">
                <img
                  src="/images/kyoto-autumn.jpg"
                  alt="Autumn foliage at Daigo-ji temple in Kyoto"
                />
                <div className="destination-overlay">
                  <span className="glass-tag">SEASONAL ESCAPE</span>
                  <h3>Fall in love with Kyoto.</h3>
                  <p>Quiet temples. Golden leaves. A different pace.</p>
                  <button
                    className="white-btn"
                    onClick={() => startPlanner("Kyoto")}
                  >
                    Explore Kyoto <ArrowRight size={16} />
                  </button>
                </div>
              </article>
              <article className="ai-promo">
                <span className="ai-promo-icon">
                  <Sparkles size={26} />
                </span>
                <span className="eyebrow">MEET YOUR TRAVEL ALTER EGO</span>
                <h3>
                  A trip that feels
                  <br />a little more <em>you.</em>
                </h3>
                <p>
                  Your pace. Your people. Your tiny obsessions.
                  <br />
                  Tell us what matters. We’ll connect the dots.
                </p>
                <div className="preference-preview">
                  <span>Slow mornings</span>
                  <span>Local food</span>
                  <span>Hidden gems</span>
                </div>
                <button className="dark-btn" onClick={() => startPlanner()}>
                  Build my itinerary <ArrowRight size={18} />
                </button>
                <small>
                  {mode === "ai"
                    ? "Personalised with AI."
                    : "Try the curated preview · AI ready to connect"}
                </small>
              </article>
            </section>
            <section className="book-anything">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">ALL THE WAYS TO GO</span>
                  <h2>Just a stay? A whole getaway?</h2>
                </div>
                <span className="subtext">Make it your kind of trip.</span>
              </div>
              <div className="category-grid">
                {categories.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setSearch((s) => ({ ...s, category: c.id }));
                      setOffers(null);
                      document
                        .getElementById("book")
                        ?.scrollIntoView({ behavior: "smooth" });
                    }}
                  >
                    <c.icon size={24} />
                    <strong>{c.name}</strong>
                    <span>
                      {
                        {
                          flights: "Take the scenic shortcut",
                          hotels: "Find your home away",
                          trains: "Enjoy the journey",
                          buses: "A different way there",
                          packages: "The pieces, put together",
                          cabs: "Door to destination",
                        }[c.id]
                      }
                    </span>
                    <ArrowRight size={16} />
                  </button>
                ))}
              </div>
            </section>
          </>
        )}
        {view === "planner" && (
          <div className="workspace">
            <button
              className="text-button back-home"
              onClick={() => navigate("book")}
            >
              <ArrowLeft size={15} /> Back to exploring
            </button>
            <PreferenceForm
              key={JSON.stringify(initialProfile)}
              initial={initialProfile}
              mode={mode}
              busy={!!busy}
              onGenerate={(p) => {
                if (!user) {
                  setAuth(true);
                  return;
                }
                void run("plan", async () => {
                  const r = await api("plan", { profile: p });
                  updateTrip(r.trip);
                  setRecs(r.recommendations);
                  setDay(1);
                  setActivity(0);
                  navigate("itinerary");
                  toast.success("Your personal itinerary is ready");
                });
              }}
            />
          </div>
        )}
        {view === "itinerary" && (
          <section className="workspace itinerary-workspace">
            {trip?.itinerary && selectedDay ? (
              <>
                <div className="itinerary-heading">
                  <div>
                    <span className="eyebrow">
                      <Sparkles size={15} /> MADE AROUND YOU ·{" "}
                      {trip.itinerary.mode === "ai"
                        ? "AI PLANNER"
                        : "PREVIEW PLANNER"}
                    </span>
                    <h1>{trip.itinerary.title}</h1>
                    <p>{trip.itinerary.summary}</p>
                    <div className="itinerary-chips">
                      <span>
                        <CalendarDays size={14} />
                        {dateLabel(trip.profile!.start)} —{" "}
                        {dateLabel(trip.profile!.end)}
                      </span>
                      <span>
                        <UserRound size={14} />
                        {trip.profile!.adults + trip.profile!.children}{" "}
                        travellers
                      </span>
                      <span>{trip.profile!.pace} pace</span>
                      <span>
                        ₹{trip.profile!.budget.toLocaleString("en-IN")} budget
                      </span>
                    </div>
                  </div>
                  <div className="itinerary-actions">
                    <a
                      className="outline-button"
                      href={"/api/export?tripId=" + trip.id}
                    >
                      <Download size={16} /> Download
                    </a>
                    <button
                      className="text-button"
                      onClick={() => startPlanner()}
                    >
                      Start another plan
                    </button>
                  </div>
                </div>
                <div className="itinerary-grid">
                  <div>
                    <Tabs
                      value={String(day)}
                      onValueChange={(v) => {
                        setDay(Number(v));
                        setActivity(0);
                      }}
                    >
                      <TabsList className="day-tabs">
                        {trip.itinerary.days.map((d) => (
                          <TabsTrigger value={String(d.day)} key={d.id}>
                            Day {d.day}
                            <small>{dateLabel(d.date)}</small>
                          </TabsTrigger>
                        ))}
                      </TabsList>
                    </Tabs>
                    <div className="day-heading">
                      <span className="day-number">
                        {String(selectedDay.day).padStart(2, "0")}
                      </span>
                      <div>
                        <h2>{selectedDay.title}</h2>
                        <p>
                          <MapPin size={14} />
                          {selectedDay.area} · {dateLabel(selectedDay.date)}
                        </p>
                      </div>
                    </div>
                    <div className="timeline">
                      {selectedDay.activities.length ? (
                        selectedDay.activities.map((a, i) => (
                          <article
                            key={a.id}
                            className={
                              "activity-card " +
                              (activity === i ? "selected" : "")
                            }
                          >
                            <div className="timeline-time">
                              {a.time}
                              <span />
                            </div>
                            <div className="activity-content">
                              <div className="activity-top">
                                <span className="activity-tag">{a.tag}</span>
                                <span>{a.duration}</span>
                              </div>
                              <h3>{a.title}</h3>
                              <p>{a.description}</p>
                              <div className="activity-bottom">
                                <small>
                                  {a.cost
                                    ? money(a.cost) + " estimate for the group"
                                    : "No activity charge estimated"}
                                </small>
                                <button
                                  aria-pressed={activity === i}
                                  className="text-button"
                                  onClick={() => setActivity(i)}
                                >
                                  <Sparkles size={14} />
                                  {activity === i
                                    ? "Selected for chat"
                                    : "Refine this stop"}
                                </button>
                              </div>
                            </div>
                          </article>
                        ))
                      ) : (
                        <div className="empty-state">
                          <Clock />
                          <h3>Keep this day for travel.</h3>
                          <p>
                            Your arrival or departure leaves too little time for
                            comfortable sightseeing.
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="source-note">
                      <Info size={17} />
                      <div>
                        {trip.itinerary.notices.map((n, i) => (
                          <p key={i}>{n}</p>
                        ))}
                        <a
                          href={trip.itinerary.source}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Official destination guide ↗
                        </a>
                      </div>
                    </div>
                  </div>
                  <aside className="assistant-panel">
                    <div className="assistant-heading">
                      <span className="brand-icon">
                        <Sparkles size={21} />
                      </span>
                      <div>
                        <h3>Your trip companion</h3>
                        <p>
                          {mode === "ai"
                            ? "AI, with your trip in mind"
                            : "Preview assistant · Saved trip context"}
                        </p>
                      </div>
                    </div>
                    <div className="chat-target">
                      <span>REFINING DAY {selectedDay.day}</span>
                      <strong>
                        {selectedDay.activities[activity]?.title ||
                          "Travel day"}
                      </strong>
                      <small>
                        Other stops and booking items stay unchanged.
                      </small>
                    </div>
                    <div className="chat-messages" aria-live="polite">
                      {trip.messages.map((m) => (
                        <div key={m.id} className={"chat-message " + m.role}>
                          {m.role === "assistant" && <Sparkles size={14} />}
                          <p>{m.text}</p>
                        </div>
                      ))}
                    </div>
                    <div className="chat-suggestions">
                      {[
                        "Make it more relaxed",
                        "This place is closed",
                        "Suggest local food",
                      ].map((s) => (
                        <button
                          disabled={!!busy || !selectedDay.activities.length}
                          key={s}
                          onClick={() => setMessage(s)}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                    <form
                      className="chat-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const text = message;
                        void run("chat", async () => {
                          const r = await api("chat", {
                            tripId: trip.id,
                            version: trip.version,
                            message: text,
                            day: selectedDay.day,
                            activityIndex: activity,
                          });
                          updateTrip(r.trip);
                          setMessage("");
                          toast.success(
                            r.changed
                              ? "Your selected stop was updated"
                              : "Reply saved",
                          );
                        });
                      }}
                    >
                      <textarea
                        aria-label="Message your trip assistant"
                        placeholder="What would make this more you?"
                        value={message}
                        maxLength={1500}
                        onChange={(e) => setMessage(e.target.value)}
                      />
                      <button
                        aria-label="Send message"
                        disabled={
                          !!busy ||
                          !message.trim() ||
                          !selectedDay.activities.length
                        }
                      >
                        {busy === "chat" ? <Busy /> : <Send size={18} />}
                      </button>
                    </form>
                    <small className="chat-footnote">
                      Suggestions don’t change or purchase reservations.
                    </small>
                  </aside>
                </div>
                <section className="recommendations">
                  <div className="results-header">
                    <div>
                      <span className="eyebrow">MAKE THE PLAN A TRIP</span>
                      <h2>The practical parts, all in one place.</h2>
                      <p>
                        Suggested stays, local transport and flights that fit
                        your time windows. Missing flights or apartment stays
                        need a separate search; public-transport fares are not
                        included.
                      </p>
                    </div>
                    <button
                      className="primary"
                      disabled={!!busy || futureTrip || !recs.length}
                      onClick={() =>
                        void run("bundle", async () => {
                          let t = tripRef.current;
                          for (const o of recs) {
                            t = await add(o, t);
                          }
                          toast.success("Recommendations added to your trip");
                          setCart(true);
                        })
                      }
                    >
                      <Plus size={16} /> Add recommendations
                    </button>
                  </div>
                  <div className="estimate-notice">
                    <span>
                      Estimated trip cost:{" "}
                      <strong>{money(budgetEstimate)}</strong> for the listed
                      recommendations and activities, before the demo checkout
                      fee.
                    </span>
                    {budgetEstimate > trip.profile!.budget * 100 && (
                      <strong className="over-budget">
                        Above your budget · Choose fewer items or a lower-cost
                        stay.
                      </strong>
                    )}
                  </div>
                  <div className="recommendation-grid">
                    {recs.map((o, i) => (
                      <OfferCard
                        key={o.id + o.params.direction}
                        compact
                        offer={{
                          ...o,
                          badge:
                            o.category === "flights"
                              ? o.params.direction === "return"
                                ? "Return flight"
                                : "Outbound flight"
                              : o.badge,
                        }}
                        added={added(o)}
                        busy={!!busy || futureTrip}
                        onAdd={() =>
                          void run("add", async () => {
                            if (await add(o))
                              toast.success("Added to your trip");
                          })
                        }
                      />
                    ))}
                  </div>
                  <button
                    className="text-button"
                    onClick={() => {
                      setSearch((s) => ({
                        ...s,
                        to: trip.profile!.destination,
                        from: trip.profile!.origin,
                        start: trip.profile!.start,
                        end: trip.profile!.end,
                        travelers:
                          trip.profile!.adults + trip.profile!.children,
                      }));
                      navigate("book");
                    }}
                  >
                    Compare other travel options <ArrowRight size={16} />
                  </button>
                </section>
              </>
            ) : (
              <div className="empty-state">
                <Sparkles size={32} />
                <h2>A trip as individual as you.</h2>
                <p>
                  Tell us a little about yourself to create your first
                  itinerary.
                </p>
                <button className="primary" onClick={() => startPlanner()}>
                  Build my itinerary
                </button>
              </div>
            )}
          </section>
        )}
      </main>
      <footer>
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate("book");
          }}
        >
          planitoday.
        </a>
        <span>A little less planning. A lot more possibility.</span>
        <button onClick={() => setAccount(true)}>Saved trips</button>
        <span>Preview · No real bookings or charges</span>
      </footer>
      <Sheet open={cart} onOpenChange={setCart}>
        <SheetContent className="trip-sheet">
          <SheetTitle>Your trip, together.</SheetTitle>
          <SheetDescription>
            Book one thing or your whole escape in a single demo checkout.
          </SheetDescription>
          <div className="sheet-body">
            {trip?.items.length ? (
              <>
                <div className="sheet-trip-name">
                  <h3>{trip.title}</h3>
                  <span className="demo-tag">
                    {futureTrip ? "Demo completed" : "Building your trip"}
                  </span>
                </div>
                {trip.items.map((i) => {
                  const Icon = categories.find(
                    (c) => c.id === i.category,
                  )!.icon;
                  return (
                    <div className="cart-item" key={i.itemId}>
                      <span className="provider-icon">
                        <Icon size={20} />
                      </span>
                      <div>
                        <h4>{i.name}</h4>
                        <p>{i.subtitle}</p>
                        <small>
                          {i.params.direction === "return" ? "Return: " : ""}
                          {dateLabel(
                            i.params.direction === "return"
                              ? i.params.end
                              : i.params.start,
                          )}{" "}
                          · {i.quantity} × {money(i.price)}
                        </small>
                        <strong>{money(i.total)}</strong>
                      </div>
                      {!futureTrip && (
                        <button
                          aria-label={"Remove " + i.name}
                          disabled={!!busy}
                          onClick={() =>
                            void run("remove", async () => {
                              const r = await api("remove", {
                                tripId: trip.id,
                                version: trip.version,
                                itemId: i.itemId,
                              });
                              updateTrip(r.trip);
                            })
                          }
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  );
                })}
                <div className="summary-total">
                  <span>Subtotal</span>
                  <strong>{money(subtotal)}</strong>
                </div>
                <p className="field-hint">
                  A 2% demo service fee is shown at checkout. Activity estimates
                  in your itinerary aren’t booking items.
                </p>
                <button
                  className="primary full-width"
                  disabled={!!busy || futureTrip}
                  onClick={() => void run("quote", beginCheckout)}
                >
                  {busy === "quote" ? <Busy /> : <ShieldCheck size={16} />}{" "}
                  {futureTrip
                    ? "Demo checkout completed"
                    : "Continue to checkout"}{" "}
                  <ArrowRight size={16} />
                </button>
                {trip.itinerary && (
                  <button
                    className="text-button"
                    onClick={() => {
                      setCart(false);
                      navigate("itinerary");
                    }}
                  >
                    View your itinerary
                  </button>
                )}
              </>
            ) : (
              <div className="empty-state">
                <Luggage size={40} />
                <h3>Your next adventure starts here.</h3>
                <p>
                  Find a flight, stay or experience and add it to your trip.
                </p>
                <button
                  className="primary"
                  onClick={() => {
                    setCart(false);
                    navigate("book");
                  }}
                >
                  Explore travel options
                </button>
              </div>
            )}
            <button
              className="outline-button full-width"
              onClick={() => {
                setCart(false);
                setSaved(true);
              }}
            >
              View saved trips <ChevronRight size={16} />
            </button>
          </div>
        </SheetContent>
      </Sheet>
      <Dialog open={checkout} onOpenChange={setCheckout}>
        <DialogContent className="checkout-dialog">
          <DialogTitle>
            {order ? "Your demo trip is ready." : "One trip. One checkout."}
          </DialogTitle>
          <DialogDescription>
            {order
              ? "Everything is saved together. No real booking or charge has been made."
              : "Review your trip and complete a simulated payment."}
          </DialogDescription>
          {order ? (
            <div className="confirmation">
              <span className="success-icon">
                <CheckCircle2 size={42} />
              </span>
              <h2>Consider this your practice getaway.</h2>
              <p>
                Demo reference{" "}
                <strong>PT-{order.id.slice(0, 8).toUpperCase()}</strong>
              </p>
              <div className="confirmation-total">
                <span>Simulated total</span>
                <strong>{money(order.total)}</strong>
              </div>
              {order.items.map((i) => (
                <div className="confirmation-item" key={i.itemId}>
                  <Check size={15} />
                  <span>{i.name}</span>
                  <span>Demo confirmed</span>
                </div>
              ))}
              <div className="tip-box">
                No tickets have been issued and no hotel rooms are reserved.
                This confirmation demonstrates the complete booking flow.
              </div>
              <a
                className="outline-button full-width"
                href={"/api/export?tripId=" + order.tripId}
              >
                <Download size={16} /> Download trip details
              </a>
              <button
                className="primary full-width"
                onClick={() => {
                  setCheckout(false);
                  if (trip?.itinerary) navigate("itinerary");
                  else setSaved(true);
                }}
              >
                View my trip <ArrowRight size={16} />
              </button>
            </div>
          ) : (
            quote && (
              <>
                <div className={"quote-timer " + (!seconds ? "expired" : "")}>
                  <Clock size={18} />
                  <div>
                    <strong>
                      {seconds
                        ? "Your demo quote is held for"
                        : "This demo quote has expired"}
                    </strong>
                    <small>Supplier fares and inventory are not held.</small>
                  </div>
                  <b>
                    {Math.floor(seconds / 60)
                      .toString()
                      .padStart(2, "0")}
                    :{(seconds % 60).toString().padStart(2, "0")}
                  </b>
                </div>
                <div className="checkout-items">
                  {quote.items.map((i) => (
                    <div key={i.itemId}>
                      <span>
                        {i.name}
                        <small>
                          {i.params.direction === "return"
                            ? "Return flight · "
                            : ""}
                          {i.quantity} × {money(i.price)}
                        </small>
                      </span>
                      <strong>{money(i.total)}</strong>
                    </div>
                  ))}
                </div>
                <div className="checkout-totals">
                  <div>
                    <span>Subtotal</span>
                    <span>{money(quote.subtotal)}</span>
                  </div>
                  <div>
                    <span>Demo service fee (2%)</span>
                    <span>{money(quote.fee)}</span>
                  </div>
                  <div>
                    <strong>Total · INR</strong>
                    <strong>{money(quote.total)}</strong>
                  </div>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run("pay", async () => {
                      const r = await api("checkout", {
                        quoteId: quote.id,
                        name: contact.name,
                        email: contact.email,
                        acknowledged: ack,
                      });
                      setOrder(r.order);
                      await refresh();
                      toast.success("Demo checkout completed");
                    });
                  }}
                >
                  <div className="field-grid">
                    <label className="form-field">
                      <span>Traveller name</span>
                      <input
                        required
                        minLength={2}
                        maxLength={100}
                        value={contact.name}
                        onChange={(e) =>
                          setContact((c) => ({ ...c, name: e.target.value }))
                        }
                      />
                    </label>
                    <label className="form-field">
                      <span>Email for your trip record</span>
                      <input
                        type="email"
                        required
                        value={contact.email}
                        onChange={(e) =>
                          setContact((c) => ({ ...c, email: e.target.value }))
                        }
                      />
                    </label>
                  </div>
                  <label className="consent-label">
                    <Checkbox
                      checked={ack}
                      onCheckedChange={(v) => setAck(v === true)}
                    />
                    <span>
                      I understand this is a demo. No money is collected and no
                      travel is reserved.
                    </span>
                  </label>
                  {seconds ? (
                    <button
                      className="primary full-width"
                      disabled={!!busy || !ack}
                    >
                      {busy === "pay" ? <Busy /> : <ShieldCheck size={17} />}{" "}
                      Complete demo payment · {money(quote.total)}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="primary full-width"
                      disabled={!!busy}
                      onClick={() => void run("quote", beginCheckout)}
                    >
                      <RefreshCw size={17} /> Refresh prices
                    </button>
                  )}
                  <p className="checkout-note">
                    No card or bank details required. Your trip record is saved;
                    no email is sent.
                  </p>
                </form>
              </>
            )
          )}
        </DialogContent>
      </Dialog>
      <Sheet open={saved} onOpenChange={setSaved}>
        <SheetContent className="trip-sheet">
          <SheetTitle>Your saved escapes</SheetTitle>
          <SheetDescription>
            Plans, booking items and conversations, all together.
          </SheetDescription>
          <div className="sheet-body">
            <button
              className="primary full-width"
              disabled={!!busy}
              onClick={() =>
                void run("new", async () => {
                  if (!user) {
                    setAuth(true);
                    return;
                  }
                  const r = await api("new-trip", {});
                  updateTrip(r.trip);
                  setSaved(false);
                  navigate("book");
                })
              }
            >
              <Plus size={17} /> Start a new trip
            </button>
            {trips.length ? (
              trips.map((t) => (
                <button
                  className={
                    "saved-trip " + (t.id === activeId ? "selected" : "")
                  }
                  key={t.id}
                  onClick={() => {
                    setActiveId(t.id);
                    setDay(1);
                    setActivity(0);
                    setSaved(false);
                    if (t.itinerary) navigate("itinerary");
                    else setCart(true);
                  }}
                >
                  <span className="saved-trip-icon">
                    <Compass size={22} />
                  </span>
                  <span>
                    <strong>{t.title}</strong>
                    <small>
                      {t.items.length} items ·{" "}
                      {t.itinerary
                        ? t.itinerary.days.length + " day itinerary"
                        : "Build it as you go"}
                    </small>
                    <span className="saved-status">
                      {t.status === "demo_confirmed"
                        ? "Demo checkout completed"
                        : "Draft trip"}
                    </span>
                  </span>
                  <ChevronRight size={18} />
                </button>
              ))
            ) : (
              <div className="empty-state">
                <Compass size={30} />
                <p>Your plans will appear here once you start a trip.</p>
              </div>
            )}
            {orders.length > 0 && (
              <div className="order-history">
                <h3>Demo booking history</h3>
                {orders.map((o) => (
                  <div key={o.id}>
                    <span>
                      PT-{o.id.slice(0, 8).toUpperCase()}
                      <small>
                        {new Date(o.createdAt).toLocaleDateString("en-IN")} ·{" "}
                        {o.items.length} items
                      </small>
                    </span>
                    <strong>{money(o.total)}</strong>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
      <Dialog open={account} onOpenChange={setAccount}>
        <DialogContent>
          <DialogTitle>
            {user ? "Your travel space" : "Welcome to Planitoday"}
          </DialogTitle>
          <DialogDescription>
            {user
              ? user.email
              : "Sign in to keep your plans, preferences and booking items together."}
          </DialogDescription>
          {user ? (
            <>
              <button
                className="outline-button full-width"
                onClick={() => {
                  setAccount(false);
                  setSaved(true);
                }}
              >
                <Luggage size={17} /> Saved trips & booking history
              </button>
              {trip?.profile && (
                <button
                  className="text-button danger"
                  onClick={() => {
                    setAccount(false);
                    setForget(true);
                  }}
                >
                  <Trash2 size={16} /> Remove this trip’s saved profile
                </button>
              )}
              <button className="text-button" disabled={!!busy} onClick={() => void run("sign-out", async () => {
                const response = await fetch("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
                if (!response.ok) throw new Error("Could not sign out. Please try again.");
                setAccount(false); setCart(false); setCheckout(false); setSaved(false); setOrder(null); setQuote(null); setRecs([]); setInitialProfile({}); setView("book");
                await refresh();
              })}>Sign out</button>
            </>
          ) : (
            <AccountForm onSuccess={async () => { await refresh(); setAccount(false); }} />
          )}
          <p className="field-hint">
            Your account and saved trips stay on this installation. Travel inventory and payment confirmations are demonstrations.
          </p>
        </DialogContent>
      </Dialog>
      <Dialog open={auth} onOpenChange={setAuth}>
        <DialogContent>
          <DialogTitle>A home for your next adventure.</DialogTitle>
          <DialogDescription>
            Sign in to save your trip and use the personal planner.
          </DialogDescription>
          <AccountForm onSuccess={async () => { await refresh(); setAuth(false); }} />
          <p className="field-hint">
            Create an account on this computer, or sign in to an existing local account. No external account is required.
          </p>
        </DialogContent>
      </Dialog>
      <AlertDialog open={forget} onOpenChange={setForget}>
        <AlertDialogContent>
          <AlertDialogTitle>Remove your saved travel profile?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the preferences, itinerary and assistant conversation
            for this trip. Existing booking records remain. This cannot be
            undone.
          </AlertDialogDescription>
          <button className="outline-button" onClick={() => setForget(false)}>
            Keep my profile
          </button>
          <button
            className="primary destructive"
            disabled={!!busy}
            onClick={() =>
              void run("forget", async () => {
                const r = await api("forget-profile", {
                  tripId: trip!.id,
                  version: trip!.version,
                });
                updateTrip(r.trip);
                setForget(false);
                navigate("book");
                toast.success("Your profile and itinerary were removed");
              })
            }
          >
            Remove saved profile
          </button>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
