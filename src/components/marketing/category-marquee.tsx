import { BookOpen, Bus, Dumbbell, Laptop, Printer, Scissors, Shirt, Ticket, Utensils, Wifi } from "lucide-react";

const categories = [
  { label: "Food & drinks", icon: Utensils },
  { label: "Printing", icon: Printer },
  { label: "Data & airtime", icon: Wifi },
  { label: "Fashion", icon: Shirt },
  { label: "Barbers & salons", icon: Scissors },
  { label: "Tech & repairs", icon: Laptop },
  { label: "Transport", icon: Bus },
  { label: "Books & courses", icon: BookOpen },
  { label: "Fitness", icon: Dumbbell },
  { label: "Events", icon: Ticket },
];

function Row({ hidden = false }: { hidden?: boolean }) {
  return (
    <ul className="flex shrink-0 gap-3 pr-3" aria-hidden={hidden || undefined}>
      {categories.map(({ label, icon: Icon }) => (
        <li
          key={label}
          className="glass flex items-center gap-2.5 rounded-full px-5 py-3 text-base font-semibold whitespace-nowrap text-ink-900"
        >
          <Icon className="size-5 text-blue-500" aria-hidden />
          {label}
        </li>
      ))}
    </ul>
  );
}

/** The kinds of places Perqly covers. Pauses on hover and for reduced motion. */
export function CategoryMarquee() {
  return (
    <section aria-label="Deal categories" className="relative py-6">
      <div className="group flex overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]">
        <div className="flex animate-marquee group-hover:[animation-play-state:paused] motion-reduce:animate-none">
          <Row />
          <Row hidden />
        </div>
      </div>
    </section>
  );
}
