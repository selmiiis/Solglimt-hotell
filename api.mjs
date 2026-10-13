// Solglimt Hotel – hotellkatalog og besøksbok (Netlify Function + Netlify Blobs)
// Lagrer bare det spillerne selv velger å legge ut: navn, figur og et øyeblikksbilde av hotellet.
import { getStore } from "@netlify/blobs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...CORS } });

// Enkel navnesjekk – spillet er for alle aldre.
const BLOCK = ["fuck","shit","bitch","dick","cunt","nigg","fitte","faen","helvete","jævl","jaevl","kuk","pikk","hore","dritt","rasshøl","rassh","homo","neger","sex","porn","nazi","hitler","drep","kill"];
function cleanName(s) {
  s = String(s || "").normalize("NFC").replace(/[^\p{L}\p{N} \-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 16);
  const low = s.toLowerCase().replace(/[\s\-]/g, "").replace(/0/g, "o").replace(/1/g, "i").replace(/3/g, "e").replace(/4/g, "a").replace(/5/g, "s");
  if (s.length < 2 || BLOCK.some((w) => low.includes(w))) return null;
  return s;
}
const validId = (id) => typeof id === "string" && /^[a-z0-9]{6,12}$/.test(id);
async function sha(s) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
const GIFTS = ["blomst","kake","maleri","plante","bamse","lykt"];
const today = () => new Date().toISOString().slice(0, 10);
const weekKey = () => Math.floor((Date.now() / 86400000 + 3) / 7); // uker som starter mandag
const LOOK_KEYS = ["skin","hair","style","shirt","acc","bg","stache"];
const cleanLook = (l) => {
  const o = {};
  if (l && typeof l === "object") for (const k of LOOK_KEYS) if (l[k] != null) o[k] = k === "stache" ? !!l[k] : String(l[k]).slice(0, 16).replace(/[^#a-z0-9]/gi, "");
  return o;
};

export default async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const url = new URL(req.url);
  const action = url.pathname.replace(/^.*\/api\/?/, "").split("/")[0];
  const hotels = getStore("hotels");
  const greets = getStore("greetings");
  const saves = getStore("saves");
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};

  try {
    if (action === "ping") return json({ ok: true });

    if (action === "publish" && req.method === "POST") {
      const { id, secret, snap } = body;
      if (!validId(id) || typeof secret !== "string" || secret.length < 10 || !snap || snap.id !== id) return json({ error: "bad" }, 400);
      const name = cleanName(snap.n);
      if (!name) return json({ error: "name" }, 400);
      const raw = JSON.stringify(snap);
      if (raw.length > 60000) return json({ error: "big" }, 400);
      const old = await hotels.get("h/" + id, { type: "json" });
      const hash = await sha(secret);
      if (old && old.hash !== hash) return json({ error: "owner" }, 403);
      const clean = { ...snap, n: name, l: cleanLook(snap.l) };
      await hotels.setJSON("h/" + id, { hash, snap: clean, upd: Date.now(), reports: old ? old.reports || 0 : 0, hearts: old ? old.hearts || 0 : 0, hb: old ? old.hb || {} : {} });
      const index = (await hotels.get("index", { type: "json" })) || [];
      const entry = { id, n: name, l: clean.l, st: Math.max(1, Math.min(10, +snap.st || 1)), upd: Date.now(), hearts: old ? old.hearts || 0 : 0 };
      const next = [entry, ...index.filter((h) => h.id !== id)].slice(0, 3000);
      await hotels.setJSON("index", next);
      return json({ ok: true, name });
    }

    if (action === "unpublish" && req.method === "POST") {
      const { id, secret } = body;
      if (!validId(id)) return json({ error: "bad" }, 400);
      const old = await hotels.get("h/" + id, { type: "json" });
      if (old && old.hash !== (await sha(String(secret || "")))) return json({ error: "owner" }, 403);
      await hotels.delete("h/" + id);
      const index = (await hotels.get("index", { type: "json" })) || [];
      await hotels.setJSON("index", index.filter((h) => h.id !== id));
      return json({ ok: true });
    }

    if (action === "search") {
      const q = (url.searchParams.get("q") || "").toLowerCase().trim().slice(0, 20);
      const index = (await hotels.get("index", { type: "json" })) || [];
      const hidden = (await hotels.get("hidden", { type: "json" })) || [];
      let list = index.filter((h) => !hidden.includes(h.id));
      if (q) list = list.filter((h) => h.n.toLowerCase().includes(q));
      return json({ hotels: list.slice(0, 24).map(({ id, n, l, st, hearts }) => ({ id, n, l, st, hearts: hearts || 0 })) });
    }

    if (action === "top") {
      const index = (await hotels.get("index", { type: "json" })) || [];
      const hidden = (await hotels.get("hidden", { type: "json" })) || [];
      const list = index.filter((h) => !hidden.includes(h.id) && (h.hearts || 0) > 0).sort((a, b) => (b.hearts || 0) - (a.hearts || 0));
      const wk = weekKey();
      const wl = index.filter((h) => !hidden.includes(h.id) && h.wkw === wk && h.wkn > 0).sort((a, b) => b.wkn - a.wkn)[0];
      return json({ hotels: list.slice(0, 10).map(({ id, n, l, st, hearts }) => ({ id, n, l, st, hearts: hearts || 0 })), week: wl ? { id: wl.id, n: wl.n, l: wl.l, wkn: wl.wkn } : null });
    }

    if (action === "hotel") {
      const id = url.searchParams.get("id");
      if (!validId(id)) return json({ error: "bad" }, 400);
      const h = await hotels.get("h/" + id, { type: "json" });
      const hidden = (await hotels.get("hidden", { type: "json" })) || [];
      if (!h || hidden.includes(id)) return json({ error: "missing" }, 404);
      return json({ snap: h.snap, hearts: h.hearts || 0 });
    }

    if (action === "greet" && req.method === "POST") {
      const { to, fn, fl, m, t, fid, gift } = body;
      if (!validId(to) || typeof m !== "number" || m < 0 || m > 30) return json({ error: "bad" }, 400);
      if (gift != null && !GIFTS.includes(gift)) return json({ error: "bad" }, 400);
      const exists = await hotels.get("h/" + to, { type: "json" });
      if (!exists) return json({ error: "missing" }, 404);
      const list = (await greets.get("g/" + to, { type: "json" })) || [];
      if (fid && list.some((g) => g.fid === fid && !!g.gift === !!gift && Date.now() - g.t < (gift ? 20 : 1) * 60 * 60 * 1000)) return json({ ok: true, dup: true }); // én hilsen i timen og én gave i døgnet per besøkende
      list.unshift({ fn: cleanName(fn) || "En gjest", fl: cleanLook(fl), m, t: Math.min(Date.now(), +t || Date.now()), fid: validId(fid) ? fid : null, gift: gift || null });
      await greets.setJSON("g/" + to, list.slice(0, 60));
      return json({ ok: true });
    }

    if (action === "greetings") {
      const id = url.searchParams.get("id"), secret = url.searchParams.get("secret") || "";
      if (!validId(id)) return json({ error: "bad" }, 400);
      const h = await hotels.get("h/" + id, { type: "json" });
      if (!h || h.hash !== (await sha(secret))) return json({ error: "owner" }, 403);
      const list = (await greets.get("g/" + id, { type: "json" })) || [];
      return json({ hearts: h.hearts || 0, greetings: list.map(({ fn, fl, m, t, gift }) => ({ fn, fl, m, t, gift: gift || null })) });
    }

    if (action === "heart" && req.method === "POST") {
      const { to, fid } = body;
      if (!validId(to) || !validId(fid) || to === fid) return json({ error: "bad" }, 400);
      const h = await hotels.get("h/" + to, { type: "json" });
      if (!h) return json({ error: "missing" }, 404);
      const d = today(); h.hb = h.hb || {};
      if (h.hb[fid] === d) return json({ ok: true, dup: true, hearts: h.hearts || 0 });
      h.hb[fid] = d; h.hearts = (h.hearts || 0) + 1;
      const wk = weekKey(); h.wk = h.wk === wk ? h.wk : wk; h.wkn = (h.wkw === wk ? h.wkn || 0 : 0) + 1; h.wkw = wk;
      const keys = Object.keys(h.hb); if (keys.length > 400) for (const k of keys.slice(0, keys.length - 400)) delete h.hb[k];
      await hotels.setJSON("h/" + to, h);
      const index = (await hotels.get("index", { type: "json" })) || [];
      const e = index.find((x) => x.id === to); if (e) { e.hearts = h.hearts; e.wkw = h.wkw; e.wkn = h.wkn; await hotels.setJSON("index", index); }
      return json({ ok: true, hearts: h.hearts });
    }

    if (action === "cloudsave" && req.method === "POST") {
      const { id, secret, code } = body;
      if (!validId(id) || typeof secret !== "string" || secret.length < 10 || typeof code !== "string" || !/^SGH[01]\./.test(code) || code.length > 500000) return json({ error: "bad" }, 400);
      const hash = await sha(secret);
      const old = await saves.get("s/" + id, { type: "json" });
      if (old && old.hash !== hash) return json({ error: "owner" }, 403);
      await saves.setJSON("s/" + id, { hash, code, upd: Date.now() });
      return json({ ok: true });
    }

    if (action === "cloudload" && req.method === "POST") {
      const { id, secret } = body;
      if (!validId(id)) return json({ error: "bad" }, 400);
      const old = await saves.get("s/" + id, { type: "json" });
      if (!old) return json({ error: "missing" }, 404);
      if (old.hash !== (await sha(String(secret || "")))) return json({ error: "owner" }, 403);
      return json({ code: old.code, upd: old.upd });
    }

    if (action === "report" && req.method === "POST") {
      const { id } = body;
      if (!validId(id)) return json({ error: "bad" }, 400);
      const h = await hotels.get("h/" + id, { type: "json" });
      if (!h) return json({ ok: true });
      h.reports = (h.reports || 0) + 1;
      await hotels.setJSON("h/" + id, h);
      if (h.reports >= 3) {
        const hidden = (await hotels.get("hidden", { type: "json" })) || [];
        if (!hidden.includes(id)) await hotels.setJSON("hidden", [...hidden, id]);
      }
      return json({ ok: true });
    }

    return json({ error: "unknown" }, 404);
  } catch (e) {
    return json({ error: "server" }, 500);
  }
};

export const config = { path: "/api/*" };
