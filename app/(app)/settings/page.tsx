"use client";

import { useState, useEffect } from "react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getProfile, upsertProfile } from "@/lib/actions/profile";

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState("");
  const [brandName, setBrandName] = useState("");
  const [whatYouDo, setWhatYouDo] = useState("");
  const [audience, setAudience] = useState("");
  const [country, setCountry] = useState("");

  useEffect(() => {
    getProfile().then((profile) => {
      if (profile) {
        setEmail(profile.email ?? "");
        setBrandName(profile.brand_name ?? "");
        setWhatYouDo(profile.what_you_do ?? "");
        setAudience(profile.audience ?? "");
        setCountry(profile.country ?? "");
      }
      setLoading(false);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await upsertProfile({
      email,
      brand_name: brandName,
      what_you_do: whatYouDo,
      audience,
      country,
    });
    setSaving(false);
  }

  const inputClass =
    "mt-1 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-stone-100 placeholder:text-stone-500 focus:border-indigo-400/50 focus:bg-white/[0.05] focus:outline-none focus:ring-1 focus:ring-indigo-400/40";
  const labelClass = "block text-sm font-medium text-stone-300";

  if (loading) {
    return (
      <DashboardShell>
        <div className="mx-auto w-full max-w-6xl">
          <p className="text-stone-400">Loading…</p>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="mx-auto w-full max-w-6xl">
        <h1 className="text-xl font-semibold tracking-tight text-white md:text-2xl">
          Settings
        </h1>
        <p className="mt-1 text-sm text-stone-400">
          Manage your account and brand details from onboarding.
        </p>

        <form className="mt-6 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 shadow-[0_12px_32px_rgba(0,0,0,0.18)] backdrop-blur-xl sm:p-6">
            <h2 className="text-base font-semibold text-white">Account</h2>
            <p className="mt-1 text-sm text-stone-400">
              Email used for your account.
            </p>
            <div className="mt-4">
              <label htmlFor="settings-email" className={labelClass}>
                Email address
              </label>
              <input
                id="settings-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                required
              />
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 shadow-[0_12px_32px_rgba(0,0,0,0.18)] backdrop-blur-xl sm:p-6">
            <h2 className="text-base font-semibold text-white">Brand</h2>
            <p className="mt-1 text-sm text-stone-400">
              Details from onboarding used to tailor your memes.
            </p>
            <div className="mt-4 flex flex-col gap-4">
              <div>
                <label htmlFor="settings-brand" className={labelClass}>
                  Brand name
                </label>
                <input
                  id="settings-brand"
                  type="text"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="settings-what-you-do" className={labelClass}>
                  What you do
                </label>
                <input
                  id="settings-what-you-do"
                  type="text"
                  value={whatYouDo}
                  onChange={(e) => setWhatYouDo(e.target.value)}
                  className={inputClass}
                  placeholder="e.g. Online fitness coaching"
                />
              </div>
              <div>
                <label htmlFor="settings-audience" className={labelClass}>
                  Target audience
                </label>
                <input
                  id="settings-audience"
                  type="text"
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                  className={inputClass}
                  placeholder="e.g. Busy professionals"
                />
              </div>
              <div>
                <label htmlFor="settings-country" className={labelClass}>
                  Country / region
                </label>
                <input
                  id="settings-country"
                  type="text"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className={inputClass}
                  placeholder="e.g. United States"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={saving}
              className="cta-funky rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white shadow-[0_10px_30px_rgba(99,102,241,0.35)] hover:bg-indigo-400 transition-colors font-display disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </DashboardShell>
  );
}
