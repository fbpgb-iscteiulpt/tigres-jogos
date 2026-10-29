// Atualiza data.json -> links de YouTube de cada jornada dos Tigres, a partir do canal da CIF.
// Títulos no canal: "7ª Jornada | Tigres vs Olímpico" (a transmissão é publicada antes do jogo).
// Corre na GitHub Action (.github/workflows/videos.yml) ou localmente: node scripts/update-videos.mjs
import { readFileSync, writeFileSync } from "node:fs";

const CHANNEL_ID = "UCA5jtFfML-10k8Pg-YuSQqw"; // Club Internacional de Foot-Ball
const CHANNEL_URL = "https://www.youtube.com/@Club_Internacional_Foot-Ball";
const CLUBE = "Tigres";
const DATA = new URL("../data.json", import.meta.url);
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
  "Accept-Language": "pt-PT,pt;q=0.9",
  Cookie: "CONSENT=YES+1; SOCS=CAI",
};

const decode = (s) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

// 1) Feed RSS do canal (últimos ~15 vídeos, inclui transmissões agendadas)
const rssRes = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`, { headers: HEADERS });
if (!rssRes.ok) throw new Error(`Feed RSS do YouTube respondeu ${rssRes.status}`);
const rss = await rssRes.text();
const videos = [...rss.matchAll(/<entry>[\s\S]*?<\/entry>/g)].map((m) => ({
  id: (m[0].match(/<yt:videoId>([^<]+)/) || [])[1],
  titulo: decode((m[0].match(/<title>([^<]+)/) || [])[1] || ""),
  data: (m[0].match(/<published>([^<]+)/) || [])[1] || "",
}));
if (!videos.length) throw new Error("Feed RSS sem vídeos — formato mudou?");

// 2) Página /videos e /streams do canal (complemento, para apanhar vídeos mais antigos)
for (const tab of ["videos", "streams"]) {
  try {
    const html = await (await fetch(`${CHANNEL_URL}/${tab}`, { headers: HEADERS })).text();
    const m = html.match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/);
    if (!m) continue;
    const walk = (o) => {
      if (!o || typeof o !== "object") return;
      if (typeof o.videoId === "string" && o.title) {
        const t = o.title.runs?.[0]?.text || o.title.simpleText;
        if (t) videos.push({ id: o.videoId, titulo: t, data: "" });
      }
      for (const k in o) walk(o[k]);
    };
    walk(JSON.parse(m[1]));
  } catch (e) {
    console.log(`Aviso: página /${tab} não lida (${e.message}). Continua só com o RSS.`);
  }
}

// 3) Vídeos dos Tigres por número de jornada (o mais recente ganha, se houver repetidos)
const porJornada = {};
for (const v of videos) {
  const m = v.titulo.match(/^\s*(\d+)\s*[ªa]\s*Jornada\s*\|\s*(.+?)\s+vs\.?\s+(.+?)\s*$/i);
  if (!m || !v.id) continue;
  const [casa, fora] = [m[2].trim(), m[3].trim()];
  if (casa !== CLUBE && fora !== CLUBE) continue;
  const n = +m[1];
  const atual = porJornada[n];
  if (!atual || (v.data && (!atual.data || v.data > atual.data))) porJornada[n] = { ...v, adversario: casa === CLUBE ? fora : casa, casa: casa === CLUBE };
}

// 4) Aplicar ao calendário e às jornadas registadas
const data = JSON.parse(readFileSync(DATA, "utf8"));
const alteracoes = [];
for (const [n, v] of Object.entries(porJornada)) {
  const url = `https://www.youtube.com/watch?v=${v.id}`;
  const alvos = [...(data.calendario || []).filter((c) => c.numero === +n), ...(data.jornadas || []).filter((j) => j.numero === +n)];
  if (!alvos.length) { console.log(`Aviso: J${n} (${v.titulo}) não existe no calendário.`); continue; }
  const cal = (data.calendario || []).find((c) => c.numero === +n);
  if (cal && cal.adversario !== v.adversario) console.log(`Aviso: J${n} no calendário é vs ${cal.adversario}, no YouTube é vs ${v.adversario}.`);
  for (const a of alvos) {
    if (a.video !== url) { alteracoes.push(`J${n}: ${a.video || "(sem link)"} -> ${url}`); a.video = url; }
  }
}

if (!alteracoes.length) {
  console.log(`Links de vídeo sem alterações (${Object.keys(porJornada).length} jornadas dos ${CLUBE} encontradas no canal).`);
} else {
  data.meta.atualizado = new Date().toISOString();
  writeFileSync(DATA, JSON.stringify(data, null, 2), "utf8");
  console.log(`Links de vídeo atualizados:\n${[...new Set(alteracoes)].join("\n")}`);
}
