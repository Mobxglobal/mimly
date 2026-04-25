"use client";

import { useState } from "react";
import { FramedSection } from "./framed-section";

type BentoItem = {
  id: string;
  step: string;
  title: string;
  description: string;
  videoSrc: string;
  posterSrc: string;
};

const BENTO_ITEMS: BentoItem[] = [
  {
    id: "type-your-idea",
    step: "1",
    title: "Type your idea",
    description:
      "Input your prompt, the more specific the better. Mimly uses this to generate relevant, on-brand content.",
    videoSrc: "/videos/video1.mov",
    posterSrc: "/understand1.png",
  },
  {
    id: "instant-meme-generation",
    step: "2",
    title: "Instant meme generation",
    description:
      "Your idea is turned into a ready-to-use meme directly inside your workspace.",
    videoSrc: "/videos/video2.mp4",
    posterSrc: "/context1.png",
  },
  {
    id: "generate-more-ideas",
    step: "3",
    title: "Generate more ideas instantly",
    description:
      "Ask for new angles or variations and watch fresh meme ideas appear in your workspace.",
    videoSrc: "/videos/video3.mp4",
    posterSrc: "/post2.png",
  },
  {
    id: "drive-engagement",
    step: "4",
    title: "Create posts that drive engagement",
    description:
      "Ask Mimly for engagement posts and get content designed to spark likes, comments, and shares.",
    videoSrc: "/videos/video4.mp4",
    posterSrc: "/post2.png",
  },
];

function DemoCard({ item, className }: { item: BentoItem; className?: string }) {
  const [videoFailed, setVideoFailed] = useState(false);

  return (
    <article
      className={`group relative overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-b from-white/[0.14] to-white/[0.05] p-3 shadow-[0_18px_50px_rgba(0,0,0,0.22)] backdrop-blur-sm ${className ?? ""}`}
    >
      <div className="relative overflow-hidden rounded-2xl border border-white/15 bg-stone-900">
        {videoFailed ? (
          <div className="flex aspect-video items-center justify-center bg-gradient-to-br from-stone-800 to-stone-700 px-6 text-center">
            <p className="text-sm font-medium text-stone-200">
              Demo unavailable. Add a video at <code>{item.videoSrc}</code>.
            </p>
          </div>
        ) : (
          <video
            className="aspect-video h-auto w-full object-cover"
            src={item.videoSrc}
            poster={item.posterSrc}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            onError={() => setVideoFailed(true)}
          />
        )}
      </div>

      <div className="px-1 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-sky-200/60 bg-sky-300/20 text-[11px] font-semibold text-sky-50">
            {item.step}
          </span>
          <h3 className="text-lg font-semibold tracking-tight text-white">{item.title}</h3>
        </div>
        <p className="mt-2 max-w-[62ch] text-sm leading-relaxed text-stone-200">{item.description}</p>
      </div>
    </article>
  );
}

export function ShowcaseBentoSection() {
  const [typeIdeaCard, instantCard, moreIdeasCard, engagementCard] = BENTO_ITEMS;

  return (
    <FramedSection
      variant="showcase"
      backgroundVariant="showcase"
      id="showcase-heading"
      aria-labelledby="showcase-heading"
      className="w-full"
    >
      <div className="mx-auto max-w-3xl text-center">
        <span className="inline-flex rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-stone-300">
          Product walkthrough
        </span>
        <h2 id="showcase-heading" className="mt-5 text-3xl font-bold tracking-tight text-white md:text-5xl">
          See Mimly in action
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-stone-200 md:text-base">
          From a simple prompt to ready-to-post content, Mimly helps you move from idea to output
          in a few quick steps.
        </p>
      </div>

      <div className="mx-auto mt-10 max-w-6xl space-y-5 md:space-y-6 lg:mt-12">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-12 md:gap-6">
          <DemoCard item={typeIdeaCard} className="md:col-span-8" />
          <div className="grid gap-5 md:col-span-4 md:grid-rows-2 md:gap-6">
            <DemoCard item={instantCard} />
            <DemoCard item={moreIdeasCard} />
          </div>
        </div>

        <DemoCard item={engagementCard} />
      </div>
    </FramedSection>
  );
}
