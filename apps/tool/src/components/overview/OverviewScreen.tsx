import { useMemo } from "react";
import { useCases } from "../../cases/store.js";
import { pct, truncate } from "../../domain.js";
import { attributionMix, auditActivity, overviewKpis, supportByCase } from "../../stats.js";
import type { AuditItem } from "../../stats.js";
import {
  AlertIcon, CheckIcon, DownloadIcon, FileTextIcon, FolderIcon, LinkIcon, MessageIcon, PlusIcon, QuarantineIcon, ZapIcon,
} from "../icons.js";
import { Avatar, Badge, IconTile, Pill, pressable } from "../primitives.js";

export function OverviewScreen({
  query, onOpenCase, onOpenImport, onOpenRunPanel,
}: {
  query: string;
  onOpenCase: (caseId: string, selectId?: string) => void;
  onOpenImport: () => void;
  onOpenRunPanel?: () => void;
}) {
  const { cases: registry } = useCases();
  const kpis = useMemo(() => overviewKpis(registry), [registry]);
  const mergeableIds = useMemo(
    () => new Set(Object.values(registry).filter((c) => c.mergePairs?.length).map((c) => c.id)),
    [registry],
  );
  const cases = useMemo(() => supportByCase(registry, mergeableIds), [registry, mergeableIds]);
  const mix = useMemo(() => attributionMix(registry), [registry]);
  const activity = useMemo(() => auditActivity(registry, 4), [registry]);

  const q = query.trim().toLowerCase();
  const visibleCases = q
    ? cases.filter((c) => c.label.toLowerCase().includes(q) || registry[c.id]!.bundle.question.toLowerCase().includes(q))
    : cases;
  const best = cases.reduce((a, b) => (b.support > a.support ? b : a), cases[0]!);

  return (
    <div className="scrl" style={{ overflowY: "auto", flex: 1 }}>
      <div className="page-head">
        <div>
          <div className="title">Evidence ledgers</div>
          <div className="sub">Real case studies where every claim traces back to an exact quote. Distrust any piece of evidence and watch the conclusion recompute.</div>
        </div>
        <div className="spacer" />
        <div className="actions">
          <button className="btn-outline" onClick={onOpenImport}>
            <DownloadIcon size={18} style={{ transform: "rotate(180deg)" }} /> Import ledger
          </button>
          {onOpenRunPanel && (
            <button className="btn-outline" onClick={onOpenRunPanel}>
              <ZapIcon size={18} /> Run pipeline
            </button>
          )}
          <button className="btn-primary" onClick={() => onOpenCase("lhc")}>
            <PlusIcon size={18} color="#fff" /> Open flagship case
          </button>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="top">
            <IconTile><FolderIcon size={21} /></IconTile>
            <Pill tone="amber">{mergeableIds.size} mergeable</Pill>
          </div>
          <div className="val">{kpis.cases}</div>
          <div className="lbl">Case ledgers</div>
        </div>
        <div className="kpi-card">
          <div className="top">
            <IconTile><FileTextIcon size={21} /></IconTile>
            <Pill tone="green"><CheckIcon size={12} /> {kpis.passages} passages</Pill>
          </div>
          <div className="val">{kpis.claims}</div>
          <div className="lbl">Claims tracked</div>
        </div>
        <div className="kpi-card">
          <div className="top">
            <IconTile><AlertIcon size={21} /></IconTile>
            <Pill tone="pink"><span className="dot" style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} /> {kpis.openChallenges} open</Pill>
          </div>
          <div className="val">{kpis.challenges}</div>
          <div className="lbl">Adversarial challenges</div>
        </div>
        <div className="kpi-card">
          <div className="top">
            <IconTile><QuarantineIcon size={21} /></IconTile>
            <Pill tone="neutral">no source quote</Pill>
          </div>
          <div className="val">{kpis.quarantined}</div>
          <div className="lbl">Claims quarantined</div>
        </div>
      </div>

      <div className="charts-row">
        <div className="panel-card">
          <div className="head">
            <div>
              <div className="t">Conclusion support by case</div>
              <div className="s">Each case's Support under its default perspective · click a bar to open it</div>
            </div>
            <div className="spacer" />
            <div className="legend">
              <span className="key"><span className="sw" style={{ background: "var(--ink)" }} />support</span>
              <span className="key"><span className="sw" style={{ background: "var(--green)" }} />strongest</span>
            </div>
          </div>
          <div className="barchart">
            {cases.map((c) => (
              <div key={c.id} className="bar-col" onClick={() => onOpenCase(c.id)} {...pressable(() => onOpenCase(c.id))} title={`Open ${c.label}`} aria-label={`Open ${c.label} — support ${pct(c.support)}`}>
                <span className="bar-val">{pct(c.support)}</span>
                <div className={`bar-fill${c.id === best.id ? " hot" : ""}`} style={{ height: `${Math.max(4, c.support * 100)}%` }} />
              </div>
            ))}
          </div>
          <div className="bar-axis">
            {cases.map((c) => <span key={c.id} className={c.id === best.id ? "hot" : ""}>{c.label}</span>)}
          </div>
        </div>

        <div className="panel-card">
          <div className="head">
            <div>
              <div className="t">Claim attribution</div>
              <div className="s">Who each claim came from</div>
            </div>
          </div>
          <AttributionDonut mix={mix} />
        </div>
      </div>

      <div className="bottom-row">
        <div className="panel-card data-table">
          <div className="head" style={{ marginBottom: 6 }}>
            <div className="t">Case ledgers</div>
          </div>
          <div className="thead" style={{ gridTemplateColumns: "1.7fr 0.8fr 1.2fr 0.7fr" }}>
            <span>CASE</span><span>SUPPORT</span><span>STATUS</span><span style={{ textAlign: "right" }}>CLAIMS</span>
          </div>
          {visibleCases.map((c) => (
            <div key={c.id} className="trow" style={{ gridTemplateColumns: "1.7fr 0.8fr 1.2fr 0.7fr" }} onClick={() => onOpenCase(c.id)} {...pressable(() => onOpenCase(c.id))} aria-label={`Open ${c.label}`}>
              <div className="name">
                <Avatar label={c.label} size={34} tile />
                <span className="nm">{c.label}</span>
              </div>
              <span className="num">{pct(c.support)}</span>
              <span>
                {c.generated
                  ? <Badge tone="green">pipeline-generated</Badge>
                  : c.mergeable
                    ? <Badge tone="amber">mergeable</Badge>
                    : <Badge tone="purple">{c.overlays} perspectives</Badge>}
              </span>
              <span className="end">{c.claims}</span>
            </div>
          ))}
          {visibleCases.length === 0 && <p className="note">No cases match “{query.trim()}”.</p>}
        </div>

        <div className="panel-card">
          <div className="head" style={{ marginBottom: 22 }}>
            <div className="t">Adversarial audit trail</div>
          </div>
          <div className="timeline">
            {activity.map((a, i) => (
              <ActivityRow key={i} item={a} last={i === activity.length - 1} onOpen={onOpenCase} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function AttributionDonut({ mix }: { mix: { fromSource: number; llm: number; human: number; quarantined: number; total: number } }) {
  const grand = mix.total + mix.quarantined;
  const segs = [
    { label: "From source", value: mix.fromSource, color: "#171717" },
    { label: "AI-proposed", value: mix.llm, color: "#22c55e" },
    { label: "Human", value: mix.human, color: "#ffe24d" },
    { label: "Quarantined", value: mix.quarantined, color: "#e2e2e2" },
  ].filter((s) => s.value > 0);
  let acc = 0;
  const stops = segs.map((s) => {
    const from = acc;
    acc += (s.value / grand) * 100;
    return `${s.color} ${from}% ${acc}%`;
  });
  return (
    <>
      <div className="donut-wrap">
        <div className="donut" style={{ background: `conic-gradient(${stops.join(",")})` }}>
          <div className="hole">
            <span className="n">{mix.total}</span>
            <span className="l">claims</span>
          </div>
        </div>
      </div>
      <div className="donut-legend">
        {segs.map((s) => (
          <div className="row" key={s.label}>
            <span className="sw" style={{ background: s.color }} />
            <span className="k">{s.label}</span>
            <span className="v">{Math.round((s.value / grand) * 100)}%</span>
          </div>
        ))}
      </div>
    </>
  );
}

function ActivityRow({ item, last, onOpen }: { item: AuditItem; last: boolean; onOpen: (caseId: string, selectId?: string) => void }) {
  const circle =
    item.kind === "challenge" ? { bg: "var(--yellow)", icon: <MessageIcon size={16} /> }
    : item.kind === "contradiction" ? { bg: "var(--pink-bg)", icon: <LinkIcon size={15} color="#db2777" /> }
    : { bg: "var(--surface-2)", icon: <QuarantineIcon size={16} color="#737373" /> };
  return (
    <div className="tl-item link" onClick={() => onOpen(item.caseId, item.targetId)} {...pressable(() => onOpen(item.caseId, item.targetId))} aria-label={`Open ${item.caseLabel}: ${item.actor}`}>
      <div className="tl-rail">
        <span className="tl-circle" style={{ background: circle.bg }}>{circle.icon}</span>
        {!last && <div className="tl-line" />}
      </div>
      <div className="tl-body">
        <div className="tl-text"><strong>{item.actor}</strong> — {truncate(item.text, 92)}</div>
        <div className="tl-meta">{item.caseLabel}</div>
      </div>
    </div>
  );
}
