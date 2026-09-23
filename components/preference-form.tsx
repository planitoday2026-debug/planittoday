"use client";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Sparkles,
  Users,
  Compass,
  Heart,
  Wallet,
  Check,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import {
  defaultProfile,
  profileSchema,
  cities,
  destinations,
  type Profile,
} from "@/lib/travel";
import { Picker, Busy } from "./travel-controls";
const steps = [
  {
    title: "First, the big picture.",
    subtitle: "Where are you headed, and who’s coming along?",
    icon: Users,
  },
  {
    title: "What does a good trip feel like?",
    subtitle: "The best itinerary fits your rhythm, not someone else’s.",
    icon: Compass,
  },
  {
    title: "Spend on what matters.",
    subtitle: "Tell us where to indulge, and where to keep things simple.",
    icon: Wallet,
  },
  {
    title: "The details make it yours.",
    subtitle: "A little more context helps us plan a lot more thoughtfully.",
    icon: Heart,
  },
  {
    title: "Meet your travel personality.",
    subtitle: "One last look before we connect the dots.",
    icon: Sparkles,
  },
];
export function PreferenceForm({
  onGenerate,
  busy,
  mode,
  initial,
}: {
  onGenerate: (p: Profile) => void;
  busy: boolean;
  mode: string;
  initial?: Partial<Profile>;
}) {
  const [p, setP] = useState<Profile>({ ...defaultProfile, ...initial }),
    [step, setStep] = useState(0),
    [consent, setConsent] = useState(false),
    [error, setError] = useState("");
  const set = (key: keyof Profile, value: any) =>
    setP((v) => ({ ...v, [key]: value }));
  function next() {
    setError("");
    if (step === 0) {
      if (p.end <= p.start || !p.start || !p.end) {
        setError("Choose a return date after your departure.");
        return;
      }
      if (p.children > 0 && p.childAges.split(",").length !== p.children) {
        setError("Enter one age per child, separated by commas.");
        return;
      }
    }
    setStep(Math.min(4, step + 1));
  }
  function submit() {
    const parsed = profileSchema.safeParse({ ...p, consent });
    if (!parsed.success) {
      setError(parsed.error.issues.map((x) => x.message).join(". "));
      return;
    }
    onGenerate(parsed.data);
  }
  const pick = (
    key: keyof Profile,
    label: string,
    options: readonly string[],
  ) => (
    <label className="form-field">
      <span>{label}</span>
      <Picker
        label={label}
        value={String(p[key])}
        options={options}
        onChange={(v) => set(key, v)}
      />
    </label>
  );
  const field = (
    key: keyof Profile,
    label: string,
    type = "text",
    min?: number,
    max?: number,
  ) => (
    <label className="form-field">
      <span>{label}</span>
      <input
        type={type}
        min={min}
        max={max}
        value={String(p[key])}
        onChange={(e) =>
          set(key, type === "number" ? Number(e.target.value) : e.target.value)
        }
      />
    </label>
  );
  return (
    <div className="wizard-layout">
      <aside className="wizard-aside">
        <span className="eyebrow">
          <Sparkles size={15} /> THE PERSONAL PLANNER
        </span>
        <h2>
          Good trips start
          <br />
          with <em>you.</em>
        </h2>
        <p>
          A few thoughtful questions. An itinerary that gets your kind of
          travel.
        </p>
        <ol>
          {steps.map((s, i) => (
            <li
              key={s.title}
              className={i === step ? "current" : i < step ? "done" : ""}
            >
              <span>{i < step ? <Check size={14} /> : i + 1}</span>
              <button
                onClick={() => i < step && setStep(i)}
                disabled={i > step}
              >
                {
                  [
                    "Your trip",
                    "Your rhythm",
                    "Your budget",
                    "Your needs",
                    "Your profile",
                  ][i]
                }
              </button>
            </li>
          ))}
        </ol>
        <div className="planner-mode">
          <Sparkles size={18} />
          <p>
            <strong>
              {mode === "ai"
                ? "AI planner connected"
                : "Try the preview planner"}
            </strong>
            <small>
              {mode === "ai"
                ? "Your preferences guide the AI."
                : "Curated plans now. Full AI when connected."}
            </small>
          </p>
        </div>
      </aside>
      <section className="wizard-card">
        <div className="wizard-progress">
          <span>STEP {step + 1} OF 5</span>
          <span>{Math.round(((step + 1) / 5) * 100)}%</span>
        </div>
        <Progress value={(step + 1) * 20} />
        <h2>{steps[step].title}</h2>
        <p className="subtext">{steps[step].subtitle}</p>
        <div className="wizard-fields">
          {step === 0 && (
            <>
              <div className="field-grid">
                {pick("origin", "Starting from", cities)}
                {pick("destination", "Destination", destinations)}
                {field("start", "Departure date", "date")}
                {field("end", "Return date", "date")}
                {pick("composition", "Who’s travelling?", [
                  "Solo",
                  "Couple",
                  "Friends",
                  "Family",
                  "Multigenerational",
                ])}
                {field("occasion", "What’s the occasion?")}
                {field("adults", "Adults", "number", 1, 8)}
                {field("children", "Children (0–17)", "number", 0, 6)}
                {p.children > 0 &&
                  field("childAges", "Children’s ages (comma-separated)")}
                {pick("flexibility", "Date flexibility", [
                  "Fixed",
                  "Flexible by 2 days",
                ])}
              </div>
              <p className="field-hint">
                Demo routes cover the listed cities. Kyoto uses Osaka airport;
                Kerala plans are based in Kochi.
              </p>
            </>
          )}
          {step === 1 && (
            <>
              <label className="form-field">
                <span>What do you gravitate towards?</span>
                <small>Choose as many as you like.</small>
              </label>
              <div className="interest-grid">
                {[
                  "Food",
                  "Culture",
                  "Nature",
                  "Beaches",
                  "Adventure",
                  "Shopping",
                  "Wellness",
                  "Nightlife",
                ].map((v) => (
                  <button
                    key={v}
                    className={
                      p.interests.includes(v as any)
                        ? "interest selected"
                        : "interest"
                    }
                    aria-pressed={p.interests.includes(v as any)}
                    onClick={() =>
                      set(
                        "interests",
                        p.interests.includes(v as any)
                          ? p.interests.filter((x) => x !== v)
                          : [...p.interests, v],
                      )
                    }
                  >
                    {v}
                    {p.interests.includes(v as any) && <Check size={15} />}
                  </button>
                ))}
              </div>
              <div className="field-grid">
                {pick("pace", "How full should your days feel?", [
                  "Relaxed",
                  "Balanced",
                  "Packed",
                ])}
                {pick("morning", "Your mornings", [
                  "Early start",
                  "Slow mornings",
                ])}
                {pick("transport", "Getting around", [
                  "Private cab",
                  "Public transport",
                  "Mix of both",
                ])}
                {pick("stay", "Your ideal stay", [
                  "Boutique",
                  "Resort",
                  "Budget",
                  "Apartment",
                ])}
              </div>
            </>
          )}
          {step === 2 && (
            <>
              <div className="budget-display">
                <span>Your total trip budget</span>
                <strong>₹{p.budget.toLocaleString("en-IN")}</strong>
                <small>For everyone · Travel, stays, food & experiences</small>
              </div>
              <Slider
                aria-label="Total trip budget"
                min={5000}
                max={300000}
                step={5000}
                value={[p.budget]}
                onValueChange={(v) => set("budget", v[0])}
              />
              <div className="range-labels">
                <span>₹5,000</span>
                <span>₹3,00,000</span>
              </div>
              <div className="field-grid">
                {field(
                  "budget",
                  "Or enter an exact amount (INR)",
                  "number",
                  5000,
                  2000000,
                )}
                {pick("priority", "Where would you rather spend?", [
                  "Balanced",
                  "Better stays",
                  "More experiences",
                  "Lowest cost",
                ])}
              </div>
              <div className="tip-box">
                Your budget is a planning target. You’ll review actual demo item
                totals before checkout, with activities estimated separately.
              </div>
            </>
          )}
          {step === 3 && (
            <>
              <div className="field-grid">
                {pick("diet", "Food preferences", [
                  "No preference",
                  "Vegetarian",
                  "Vegan",
                  "Halal",
                  "Other",
                ])}
                {pick("mobility", "Access & walking", [
                  "No restrictions",
                  "Limit walking",
                  "Step-free required",
                ])}
                {field("arrivalTime", "Expected arrival time", "time")}
                {field("departureTime", "Expected departure time", "time")}
              </div>
              <label className="form-field">
                <span>Anything you absolutely want to do?</span>
                <textarea
                  value={p.mustDo}
                  maxLength={600}
                  onChange={(e) => set("mustDo", e.target.value)}
                  placeholder="A sunset dinner, a craft workshop, a particular place…"
                />
              </label>
              <label className="form-field">
                <span>Anything you would rather skip?</span>
                <textarea
                  value={p.avoid}
                  maxLength={600}
                  onChange={(e) => set("avoid", e.target.value)}
                  placeholder="Crowds, long drives, strenuous walks…"
                />
              </label>
              <label className="form-field">
                <span>Other practical needs (optional)</span>
                <textarea
                  value={p.notes}
                  maxLength={1000}
                  onChange={(e) => set("notes", e.target.value)}
                  placeholder="Room preferences, time for naps, dietary details. Share only what is useful."
                />
              </label>
            </>
          )}
          {step === 4 && (
            <>
              <div className="profile-summary">
                <div>
                  <span>Your escape</span>
                  <strong>
                    {p.origin} → {p.destination}
                  </strong>
                  <small>
                    {p.start} to {p.end}
                  </small>
                </div>
                <div>
                  <span>Your people</span>
                  <strong>
                    {p.adults} adults
                    {p.children ? ", " + p.children + " children" : ""}
                  </strong>
                  <small>
                    {p.composition} · {p.occasion}
                  </small>
                </div>
                <div>
                  <span>Your rhythm</span>
                  <strong>
                    {p.pace} · {p.morning}
                  </strong>
                  <small>{p.interests.join(" · ")}</small>
                </div>
                <div>
                  <span>Your budget</span>
                  <strong>₹{p.budget.toLocaleString("en-IN")} total</strong>
                  <small>
                    {p.priority} · {p.stay} stay
                  </small>
                </div>
                <div>
                  <span>Your requirements</span>
                  <strong>{p.diet}</strong>
                  <small>
                    {p.mobility} · {p.transport}
                  </small>
                </div>
              </div>
              <label className="consent-label">
                <Checkbox
                  checked={consent}
                  onCheckedChange={(v) => setConsent(v === true)}
                />
                <span>
                  Save these preferences with my trip
                  {mode === "ai"
                    ? " and send them to the connected AI provider to create and refine my itinerary"
                    : ""}
                  . I can remove my saved profile later.
                </span>
              </label>
              {mode !== "ai" && (
                <p className="field-hint">
                  Preview mode uses a curated destination library. Free-text
                  requests, date flexibility, accommodation types and unusual
                  constraints may need manual review; they are saved for the AI
                  connection.
                </p>
              )}
            </>
          )}
        </div>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="wizard-buttons">
          <button
            className="text-button"
            onClick={() => setStep(Math.max(0, step - 1))}
            disabled={step === 0 || busy}
          >
            <ArrowLeft size={16} /> Back
          </button>
          {step < 4 ? (
            <button className="primary" onClick={next}>
              Continue <ArrowRight size={17} />
            </button>
          ) : (
            <button
              className="primary"
              disabled={busy || !consent}
              onClick={submit}
            >
              {busy ? <Busy /> : <Sparkles size={17} />}{" "}
              {busy ? "Creating your itinerary…" : "Create my itinerary"}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
