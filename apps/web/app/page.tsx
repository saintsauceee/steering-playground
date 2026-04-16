"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";

type Modality = "image" | "text";

type Row = {
  modality: Modality;
  concept: string;
  pos_concept: string;
  neg_concept: string;
  alpha: number;
  prompt_idx: number;
  prompt: string;
  run: number;
  steered: string;
  baseline: string;
};

type Manifest = { rows: Row[] };

const DATA_PREFIX = "/data/";

type ConceptDef = { name: string; subjects: string[] };

const CONCEPTS: ConceptDef[] = [
  { name: "age", subjects: ["person", "park", "musician", "scientist"] },
  { name: "emotion", subjects: ["face", "letter", "student", "friends"] },
  { name: "cleanness", subjects: ["countertop", "sneakers", "sofa", "car"] },
  { name: "color", subjects: ["car", "backpack", "balloon", "raincoat"] },
];

export default function Home() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${DATA_PREFIX}manifest.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return r.json() as Promise<Manifest>;
      })
      .then(setManifest)
      .catch((e) => setError(String(e)));
  }, []);

  if (error) {
    return (
      <Shell>
        <Header />
        <div className="rounded-lg border border-base/40 bg-card p-4 text-sm">
          Failed to load manifest: {error}
        </div>
      </Shell>
    );
  }
  if (!manifest) {
    return (
      <Shell>
        <Header />
        <div className="text-sm text-muted">Loading…</div>
      </Shell>
    );
  }

  return (
    <Shell>
      <Header />
      <section className="grid grid-cols-1 gap-10 xl:grid-cols-2">
        {CONCEPTS.map((c) => (
          <ComparisonRow key={c.name} def={c} manifest={manifest} />
        ))}
      </section>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-6 py-14 sm:px-8 sm:py-20">
      {children}
    </div>
  );
}

function Header() {
  return (
    <header className="flex flex-col gap-3">
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
        Activation Steering
      </span>
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
        Steering Playground
      </h1>
      <span className="font-mono text-[11px] text-muted">
        model · janus-7b-pro
      </span>
    </header>
  );
}

function ComparisonRow({
  def,
  manifest,
}: {
  def: ConceptDef;
  manifest: Manifest;
}) {
  const concept = def.name;
  const conceptRows = useMemo(
    () =>
      manifest.rows.filter((r) => r.concept === concept && r.run === 0),
    [manifest, concept],
  );

  const promptIdxs = useMemo(() => {
    const set = new Set<number>();
    for (const r of conceptRows) set.add(r.prompt_idx);
    return Array.from(set).sort((a, b) => a - b);
  }, [conceptRows]);

  const [promptIdx, setPromptIdx] = useState<number>(promptIdxs[0] ?? 0);
  useEffect(() => {
    if (!promptIdxs.includes(promptIdx)) setPromptIdx(promptIdxs[0] ?? 0);
  }, [promptIdxs, promptIdx]);

  const imageRows = useMemo(
    () =>
      conceptRows.filter(
        (r) => r.modality === "image" && r.prompt_idx === promptIdx,
      ),
    [conceptRows, promptIdx],
  );
  const textRows = useMemo(
    () =>
      conceptRows.filter(
        (r) => r.modality === "text" && r.prompt_idx === promptIdx,
      ),
    [conceptRows, promptIdx],
  );

  const meta = imageRows[0] ?? textRows[0];
  if (!meta) return null;

  const currentPrompt =
    imageRows[0]?.prompt ?? textRows[0]?.prompt ?? "";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 border-b border-border pb-3">
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <h2 className="text-lg font-semibold capitalize tracking-tight">
              {meta.concept}
            </h2>
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
              {meta.neg_concept} / {meta.pos_concept}
            </span>
          </div>
          <select
            value={promptIdx}
            onChange={(e) => setPromptIdx(Number(e.target.value))}
            className="cursor-pointer rounded border border-border bg-card px-2 py-1 pr-6 text-xs capitalize transition-colors hover:border-foreground/40 focus:border-foreground focus:outline-none"
          >
            {promptIdxs.map((pi) => (
              <option key={pi} value={pi}>
                {def.subjects[pi] ?? `prompt ${pi + 1}`}
              </option>
            ))}
          </select>
        </div>
        <p className="font-mono text-[11px] italic text-muted">
          “{currentPrompt}”
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ModalityCard
          key={`image-${promptIdx}`}
          label="image"
          modality="image"
          rows={imageRows}
        />
        <ModalityCard
          key={`text-${promptIdx}`}
          label="text"
          modality="text"
          rows={textRows}
        />
      </div>
    </div>
  );
}

