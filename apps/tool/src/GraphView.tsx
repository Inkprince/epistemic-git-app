import cytoscape from "cytoscape";
import type { Core, ElementDefinition } from "cytoscape";
import dagre from "cytoscape-dagre";
import type { Bundle } from "@epistemic-git/protocol";
import { useEffect, useMemo, useRef, useState } from "react";
import { pct, supportColor } from "./domain.js";
import { CheckIcon, PlusIcon } from "./components/icons.js";

let registered = false;
function ensureRegistered() {
  if (!registered) { cytoscape.use(dagre); registered = true; }
}

const EDGE_COLOR = (type: string): string =>
  type === "rebuts" || type === "contradicts" ? "#db2777"
  : type === "undercuts" ? "#d4a708"
  : type === "presupposes" ? "#a3a3a3"
  : "#16a34a";

const NODE_FONT = "Public Sans, system-ui, sans-serif";
const MAX_LABEL = 150;

/** Estimate a node box that fits its wrapped label — no more clipped/ellipsised statements. */
function nodeBox(label: string, conclusion: boolean): { w: number; h: number } {
  const w = conclusion ? 230 : 200;
  const charsPerLine = conclusion ? 36 : 33;
  const lines = Math.max(1, Math.min(6, Math.ceil(label.length / charsPerLine)));
  return { w, h: 22 + lines * 13.5 };
}

interface Popup {
  id: string;
  kind: "claim" | "inference";
  x: number;
  y: number;
  below: boolean;
}

/**
 * The argument as a directed graph: claims are white cards bordered by their live support colour
 * (red → amber → green), inferences are edges (green support, pink rebuttal, dashed amber
 * undercut). Dagre DAG layout with the conclusion on top. Nodes re-colour in place as the
 * perspective or distrust set changes. Tapping a node or edge opens a detail popover with
 * quick actions; "Full provenance" jumps to the Inspect panel.
 */
