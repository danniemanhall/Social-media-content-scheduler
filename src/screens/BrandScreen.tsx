import { useMemo, useState } from "react";
import { BRAND, FORMAT_LABEL, PILLARS } from "../lib/brand";
import { IDEAS } from "../lib/ideas";
import type { Format, Idea } from "../lib/types";
import { MediaFolders } from "../components/MediaFolders";
import type { MediaLibraryState } from "../lib/mediaIndex";

export function BrandScreen({ ideas: bank = IDEAS, lib }: { ideas?: Idea[]; lib?: MediaLibraryState }) {
  const builtIn = useMemo(() => new Set(IDEAS.map((i) => i.id)), []);
  const [format, setFormat] = useState<Format | "all">("all");
  const [q, setQ] = useState("");
  const ideas = useMemo(
    () =>
      bank.filter(
        (i) =>
          (format === "all" || i.format === format) &&
          (!q || `${i.title} ${i.prompt} ${i.product ?? ""} ${i.pillar}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [bank, format, q],
  );

  return (
    <div>
      <section className="section">
        <div className="section-head">
          <h2>{BRAND.tagline}</h2>
        </div>
        <p style={{ marginTop: 0 }}>{BRAND.positioning}</p>
        <div className="swatches">
          {BRAND.palette.map((c) => (
            <div className="swatch" key={c.hex}>
              <div className="c" style={{ background: c.hex }} />
              <div className="t">
                <b>{c.name}</b>
                <div style={{ color: "var(--muted)" }}>{c.hex}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section cards">
        <div className="card">
          <h3>Voice</h3>
          <ul>{BRAND.voice.map((v) => <li key={v}>{v}</li>)}</ul>
        </div>
        <div className="card">
          <h3>Content pillars</h3>
          <ul>{PILLARS.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
        <div className="card">
          <h3>Claims we can make</h3>
          <ul>{BRAND.approvedClaims.map((c) => <li key={c}>{c}</li>)}</ul>
        </div>
        <div className="card">
          <h3>Look and feel</h3>
          <p style={{ margin: "8px 0" }}>{BRAND.direction.join(" · ")}</p>
          <p style={{ margin: 0, color: "var(--muted)", fontSize: 14 }}>{BRAND.photoDirection}</p>
          <p style={{ margin: "8px 0 0", fontSize: 14 }}>
            Fonts: <span style={{ fontFamily: "Cormorant Garamond", fontSize: 18 }}>{BRAND.fonts.heading}</span> and {BRAND.fonts.body}
          </p>
        </div>
        <div className="card">
          <h3>Audience</h3>
          <p style={{ margin: "8px 0 0" }}>{BRAND.audience}</p>
          <p style={{ margin: "8px 0 0", fontSize: 14 }}>
            Products and prices: <a href={`https://docs.google.com/spreadsheets/d/${BRAND.links.productSheet}`} target="_blank" rel="noopener">product master sheet</a>
          </p>
        </div>
        {lib && <MediaFolders lib={lib} />}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Idea bank</h2>
          <span className="hint">
            {bank.length} ideas the calendar draws from
            {bank.length > IDEAS.length && `, ${bank.length - IDEAS.length} added by Claude`}
          </span>
          <span className="spacer" />
          <input type="search" placeholder="Search ideas" value={q} onChange={(e) => setQ(e.target.value)} className="btn" style={{ cursor: "text" }} />
          <div className="seg">
            {(["all", "reel", "post", "carousel", "story"] as const).map((f) => (
              <button key={f} aria-pressed={format === f} onClick={() => setFormat(f)}>
                {f === "all" ? "All" : FORMAT_LABEL[f]}
              </button>
            ))}
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="ideas">
            <thead>
              <tr><th>Idea</th><th>Format</th><th>Pillar</th><th>Product</th><th>Season</th></tr>
            </thead>
            <tbody>
              {ideas.map((i) => (
                <tr key={i.id}>
                  <td><b>{i.title}</b>{!builtIn.has(i.id) && <span className="chip" style={{ marginLeft: 6 }}>Claude</span>}<div style={{ color: "var(--muted)" }}>{i.prompt}</div></td>
                  <td>{FORMAT_LABEL[i.format]}</td>
                  <td>{i.pillar}</td>
                  <td>{i.product ?? "Any"}</td>
                  <td>{i.months?.length ? i.months.map((m) => ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m - 1]).join(", ") : "All year"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