function ModalityCard({
  label,
  modality,
  rows,
}: {
  label: string;
  modality: Modality;
  rows: Row[];
}) {
  const alphas = useMemo(() => sortedAlphas(rows), [rows]);
  const zeroIdx = useMemo(() => {
    const i = alphas.indexOf(0);
    return i >= 0 ? i : Math.floor(alphas.length / 2);
  }, [alphas]);

  const [idx, setIdx] = useState<number>(zeroIdx);
  useEffect(() => setIdx(zeroIdx), [zeroIdx]);

  const meta = rows[0];
  if (!meta) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted">
        no {label} data
      </div>
    );
  }

  const alpha = alphas[idx] ?? 0;
  const row = rows.find((r) => r.alpha === alpha);
  const content =
    alpha === 0 ? (row?.baseline ?? row?.steered) : row?.steered;

  const sign = alpha > 0 ? "+" : alpha < 0 ? "−" : "";
  const displayAlpha = alpha === 0 ? "0" : `${sign}${Math.abs(alpha)}`;

  return (
    <article className="flex h-full flex-col gap-3 rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
          {label}
        </span>
        <span className="font-mono text-[11px] tabular-nums text-muted">
          α {displayAlpha}
        </span>
      </div>

      <div className="flex-1 overflow-hidden rounded-md border border-border bg-background min-h-72">
        {!content ? (
          <div className="flex h-full items-center justify-center text-xs text-muted">
            —
          </div>
        ) : modality === "image" ? (
          <Image
            src={`${DATA_PREFIX}${content}`}
            alt={meta.concept}
            width={768}
            height={576}
            unoptimized
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full overflow-y-auto p-4 text-[14px] leading-relaxed whitespace-pre-wrap">
            {content}
          </div>
        )}
      </div>

      <div className="flex h-4.5 items-center gap-3">
        <span
          className={`inline-flex h-4.5 items-center font-mono text-[10px] leading-none uppercase tracking-widest transition-colors ${
            alpha < 0 ? "text-foreground" : "text-muted/60"
          }`}
        >
          {meta.neg_concept}
        </span>
        <div className="relative flex h-4.5 flex-1 items-center">
          <input
            type="range"
            min={0}
            max={Math.max(0, alphas.length - 1)}
            step={1}
            value={idx}
            onChange={(e) => setIdx(Number(e.target.value))}
            className="slider relative z-10"
          />
          <div
            className="pointer-events-none absolute top-1/2 h-2 w-px -translate-x-1/2 -translate-y-1/2 bg-foreground/25"
            style={{
              left: `${(zeroIdx / Math.max(1, alphas.length - 1)) * 100}%`,
            }}
          />
        </div>
        <span
          className={`inline-flex h-4.5 items-center font-mono text-[10px] leading-none uppercase tracking-widest transition-colors ${
            alpha > 0 ? "text-foreground" : "text-muted/60"
          }`}
        >
          {meta.pos_concept}
        </span>
      </div>
    </article>
  );
}

function sortedAlphas(rows: Row[]): number[] {
  const set = new Set<number>();
  for (const r of rows) set.add(r.alpha);
  set.add(0);
  return Array.from(set).sort((a, b) => a - b);
}
