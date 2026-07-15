import type { Bundle, Match } from "@epistemic-git/protocol";
import { truncate } from "../../domain.js";
import { Badge, MarkCircle } from "../primitives.js";
import type { Look } from "./types.js";

export function ChallengesTab({ bundle, onSelect }: { bundle: Bundle; onSelect: (id: string) => void }) {
  return (
    <>
      <div className="content-head"><div className="t">Adversarial challenges</div></div>
      <div className="task-list">
        {bundle.challenges.map((c) => {
          const clickable = c.target.kind === "claim" || c.target.kind === "inference";
          return (
            <div
              key={c.id}
              className={`task-card${clickable ? " clickable" : ""}`}
              onClick={() => clickable && onSelect(c.target.id)}
            >
              <span className="mark"><MarkCircle kind="pink" /></span>
              <div className="main">
                <div className="title">{c.rationale}</div>
                {c.target.kind === "topic" && <div className="desc">missing coverage: {c.target.id}</div>}
                <div className="foot">
                  <Badge tone="pink">{c.challengeType}</Badge>
                  <Badge tone="neutral">{c.status}</Badge>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

export function RelationsTab({ bundle, look, onSelect }: { bundle: Bundle; look: Look; onSelect: (id: string) => void }) {
  return (
    <>
      {bundle.matches.length > 0 && (
        <>
          <div className="content-head"><div className="t">Claim relations</div></div>
          <div className="task-list">
            {bundle.matches.map((m) => <MatchCard key={m.id} m={m} look={look} onSelect={onSelect} />)}
          </div>
        </>
      )}
      {bundle.correlationGroups.length > 0 && (
        <>
          <div className="content-head" style={{ marginTop: bundle.matches.length ? 30 : 0 }}>
            <div className="t">Correlated-evidence groups</div>
          </div>
          <p className="note" style={{ margin: "-12px 0 16px" }}>
            These claims share an origin and are not independent. Toggle “Don't double-count correlated evidence” in the Evidence panel to discount them.
          </p>
          <div className="task-list">
            {bundle.correlationGroups.map((g) => (
              <div className="task-card" key={g.id}>
                <span className="mark"><MarkCircle kind="neutral" /></span>
                <div className="main">
                  <div className="title">{g.rationale}</div>
                  <div className="foot">
                    <Badge tone="amber">{g.sharedOrigin}</Badge>
                    <Badge tone="neutral">{g.members.length} claims</Badge>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function MatchCard({ m, look, onSelect }: { m: Match; look: Look; onSelect: (id: string) => void }) {
  const tone = m.type === "contradicts" ? "pink" : m.type.startsWith("equiv") || m.type === "possibly-equivalent" ? "green" : "neutral";
  return (
    <div className="task-card">
      <span className="mark"><MarkCircle kind={tone === "pink" ? "pink" : tone === "green" ? "green" : "neutral"} /></span>
      <div className="main">
        <div className="title">{m.rationale}</div>
        <div className="desc">
          <a className="premise-link" onClick={() => onSelect(m.from)}>{truncate(look.claims.get(m.from)?.statement ?? m.from, 44)}</a>
          {"  ↔  "}
          <a className="premise-link" onClick={() => onSelect(m.to)}>{truncate(look.claims.get(m.to)?.statement ?? m.to, 44)}</a>
        </div>
        <div className="foot"><Badge tone={tone}>{m.type}</Badge></div>
      </div>
    </div>
  );
}

export function QuarantineTab({ bundle }: { bundle: Bundle }) {
  return (
    <>
      <div className="content-head"><div className="t">Quarantine — refused for lack of a verbatim source</div></div>
      <div className="task-list">
        {bundle.quarantine.map((q) => (
          <div className="task-card done" key={q.id}>
            <span className="mark"><MarkCircle kind="open" /></span>
            <div className="main">
              <div className="title">{q.statement}</div>
              {q.attemptedPassageText && <div className="desc">attempted quote: “{truncate(q.attemptedPassageText, 90)}”</div>}
              <div className="foot"><Badge tone="neutral">{q.reason}</Badge></div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
