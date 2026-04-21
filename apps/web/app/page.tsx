"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";

type ImageSample = { alpha: number; path: string };
type TextSample = { alpha: number; output: string };

type Prompt = {
  subject: string;
  prompt: string;
  image?: { baseline?: string; samples: ImageSample[] };
  text?: { baseline?: string; samples: TextSample[] };
};

type Concept = {
  name: string;
  neg: string;
  pos: string;
  prompts: Prompt[];
};

type Manifest = { concepts: Concept[] };

type TextExperiment = { layers: string; alpha: number; completion: string };
type TextEntry = {
  concept: string;
  subject: string;
  prompt: string;
  baseline: string;
  steered_experiments: TextExperiment[];
};

type Precision = "single" | "many" | "all";
type LayerRange = string;

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const DATA_PREFIX = `${BASE_PATH}/data/`;
const PRECISIONS: Precision[] = ["single", "many", "all"];
const LAYER_OPTIONS: Record<Precision, LayerRange[]> = {
  single: ["5", "9", "12", "16", "26"],
  many: ["4-7", "9-12", "16-18", "22-28"],
  all: ["0-29"],
};

const IMAGE_ALPHAS_SINGLE: number[] = [
  -1.0, -0.8, -0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6, 0.8, 1.0,
];
const IMAGE_ALPHAS_ALL: number[] = [
  -0.25, -0.2, -0.15, -0.1, -0.05, 0, 0.05, 0.1, 0.15, 0.2, 0.25,
];

function textLayerKey(precision: Precision, layerRange: string): string {
  if (precision === "single") return layerRange;
  const [a, b] = layerRange.split("-");
  return `(${a}, ${b})`;
}

export default function Home() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [textSamples, setTextSamples] = useState<TextEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [precision, setPrecision] = useState<Precision>("single");
  const [layerRange, setLayerRange] = useState<LayerRange>(
    LAYER_OPTIONS.single[0],
  );
  const [conceptName, setConceptName] = useState<string | null>(null);

  const handlePrecisionChange = (p: Precision) => {
    setPrecision(p);
    setLayerRange(LAYER_OPTIONS[p][0]);
  };

  useEffect(() => {
    fetch(`${DATA_PREFIX}manifest.json`, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return r.json() as Promise<Manifest>;
      })
      .then(setManifest)
      .catch((e) => setError(String(e)));
    fetch(`${DATA_PREFIX}text_samples.json`, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return r.json() as Promise<TextEntry[]>;
      })
      .then(setTextSamples)
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
      <section className="flex flex-col">
        {(() => {
          const concept =
            manifest.concepts.find((c) => c.name === conceptName) ??
            manifest.concepts[0];
          if (!concept) return null;
          return (
            <ConceptBlock
              concept={concept}
              allConcepts={manifest.concepts}
              setConceptName={setConceptName}
              textSamples={textSamples ?? []}
              precision={precision}
              setPrecision={handlePrecisionChange}
              layerRange={layerRange}
              setLayerRange={setLayerRange}
            />
          );
        })()}
      </section>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col px-4">
      {children}
    </div>
  );
}

function Header() {
  return (
    <header className="flex flex-col gap-2 pt-16 pb-8">
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
        Activation Steering
      </span>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        Steering Playground
      </h1>
      <span className="font-mono text-[11px] text-muted">
        model · janus-7b-pro
      </span>
    </header>
  );
}

function useAlphas(samples: { alpha: number }[], fixed?: number[]) {
  const alphas = useMemo(() => {
    if (fixed) return fixed;
    const set = new Set<number>([0]);
    for (const s of samples) set.add(s.alpha);
    return Array.from(set).sort((a, b) => a - b);
  }, [samples, fixed]);
  const zeroIdx = Math.max(0, alphas.indexOf(0));
  const [idx, setIdx] = useState<number>(zeroIdx);
  useEffect(() => setIdx(zeroIdx), [zeroIdx]);
  return { alphas, idx, setIdx, zeroIdx, alpha: alphas[idx] ?? 0 };
}

const TEXT_ALPHAS: number[] = Array.from({ length: 21 }, (_, i) =>
  Number((-1 + i * 0.1).toFixed(1)),
);

