import Image from "next/image";
import { FramedSection } from "./framed-section";

const STEPS = [
  {
    number: "1",
    title: "Type your idea",
    description: "Enter a simple prompt describing the content you want.",
    image: "/understand.png",
    rotation: "lg:-rotate-[4deg]",
    desktopOffset: "lg:translate-y-10",
  },
  {
    number: "2",
    title: "Mimly creates the concept",
    description:
      "Our AI turns it into meme-ready ideas using proven formats and trends.",
    image: "/context.png",
    rotation: "lg:rotate-0",
    desktopOffset: "lg:-translate-y-2",
  },
  {
    number: "3",
    title: "Generate and post",
    description:
      "Get fully designed memes and slideshows, ready to share instantly.",
    image: "/post.png",
    rotation: "lg:rotate-[4deg]",
    desktopOffset: "lg:translate-y-8",
  },
] as const;

function StepCard({
  step,
}: {
  step: (typeof STEPS)[number];
}) {
  return (
    <article className="rounded-[1.6rem] border border-white/10 bg-white/[0.04] p-3 shadow-[0_16px_40px_rgba(0,0,0,0.22)] backdrop-blur-xl">
      <div className="relative overflow-hidden rounded-[1.2rem]">
        <Image
          src={step.image}
          alt={step.title}
          width={1800}
          height={1200}
          className="h-auto w-full object-cover"
          priority={step.number === "1"}
        />
      </div>
      <div className="px-1 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-orange-500 text-[11px] font-semibold text-white">
            {step.number}
          </span>
          <h3 className="text-base font-semibold text-white">{step.title}</h3>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-stone-400">
          {step.description}
        </p>
      </div>
    </article>
  );
}

export function FeaturesSection() {
  return (
    <FramedSection
      variant="footer"
      backgroundVariant="footer"
      id="features-heading"
      aria-labelledby="features-heading"
      className="w-full"
    >
      <div className="mx-auto max-w-3xl text-center">
        <span className="inline-flex rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-stone-300">
          The process
        </span>
        <h2
          id="features-heading"
          className="mt-5 text-3xl font-bold tracking-tight text-white md:text-5xl"
        >
          Behind the memes
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-stone-400 md:text-base">
          Mimly turns a simple prompt into social-ready memes and slideshows in
          seconds - just type, generate, and post.
        </p>
      </div>

      <div className="mx-auto mt-10 max-w-6xl sm:mt-12">
        <div className="grid gap-5 lg:grid-cols-3 lg:items-start">
          {STEPS.map((step) => (
            <div
              key={step.number}
              className={`${step.rotation} ${step.desktopOffset} transition-transform duration-300`}
            >
              <StepCard step={step} />
            </div>
          ))}
        </div>
      </div>
    </FramedSection>
  );
}