export function GraphView({
  bundle, support, selected, distrust, onSelect, onInspect, onToggleDistrust,
}: {
  bundle: Bundle;
  support: ReadonlyMap<string, number>;
  selected: string;
  distrust: string[];
  onSelect: (id: string) => void;
  onInspect?: (id: string) => void;
  onToggleDistrust?: (id: string) => void;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);
  const [popup, setPopup] = useState<Popup | null>(null);

  const claimsById = useMemo(() => new Map(bundle.claims.map((c) => [c.id, c])), [bundle]);
  const infsById = useMemo(() => new Map(bundle.inferences.map((i) => [i.id, i])), [bundle]);

  // Build (or rebuild) the graph when the bundle changes.
  useEffect(() => {
    ensureRegistered();
    if (!boxRef.current) return;
    setPopup(null);

    const conclusionIds = new Set(bundle.inferences.map((i) => i.conclusion));
    const elements: ElementDefinition[] = [];
    for (const c of bundle.claims) {
      const isConclusion = c.derived || conclusionIds.has(c.id);
      const label = c.statement.length > MAX_LABEL ? c.statement.slice(0, MAX_LABEL - 1) + "…" : c.statement;
      const { w, h } = nodeBox(label, isConclusion);
      elements.push({
        data: {
          id: c.id, label, w, h,
          color: supportColor(support.get(c.id) ?? 0.5),
          role: isConclusion ? "conclusion" : "claim",
        },
      });
    }
    for (const inf of bundle.inferences) {
      inf.premises.forEach((p, idx) => {
        elements.push({
          data: { id: `${inf.id}__${idx}`, source: p, target: inf.conclusion, infId: inf.id, itype: inf.type },
        });
      });
    }

    const cy = cytoscape({
      container: boxRef.current,
      elements,
      style: [
        {
          selector: "node",
          style: {
            label: "data(label)",
            "text-wrap": "wrap",
            "text-max-width": "180px",
            "font-size": "10.5px",
            "font-family": NODE_FONT,
            "line-height": 1.25,
            color: "#171717",
            "text-valign": "center",
            "text-halign": "center",
            shape: "round-rectangle",
            "corner-radius": "10px",
            width: "data(w)",
            height: "data(h)",
            "background-color": "#ffffff",
            "border-width": 2.5,
            "border-color": "data(color)",
          },
        },
        {
          selector: 'node[role = "conclusion"]',
          style: {
            "background-color": "#171717",
            color: "#ffffff",
            "font-size": "11px",
            "font-weight": "bold",
            "text-max-width": "210px",
            "border-width": 3,
          },
        },
        {
          selector: "node.sel",
          style: {
            "underlay-color": "#171717",
            "underlay-opacity": 0.08,
            "underlay-padding": 6,
            "border-width": 3.5,
          },
        },
        { selector: "node.distrusted", style: { opacity: 0.32, "border-style": "dashed" } },
        {
          selector: "edge",
          style: {
            width: 1.8,
            "line-color": "data(color)",
            "target-arrow-color": "data(color)",
            "target-arrow-shape": "triangle",
            "arrow-scale": 0.85,
            "curve-style": "bezier",
            opacity: 0.85,
          },
        },
        { selector: 'edge[itype = "undercuts"]', style: { "line-style": "dashed" } },
        { selector: 'edge[itype = "presupposes"]', style: { "line-style": "dotted" } },
      ],
      layout: { name: "dagre", rankDir: "BT", nodeSep: 22, rankSep: 64 } as cytoscape.LayoutOptions,
      minZoom: 0.2,
      maxZoom: 2.5,
      wheelSensitivity: 0.2,
    });

    cy.edges().forEach((e) => { e.data("color", EDGE_COLOR(e.data("itype") as string)); });

    const showPopup = (id: string, kind: "claim" | "inference", rx: number, ry: number, nodeH = 0) => {
      const box = boxRef.current;
      if (!box) return;
      const cw = box.clientWidth;
      const ch = box.clientHeight;
      const below = ry + nodeH / 2 + 190 < ch || ry < ch / 2;
      setPopup({
        id, kind,
        x: Math.min(Math.max(rx - 140, 10), Math.max(10, cw - 300)),
        y: below ? Math.min(ry + nodeH / 2 + 10, ch - 60) : Math.max(10, ry - nodeH / 2 - 10),
        below,
      });
    };
    cy.on("tap", "node", (evt) => {
      const n = evt.target;
      onSelect(n.id());
      const rp = n.renderedPosition();
      showPopup(n.id(), "claim", rp.x, rp.y, n.renderedHeight());
    });
    cy.on("tap", "edge", (evt) => {
      const infId = evt.target.data("infId") as string;
      onSelect(infId);
      const rp = evt.renderedPosition ?? { x: 40, y: 40 };
      showPopup(infId, "inference", rp.x, rp.y);
    });
    cy.on("tap", (evt) => { if (evt.target === cy) setPopup(null); });
    cy.on("viewport", () => setPopup(null));

    cyRef.current = cy;
    return () => { cy.destroy(); cyRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle]);

  // Recolour / re-mark without relayout when support, selection, or distrust change.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const distrustSet = new Set(distrust);
    cy.batch(() => {
      cy.nodes().forEach((n) => {
        n.data("color", supportColor(distrustSet.has(n.id()) ? 0 : support.get(n.id()) ?? 0.5));
        n.toggleClass("sel", n.id() === selected);
        n.toggleClass("distrusted", distrustSet.has(n.id()));
      });
    });
  }, [support, selected, distrust]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPopup(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const popupClaim = popup?.kind === "claim" ? claimsById.get(popup.id) : undefined;
  const popupInf = popup?.kind === "inference" ? infsById.get(popup.id) : undefined;

  return (
    <div className="graph-wrap">
      <div
        ref={boxRef}
        className="graph-box"
        role="group"
        aria-label="Interactive argument graph: claims as cards coloured by support, inferences as edges. Click a node or edge for details."
      />
      <div className="graph-controls">
        <button aria-label="Zoom in" onClick={() => cyRef.current?.zoom({ level: cyRef.current.zoom() * 1.25, renderedPosition: center(boxRef.current) })}>
          <PlusIcon size={14} />
        </button>
        <button aria-label="Zoom out" onClick={() => cyRef.current?.zoom({ level: cyRef.current.zoom() / 1.25, renderedPosition: center(boxRef.current) })}>
          <span style={{ display: "block", width: 10, height: 2, background: "currentColor", borderRadius: 1 }} />
        </button>
        <button aria-label="Fit graph" onClick={() => cyRef.current?.animate({ fit: { eles: cyRef.current.elements(), padding: 28 }, duration: 180 })}>
          <span style={{ fontSize: 10, fontWeight: 700 }}>FIT</span>
        </button>
      </div>

      {popup && (popupClaim || popupInf) && (
        <div
          className="graph-popup"
          style={{ left: popup.x, top: popup.y, transform: popup.below ? undefined : "translateY(-100%)" }}
          role="dialog"
        >
          {popupClaim && (
            <>
              <div className="gp-title">{popupClaim.statement}</div>
              <div className="gp-meta">
                <span className="badge green" style={{ background: "transparent", padding: 0, color: supportColor(distrust.includes(popupClaim.id) ? 0 : support.get(popupClaim.id) ?? 0.5) }}>
                  ● {pct(distrust.includes(popupClaim.id) ? 0 : support.get(popupClaim.id) ?? 0)} support
                </span>
                <span className="chip">{popupClaim.claimType}</span>
                {popupClaim.derived && <span className="chip">derived</span>}
                {distrust.includes(popupClaim.id) && <span className="chip" style={{ color: "var(--pink)" }}>distrusted</span>}
              </div>
              <div className="gp-actions">
                {onToggleDistrust && !popupClaim.derived && (
                  <button className="chip-btn" onClick={() => onToggleDistrust(popupClaim.id)}>
                    {distrust.includes(popupClaim.id) ? <><CheckIcon size={13} /> Trust again</> : "Distrust"}
                  </button>
                )}
                <button className="chip-btn" onClick={() => { setPopup(null); (onInspect ?? onSelect)(popup.id); }}>
                  Full provenance →
                </button>
              </div>
            </>
          )}
          {popupInf && (
            <>
              <div className="gp-title">Inference — {popupInf.type}</div>
              <div className="gp-desc">{popupInf.warrant}</div>
              <div className="gp-meta">
                <span className="chip">strength: {popupInf.strength}</span>
                <span className="chip">{popupInf.premises.length} premise{popupInf.premises.length === 1 ? "" : "s"}</span>
              </div>
              <div className="gp-actions">
                <button className="chip-btn" onClick={() => { setPopup(null); (onInspect ?? onSelect)(popup.id); }}>
                  Full details →
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const center = (el: HTMLDivElement | null) =>
  el ? { x: el.clientWidth / 2, y: el.clientHeight / 2 } : { x: 0, y: 0 };
