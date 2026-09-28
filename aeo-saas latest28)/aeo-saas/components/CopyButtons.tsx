"use client";
import { useState } from "react";
import type { SavedRow } from "./ResultTable";

export default function CopyButtons({ rows, content }: { rows: SavedRow[]; content: string }) {
  const [done, setDone] = useState("");
  async function copy(kind: "table" | "text") {
    try {
      if (kind === "text") await navigator.clipboard.writeText(content);
      else {
        const head = ["#", "Old Content Line Text", "AEO Key", "Sources", "Proposed Content Line Text"];
        const data = rows.map((r) => [r.label, r.text, r.keys.map((k) => k.key).join(", ") || "—", [...new Set(r.keys.flatMap((k) => k.sources))].join(", ") || "—", r.proposed]);
        await navigator.clipboard.writeText([head, ...data].map((c) => c.map((x) => String(x).replace(/[\t\n]/g, " ")).join("\t")).join("\n"));
      }
      setDone(kind); setTimeout(() => setDone(""), 1500);
    } catch { setDone("fail"); }
  }
  return (
    <span className="copybtns">
      <button type="button" className="small" onClick={() => copy("table")}>{done === "table" ? "Copied" : "Copy table"}</button>
      <button type="button" className="small" onClick={() => copy("text")}>{done === "text" ? "Copied" : "Copy optimised text"}</button>
    </span>
  );
}
