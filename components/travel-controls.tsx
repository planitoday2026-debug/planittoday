"use client";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Plane,
  Building2,
  TrainFront,
  Bus,
  Compass,
  CarFront,
  ArrowRight,
  Plus,
  Check,
  Star,
} from "lucide-react";
import {
  type Category,
  type Offer,
  money,
  dateLabel,
  cityCode,
} from "@/lib/travel";
export const categories: { id: Category; name: string; icon: typeof Plane }[] =
  [
    { id: "flights", name: "Flights", icon: Plane },
    { id: "hotels", name: "Hotels", icon: Building2 },
    { id: "trains", name: "Trains", icon: TrainFront },
    { id: "buses", name: "Buses", icon: Bus },
    { id: "packages", name: "Tour packages", icon: Compass },
    { id: "cabs", name: "Cabs", icon: CarFront },
  ];
export function Picker({
  value,
  options,
  onChange,
  label,
  className = "",
}: {
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
  label: string;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className={"picker " + className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
export function Busy() {
  return <Loader2 className="spin" size={17} />;
}
export function OfferCard({
  offer,
  added,
  onAdd,
  busy,
  compact = false,
}: {
  offer: Offer;
  added: boolean;
  onAdd: () => void;
  busy: boolean;
  compact?: boolean;
}) {
  const Icon = categories.find((c) => c.id === offer.category)!.icon;
  const from =
      offer.params.direction === "return" ? offer.params.to : offer.params.from,
    to =
      offer.params.direction === "return" ? offer.params.from : offer.params.to;
  return (
    <article className={"offer-card " + (compact ? "compact" : "")}>
      <div className="offer-main">
        <span className={"provider-icon " + offer.category}>
          <Icon size={21} />
        </span>
        <div>
          <span className="offer-badge">{offer.badge}</span>
          <h3>{offer.name}</h3>
          <p>{offer.subtitle}</p>
        </div>
        {offer.rating && (
          <span className="rating">
            <Star size={13} fill="currentColor" />
            {offer.rating}
          </span>
        )}
      </div>
      {offer.departure ? (
        <div className="flight-route">
          <div>
            <strong>{offer.departure}</strong>
            <span>
              {cityCode[from]} · {from}
            </span>
          </div>
          <div className="route-line">
            <span>{offer.duration}</span>
            <i>
              <Icon size={14} />
            </i>
            <small>
              {dateLabel(
                offer.params.direction === "return"
                  ? offer.params.end
                  : offer.params.start,
              )}
            </small>
          </div>
          <div>
            <strong>{offer.arrival}</strong>
            <span>
              {cityCode[to]} · {to}
            </span>
          </div>
        </div>
      ) : (
        <p className="stay-dates">
          {dateLabel(offer.params.start)} — {dateLabel(offer.params.end)} ·{" "}
          {offer.quantity}{" "}
          {offer.unit === "room / night"
            ? "room nights"
            : offer.unit + (offer.quantity > 1 ? "s" : "")}
        </p>
      )}
      <p className="offer-detail">{offer.detail}</p>
      <div className="offer-bottom">
        <div>
          <strong>{money(offer.total)}</strong>
          <small>
            {money(offer.price)} / {offer.unit} · {offer.quantity} included
          </small>
        </div>
        <button
          className={added ? "added-button" : "outline-button"}
          onClick={onAdd}
          disabled={busy || added}
        >
          {added ? <Check size={15} /> : busy ? <Busy /> : <Plus size={15} />}{" "}
          {added ? "Added" : "Add to trip"}
        </button>
      </div>
      <details className="offer-terms">
        <summary>View fare & booking details</summary>
        <p>{offer.terms}</p>
      </details>
    </article>
  );
}
