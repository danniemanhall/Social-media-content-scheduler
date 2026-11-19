import { useEffect, useState } from "react";
import { SlotDrawer } from "./components/SlotDrawer";
import { openStore, whoAmI, type Store } from "./lib/store";
import { useCalendar } from "./lib/useCalendar";
import { useMediaLibrary } from "./lib/mediaIndex";
import { BrandScreen } from "./screens/BrandScreen";
import { CalendarScreen } from "./screens/CalendarScreen";
import { MediaLibrary } from "./screens/MediaLibrary";
import { Overview } from "./screens/Overview";
import { YearScreen } from "./screens/YearScreen";
import { useEvents } from "./lib/useEvents";
import type { Slot } from "./lib/types";

type Tab = "overview" | "year" | "calendar" | "media" | "brand";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "year", label: "Year ahead" },
  { id: "calendar", label: "Calendar" },
  { id: "media", label: "Media" },
  { id: "brand", label: "Brand & ideas" },
];

function initialTab(): Tab {
  const h = location.hash.slice(1) as Tab;
  return TABS.some((t) => t.id === h) ? h : "overview";
}

export default function App() {
  const [store, setStore] = useState<Store | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    void openStore().then(setStore);
    void whoAmI().then(setEmail);
  }, []);
  if (!store) return <main><p>Loading…</p></main>;
  return <Shell store={store} email={email} />;
}

function Shell({ store, email }: { store: Store; email: string | null }) {
  const cal = useCalendar(store);
  const lib = useMediaLibrary(store);
  const ev = useEvents(store);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = (s: Slot) => setOpenId(s.id);
  const openSlot = openId ? cal.byId[openId] : undefined;

  useEffect(() => {
    history.replaceState(null, "", `#${tab}`);
  }, [tab]);

  return (
    <>
      <header className="app-header">
        <div className="brand">
          <img className="logo" src="/roopip-logo.png" alt="Roopip" width="140" height="31" />
          <span className="sub">Content calendar</span>
        </div>
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.id} aria-current={tab === t.id ? "page" : undefined} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="header-right">
          {store.mode === "device" ? (
            <span className="pill warn" title="The shared database isn't connected, so changes are saved in this browser only.">Saved on this device only</span>
          ) : (
            <span className="pill">Shared calendar</span>
          )}
          {email && <span>{email}</span>}
        </div>
      </header>
      <main>
        {cal.error && <div className="banner error">{cal.error}</div>}
        {tab === "overview" && <Overview cal={cal} events={ev.visible} onOpen={open} onYear={() => setTab("year")} />}
        {tab === "year" && <YearScreen cal={cal} ev={ev} store={store} onOpen={open} />}
        {tab === "calendar" && <CalendarScreen cal={cal} ev={ev} onOpen={open} />}
        {tab === "media" && <MediaLibrary lib={lib} />}
        {tab === "brand" && <BrandScreen ideas={cal.ideas} lib={lib} />}
      </main>
      {openSlot && <SlotDrawer slot={openSlot} cal={cal} lib={lib} events={ev.visible} onClose={() => setOpenId(null)} />}
    </>
  );
}
