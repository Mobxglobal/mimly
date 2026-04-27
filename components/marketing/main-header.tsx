import Link from "next/link";

export function MainHeader() {
  return (
    <header className="sticky top-0 z-40 w-full bg-transparent">
      <div className="max-w-6xl mx-auto flex h-14 items-center justify-between px-6">
        <Link
          href="/"
          className="font-semibold text-lg tracking-normal text-[var(--canvas-heading)] hover:opacity-80 transition-opacity"
        >
          Meme Builder
        </Link>
        <Link
          href="/about"
          className="rounded-lg bg-[var(--canvas-heading)] px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-opacity hover:opacity-90"
        >
          About
        </Link>
      </div>
    </header>
  );
}