function ConceptBlock({
  concept,
  allConcepts,
  setConceptName,
  textSamples,
  precision,
  setPrecision,
  layerRange,
  setLayerRange,
}: {
  concept: Concept;
  allConcepts: Concept[];
  setConceptName: (v: string) => void;
  textSamples: TextEntry[];
  precision: Precision;
  setPrecision: (v: Precision) => void;
  layerRange: LayerRange;
  setLayerRange: (v: LayerRange) => void;
}) {
  const [subject, setSubject] = useState<string>(
    concept.prompts[0]?.subject ?? "",
  );
  const prompt =
    concept.prompts.find((p) => p.subject === subject) ?? concept.prompts[0];

  const imgSamples = prompt?.image?.samples ?? [];
  const imgCtl = useAlphas(
    imgSamples,
    precision === "all" ? IMAGE_ALPHAS_ALL : IMAGE_ALPHAS_SINGLE,
  );

  const txtEntry = textSamples.find(
    (e) => e.concept === concept.name && e.subject === subject,
  );
  const txtCtl = useAlphas([], TEXT_ALPHAS);

  if (!prompt) return null;

  const imgDir = `images/featured/${concept.name}/${subject}/${precision}/${layerRange}`;
  const imgPath =
    imgCtl.alpha === 0
      ? `${imgDir}/a_baseline.png`
      : `${imgDir}/${imgCtl.alpha < 0 ? "neg" : "pos"}_${Math.abs(imgCtl.alpha).toFixed(2)}.png`;
  const txtLayerKey = textLayerKey(precision, layerRange);
  const rawTxtOutput =
    txtCtl.alpha === 0
      ? txtEntry?.baseline
      : txtEntry?.steered_experiments.find(
          (e) =>
            e.layers === txtLayerKey &&
            Math.abs(e.alpha - txtCtl.alpha) < 1e-6,
        )?.completion;
  // Collapse whitespace runs to a single space so garbage completions
  // (endless newlines, token repetition) render as continuous text.
  const txtOutput = rawTxtOutput?.replace(/\s+/g, " ").trim();

  return (
    <div className="flex flex-col gap-3 py-4">
      <div className="flex flex-col gap-2 border-b border-border pb-2">
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <h2 className="text-xl tracking-tight">
              <span className="font-semibold capitalize">{prompt.prompt}</span>
              <span className="mx-2 font-normal text-muted">·</span>
              <span className="font-normal capitalize text-muted">
                {concept.name}
              </span>
            </h2>
            <span className="font-mono text-[11px] uppercase tracking-widest text-muted">
              {concept.neg} / {concept.pos}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-[1fr_18rem]">
        <div className="flex min-h-0 flex-col gap-3">
          <ContentBox label="text" alpha={txtCtl.alpha} className="h-36 shrink-0">
            {txtOutput ? (
              <div className="h-full w-full overflow-y-auto px-4 py-3.5 text-[15px] leading-relaxed">
                {txtOutput}
              </div>
            ) : (
              <EmptyCell />
            )}
          </ContentBox>
          <ContentBox label="image" alpha={imgCtl.alpha} fitImage>
            {imgPath ? (
              <Image
                src={`${BASE_PATH}/${imgPath}`}
                alt={concept.name}
                width={768}
                height={576}
                unoptimized
                className="h-full w-full object-contain"
              />
            ) : (
              <EmptyCell />
            )}
          </ContentBox>
        </div>

        <aside className="flex h-full flex-col gap-4 overflow-y-auto rounded-lg border border-border bg-card p-4">
          <div className="flex flex-col gap-2">
            <span className="font-mono text-[11px] uppercase tracking-widest text-muted">
              Subject
            </span>
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="rounded-md border border-border bg-background px-2 py-1.5 font-mono text-[12px] text-foreground focus:outline-none"
            >
              {concept.prompts.map((p) => (
                <option key={p.subject} value={p.subject}>
                  {p.prompt}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <span className="font-mono text-[11px] uppercase tracking-widest text-muted">
              Concept
            </span>
            <select
              value={concept.name}
              onChange={(e) => setConceptName(e.target.value)}
              className="rounded-md border border-border bg-background px-2 py-1.5 font-mono text-[12px] text-foreground focus:outline-none"
            >
              {allConcepts.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="h-px bg-border" />
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-widest text-muted">
                Layer Range
              </span>
            </div>
            <OptionSlider
              options={PRECISIONS}
              value={precision}
              onChange={setPrecision}
            />
            <OptionSlider
              options={LAYER_OPTIONS[precision]}
              value={layerRange}
              onChange={setLayerRange}
            />
          </div>
          <div className="h-px bg-border" />
          <SliderControl
            label="text"
            neg={concept.neg}
            pos={concept.pos}
            alphas={txtCtl.alphas}
            idx={txtCtl.idx}
            setIdx={txtCtl.setIdx}
            zeroIdx={txtCtl.zeroIdx}
            alpha={txtCtl.alpha}
          />
          <div className="h-px bg-border" />
          <SliderControl
            label="image"
            neg={concept.neg}
            pos={concept.pos}
            alphas={imgCtl.alphas}
            idx={imgCtl.idx}
            setIdx={imgCtl.setIdx}
            zeroIdx={imgCtl.zeroIdx}
            alpha={imgCtl.alpha}
          />
        </aside>
      </div>
    </div>
  );
}

function ContentBox({
  label,
  alpha,
  children,
  className,
  fitImage,
}: {
  label: string;
  alpha: number;
  children: React.ReactNode;
  className?: string;
  fitImage?: boolean;
}) {
  const sign = alpha > 0 ? "+" : alpha < 0 ? "−" : "";
  const displayAlpha = alpha === 0 ? "0" : `${sign}${Math.abs(alpha)}`;
  return (
    <article
      className={`flex flex-col gap-2 rounded-lg border border-border bg-card p-3 ${
        className ?? ""
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-widest text-muted">
          {label}
        </span>
        <span className="font-mono text-[13px] tabular-nums text-muted">
          α = {displayAlpha}
        </span>
      </div>
      <div
        className={`min-h-0 overflow-hidden rounded-md border border-border bg-background ${
          fitImage ? "aspect-[4/3] w-full self-start" : "flex-1"
        }`}
      >
        {children}
      </div>
    </article>
  );
}

function SliderControl({
  label,
  neg,
  pos,
  alphas,
  idx,
  setIdx,
  zeroIdx,
  alpha,
}: {
  label: string;
  neg: string;
  pos: string;
  alphas: number[];
  idx: number;
  setIdx: (n: number) => void;
  zeroIdx: number;
  alpha: number;
}) {
  const sign = alpha > 0 ? "+" : alpha < 0 ? "−" : "";
  const displayAlpha = alpha === 0 ? "0" : `${sign}${Math.abs(alpha)}`;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-widest text-muted">
          {label}
        </span>
        <span className="font-mono text-[13px] tabular-nums text-foreground">
          <span className="text-muted">α = </span>
          {displayAlpha}
        </span>
      </div>
      <div className="flex flex-col gap-2 px-4">
        <div className="flex items-center justify-between font-mono text-[11px] leading-none uppercase tracking-widest">
          <span
            className={`transition-colors ${
              alpha < 0 ? "text-foreground" : "text-muted"
            }`}
          >
            {neg}
          </span>
          <span
            className={`transition-colors ${
              alpha > 0 ? "text-foreground" : "text-muted"
            }`}
          >
            {pos}
          </span>
        </div>
        <div className="relative flex h-4.5 items-center">
          <input
            type="range"
            min={0}
            max={Math.max(0, alphas.length - 1)}
            step={1}
            value={idx}
            onChange={(e) => setIdx(Number(e.target.value))}
            className="slider relative z-10"
            disabled={alphas.length <= 1}
          />
          <div
            className="pointer-events-none absolute top-1/2 h-2 w-px -translate-x-1/2 -translate-y-1/2 bg-foreground/25"
            style={{
              left: `${(zeroIdx / Math.max(1, alphas.length - 1)) * 100}%`,
            }}
          />
        </div>
      </div>
    </div>
  );
}

function EmptyCell() {
  return (
    <div className="flex h-full items-center justify-center text-xs text-muted">
      —
    </div>
  );
}

function OptionSlider<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label?: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
}) {
  const idx = options.indexOf(value);
  return (
    <div className="flex flex-col gap-2">
      {label !== undefined && (
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] uppercase tracking-widest text-muted">
            {label}
          </span>
          <span className="font-mono text-[12px] uppercase tracking-widest text-foreground">
            {value}
          </span>
        </div>
      )}
      <div className="flex flex-col gap-2 px-4">
      <div className="relative flex h-4.5 items-center">
        <input
          type="range"
          min={0}
          max={Math.max(0, options.length - 1)}
          step={1}
          value={idx}
          onChange={(e) => onChange(options[Number(e.target.value)])}
          className="slider relative z-10"
          disabled={options.length <= 1}
        />
      </div>
      <div className="relative h-4 font-mono text-[11px] uppercase tracking-widest text-muted">
        {options.map((r, i) => {
          const pct =
            options.length <= 1 ? 50 : (i / (options.length - 1)) * 100;
          return (
            <span
              key={r}
              className={`absolute top-0 -translate-x-1/2 whitespace-nowrap ${
                r === value ? "text-foreground" : ""
              }`}
              style={{
                left: `calc(9px + ${pct}% - ${(pct / 100) * 18}px)`,
              }}
            >
              {r}
            </span>
          );
        })}
      </div>
      </div>
    </div>
  );
}
