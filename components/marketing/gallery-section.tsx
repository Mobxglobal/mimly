import { Radio, Zap, TrendingUp, Heart } from "lucide-react";

const WHY_ITEMS = [
  { icon: Radio, label: "Reach" },
  { icon: Zap, label: "Speed" },
  { icon: TrendingUp, label: "Relevance" },
  { icon: Heart, label: "Engagement" },
] as const;

export function GallerySection() {
  return (
    <section
      id="why"
      aria-labelledby="why-heading"
      className="w-full px-4 py-16 sm:px-6 sm:py-20 md:px-8 md:py-24"
    >
      <div className="mx-auto max-w-4xl text-center">
        <h2
          id="why-heading"
          className="text-4xl font-semibold tracking-normal text-stone-900 sm:text-5xl md:text-6xl"
        >
          The internet runs on memes.
          <br />
          <span className="font-extrabold text-stone-900 bg-sky-100/80 px-1.5 py-0.5 rounded">Brands</span> should too.
        </h2>
      </div>

      <div className="mx-auto mt-12 grid max-w-4xl grid-cols-2 place-items-center gap-5 sm:mt-14 sm:gap-6 md:grid-cols-4 md:gap-6">
        {WHY_ITEMS.map(({ icon: Icon, label }) => (
          <WhyItem key={label} icon={Icon} label={label} />
        ))}
      </div>
    </section>
  );
}

type WhyIcon = (typeof WHY_ITEMS)[number]["icon"];

interface WhyItemProps {
  icon: WhyIcon;
  label: string;
}

function WhyItem({ icon: Icon, label }: WhyItemProps) {
  return (
    <div className="flex flex-col items-center text-center">
      <Icon className="h-9 w-9 text-stone-600" aria-hidden />
      <span className="mt-2.5 text-base font-medium text-stone-700">{label}</span>
    </div>
  );
}
