"use client";

import { useCallback, useEffect, useRef, useState } from "react";

function ShareFooter() {
  return (
    <p className="pointer-events-none absolute bottom-3 left-0 right-0 text-center text-[11px] font-medium tracking-wide text-stone-500">
      Mimly
    </p>
  );
}

export function PublicShareViewer(props: {
  slideshowUrls: string[];
  mediaUrl: string | null;
  mediaType: "image" | "video";
}) {
  if (props.slideshowUrls.length > 0) {
    return <PublicSlideshowStory slideUrls={props.slideshowUrls} />;
  }
  return <PublicSingleMedia mediaUrl={props.mediaUrl} mediaType={props.mediaType} />;
}

function PublicSingleMedia({
  mediaUrl,
  mediaType,
}: {
  mediaUrl: string | null;
  mediaType: "image" | "video";
}) {
  if (!mediaUrl) {
    return (
      <div className="relative flex min-h-[100dvh] items-center justify-center bg-stone-100 px-6">
        <p className="text-center text-sm text-stone-600">Nothing to show here.</p>
        <ShareFooter />
      </div>
    );
  }
  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center bg-stone-950 px-3 py-10 sm:px-6">
      <div className="relative w-full max-w-3xl">
        {mediaType === "video" ? (
          <video
            src={mediaUrl}
            controls
            playsInline
            className="mx-auto max-h-[85dvh] w-full rounded-lg bg-black object-contain shadow-lg"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- public asset URL from storage
          <img
            src={mediaUrl}
            alt=""
            className="mx-auto max-h-[85dvh] w-full object-contain shadow-lg"
          />
        )}
      </div>
      <ShareFooter />
    </div>
  );
}

function PublicSlideshowStory({ slideUrls }: { slideUrls: string[] }) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [index, setIndex] = useState(0);

  const updateIndexFromScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el || slideUrls.length === 0) return;
    const slideW = el.clientWidth || 1;
    const next = Math.min(
      slideUrls.length - 1,
      Math.max(0, Math.round(el.scrollLeft / slideW))
    );
    setIndex(next);
  }, [slideUrls.length]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    updateIndexFromScroll();
    el.addEventListener("scroll", updateIndexFromScroll, { passive: true });
    return () => el.removeEventListener("scroll", updateIndexFromScroll);
  }, [slideUrls, updateIndexFromScroll]);

  return (
    <div className="relative min-h-[100dvh] bg-stone-950">
      <div
        ref={scrollerRef}
        className="flex h-[100dvh] w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {slideUrls.map((url, i) => (
          <div
            key={`${url}-${i}`}
            className="flex h-[100dvh] w-full shrink-0 snap-start snap-always items-center justify-center px-2"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- public asset URL */}
            <img
              src={url}
              alt=""
              className="max-h-full max-w-full object-contain"
            />
          </div>
        ))}
      </div>
      <div
        className="pointer-events-none absolute bottom-10 left-0 right-0 flex justify-center gap-1.5"
        aria-hidden="true"
      >
        {slideUrls.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 w-1.5 rounded-full transition ${
              i === index ? "bg-white" : "bg-white/35"
            }`}
          />
        ))}
      </div>
      <ShareFooter />
    </div>
  );
}
