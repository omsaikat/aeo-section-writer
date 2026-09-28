import { Fragment } from "react";

type KeyRef = { key: string; sources: string[] };
export type SavedRow = { id: number; type: "heading" | "text"; label: string; text: string; proposed: string; changed: boolean; keys: KeyRef[] };

const SHORT: Record<string, string> = { "Google AIO": "AIO" };
const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function Marked({ text, keys }: { text: string; keys: string[] }) {
  const parts = keys.filter((k) => k.length > 1).sort((a, b) => b.length - a.length);
  if (!parts.length) return <>{text}</>;
  const re = new RegExp(`(${parts.map(reEsc).join("|")})`, "gi");
  return <>{text.split(re).map((p, i) => parts.some((k) => k.toLowerCase() === p.toLowerCase()) ? <mark key={i}>{p}</mark> : <Fragment key={i}>{p}</Fragment>)}</>;
}

/** Read-only version of the proposal table, used on the history pages. */
export default function ResultTable({ rows }: { rows: SavedRow[] }) {
  return (
    <div className="rt-wrap">
      <table className="rt">
        <colgroup><col className="n" /><col /><col className="k" /><col /></colgroup>
        <thead><tr><th>#</th><th>Old content line</th><th className="c">AEO key</th><th>Proposed content line</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={`${r.type === "heading" ? "hrow " : ""}${r.changed ? "chg" : "same"}`}>
              <td className="n">{r.label}</td>
              <td data-label="Old content line">{r.text}</td>
              <td className="key" data-label="AEO key">
                {r.changed && r.keys.length ? r.keys.map((k) => (
                  <div key={k.key} className="keyline">
                    <span className="kchip">{k.key}</span>
                    <span className="srcs">{k.sources.map((s) => <span key={s} className={`src ${s === "Query analysis" ? "weak" : ""}`}>{SHORT[s] ?? s}</span>)}</span>
                  </div>
                )) : <span className="dash">—</span>}
              </td>
              <td className="prop" data-label="Proposed content line">{r.changed ? <Marked text={r.proposed} keys={r.keys.map((k) => k.key)} /> : r.proposed}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
