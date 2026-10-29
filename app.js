/* ============================================================
   Tigres — Análise de Jogos
   App 100% no browser. Lê data.json; escreve via GitHub API.
   ============================================================ */

/* ---------- CONFIG: preenche depois de criares o repositório ---------- */
const CONFIG = {
  // Ex: "franciscobranco"  (o teu utilizador GitHub)
  githubOwner: "fbpgb-iscteiulpt",
  // Ex: "tigres-jogos"     (nome do repositório)
  githubRepo: "tigres-jogos",
  // Ramo (normalmente "main")
  githubBranch: "main",
  // Caminho do ficheiro de dados dentro do repo
  dataPath: "data.json",
};
/* --------------------------------------------------------------------- */

const state = {
  data: null,
  view: "epoca",
  source: "local", // 'github' | 'local' | 'seed'
};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k === "html") n.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) n.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid == null) continue;
    n.append(kid.nodeType ? kid : document.createTextNode(kid));
  }
  return n;
};
const fmt = (n) => (n === null || n === undefined || n === "" ? "–" : n);
const pct = (n) => (n === null || n === undefined ? "–" : Math.round(n * 100) + "%");

/* ---------- Logos das equipas ---------- */
const LOGO_OVERRIDES = { "Milionários": "mfc" };
function teamSlug(name) {
  if (LOGO_OVERRIDES[name]) return LOGO_OVERRIDES[name];
  return (name || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // tira acentos
    .replace(/[^a-z0-9]/g, "");
}
function initials(name) {
  const parts = (name || "").trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}
// Devolve um elemento com o logo (ou emblema com iniciais se a imagem falhar)
function teamLogo(name, big = false) {
  const wrap = el("span");
  const img = el("img", { class: "team-logo" + (big ? " lg" : ""), src: `logos/${teamSlug(name)}.png`, alt: name });
  img.addEventListener("error", () => {
    const fb = el("span", { class: "team-fallback" + (big ? " lg" : ""), title: name }, initials(name));
    img.replaceWith(fb);
  });
  wrap.append(img);
  return wrap;
}
// Elemento "logo + nome"
function teamTag(name, big = false) {
  return el("span", { class: "team" }, teamLogo(name, big), el("span", {}, name));
}

/* ---------- Cores das equipas (para as barras de estatísticas) ---------- */
const TEAM_COLORS = {
  "Tigres": "#1b2f6b",       // azul do logo
  "Purrianos": "#e0392a",    // vermelho
  "CDUL": "#ffffff",         // branco
  "Briosa": "#ffffff",       // branco
  "Pé Leve": "#ffffff",      // branco
  "Incríveis": "#e8b12b",    // amarelo
  "Madeira": "#c98a0f",      // amarelo torrado
  "Olímpico": "#1a1a1a",     // preto
  "AQA": "#2e336c",          // azul (branco vs Tigres)
  "VDR": "#194a92",          // azul (branco vs Tigres)
  "Milionários": "#c0a040",  // dourado
  "Canarinhos": "#e0b400",   // amarelo
  "Cosmos": "#c0201f",       // vermelho
  "SD76": "#834a86",         // roxo
  "Vips": "#ffffff",         // branco
  "Laranjada": "#e07a1a",    // laranja
  "Madeirinha": "#1f8a44",   // verde
  "Leões": "#1f8a5a",        // verde
};
// Equipas azuis que ficam brancas quando jogam contra os Tigres (para não confundir)
const WHITE_VS_TIGRES = new Set(["AQA", "VDR"]);
function teamColor(name, vsTigres = false) {
  if (vsTigres && WHITE_VS_TIGRES.has(name)) return "#ffffff";
  return TEAM_COLORS[name] || "#9fb2cf";
}
function isWhite(c) { c = c.toLowerCase(); return c === "#fff" || c === "#ffffff"; }
function fillStyle(widthPct, color) {
  const outline = isWhite(color) ? ";box-shadow:inset 0 0 0 1px var(--navy)" : "";
  return `width:${widthPct}%;background:${color}${outline}`;
}

/* ================= PERSISTENCE ================= */
const ghConfigured = () => CONFIG.githubOwner && CONFIG.githubRepo;
const rawUrl = () =>
  `https://raw.githubusercontent.com/${CONFIG.githubOwner}/${CONFIG.githubRepo}/${CONFIG.githubBranch}/${CONFIG.dataPath}?t=${Date.now()}`;
const apiUrl = () =>
  `https://api.github.com/repos/${CONFIG.githubOwner}/${CONFIG.githubRepo}/contents/${CONFIG.dataPath}`;

const getToken = () => localStorage.getItem("tigres_gh_token") || "";
const setToken = (t) => localStorage.setItem("tigres_gh_token", t);

async function loadData() {
  // 1) tenta a API do GitHub (sempre fresca, sem cache de CDN) para a versão partilhada
  if (ghConfigured()) {
    try {
      const token = getToken();
      const headers = { Accept: "application/vnd.github+json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      const r = await fetch(apiUrl() + "?ref=" + CONFIG.githubBranch + "&t=" + Date.now(), { cache: "no-store", headers });
      if (r.ok) {
        const payload = await r.json();
        const d = JSON.parse(b64decode(payload.content));
        state.source = "github";
        localStorage.setItem("tigres_cache", JSON.stringify(d));
        return d;
      }
    } catch (e) { /* API falhou — tenta raw */ }
    // 1b) fallback: raw público (pode estar em cache de CDN ~5 min)
    try {
      const r = await fetch(rawUrl(), { cache: "no-store" });
      if (r.ok) {
        const d = await r.json();
        state.source = "github";
        localStorage.setItem("tigres_cache", JSON.stringify(d));
        return d;
      }
    } catch (e) { /* offline / ainda não existe */ }
  }
  // 2) cache local (última versão vista)
  const cached = localStorage.getItem("tigres_cache");
  if (cached) { state.source = "local"; return JSON.parse(cached); }
  // 3) seed que veio no repositório
  const r = await fetch("data.json", { cache: "no-store" });
  state.source = ghConfigured() ? "local" : "seed";
  return await r.json();
}

// Guarda no GitHub (commit). Requer token com permissão Contents:write.
async function saveToGitHub(data, msg) {
  const token = getToken();
  if (!ghConfigured()) throw new Error("GitHub não configurado (edita CONFIG no app.js).");
  if (!token) throw new Error("Sem token. Abre 'Nova Jornada' → Definições e cola o teu token.");
  // obter SHA atual
  let sha;
  const head = await fetch(apiUrl() + "?ref=" + CONFIG.githubBranch, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
  });
  if (head.ok) sha = (await head.json()).sha;
  const body = {
    message: msg || "Atualizar dados Tigres",
    content: b64encode(JSON.stringify(data, null, 2)),
    branch: CONFIG.githubBranch,
    ...(sha ? { sha } : {}),
  };
  const put = await fetch(apiUrl(), {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    body: JSON.stringify(body),
  });
  if (!put.ok) {
    const err = await put.json().catch(() => ({}));
    throw new Error("Falha ao gravar no GitHub: " + (err.message || put.status));
  }
  localStorage.setItem("tigres_cache", JSON.stringify(data));
  return true;
}
function b64encode(str) {
  return btoa(unescape(encodeURIComponent(str)));
}
function b64decode(b64) {
  return decodeURIComponent(escape(atob(String(b64).replace(/\s/g, ""))));
}

// Exportar Excel (.xlsx) — ficheiro SpreadsheetML simples que o Excel abre
function exportExcel() {
  const data = state.data;
  const sheets = [];
  data.jornadas.forEach((j) => {
    const rows = [];
    rows.push(["Ação", "Jogador", "Minuto", "", "Estatística", data.meta.clube, j.adversario]);
    const statKeys = Object.keys(j.matchStats || {});
    const maxLen = Math.max(j.eventos.length, j.players.length, statKeys.length);
    // Cabeçalho jogadores
    const pHead = ["", "", "", "", "", "", "", "", "Convocado", "Titular", "Minutos", "Remates", "Desarmes", "Defesas", "Golos", "Assist.", "Passe fin.", "Faltas", "Passes err.", "Perdas", "Dribles OK", "Dribles falh.", "Cruz. OK", "Cruz. falh."];
    rows.push(pHead);
    for (let i = 0; i < maxLen; i++) {
      const ev = j.eventos[i] || {};
      const st = statKeys[i] ? [statKeys[i], j.matchStats[statKeys[i]].tigres, j.matchStats[statKeys[i]].adversario] : ["", "", ""];
      const p = j.players[i];
      const prow = p ? [p.nome, p.titular ? "X" : "", p.minutos, p.remates, p.desarmes, p.defesas, p.golos, p.assistencias, p.passeFinalizacao, p.faltas, p.passesErrados, p.perdasBola, p.driblesBemSucedidos, p.driblesFalhados, p.cruzamentosBemSucedidos, p.cruzamentosFalhados] : [];
      rows.push([ev.acao || "", ev.jogador || "", ev.minuto ?? "", "", st[0], st[1], st[2], "", ...prow]);
    }
    sheets.push({ name: `${j.numero}a Jornada`, rows });
  });
  const xml = buildSpreadsheetML(sheets);
  const blob = new Blob([xml], { type: "application/vnd.ms-excel" });
  const a = el("a", { href: URL.createObjectURL(blob), download: "AnaliseJogos_Tigres.xls" });
  document.body.append(a); a.click(); a.remove();
}
function buildSpreadsheetML(sheets) {
  const esc = (v) => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const cell = (v) => {
    if (v === "" || v === null || v === undefined) return "<Cell/>";
    const isNum = typeof v === "number";
    return `<Cell><Data ss:Type="${isNum ? "Number" : "String"}">${esc(v)}</Data></Cell>`;
  };
  const body = sheets.map((s) =>
    `<Worksheet ss:Name="${esc(s.name)}"><Table>` +
    s.rows.map((r) => `<Row>${r.map(cell).join("")}</Row>`).join("") +
    `</Table></Worksheet>`
  ).join("");
  return `<?xml version="1.0"?>\n<?mso-application progid="Excel.Sheet"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">${body}</Workbook>`;
}

/* ================= AGGREGATIONS ================= */
function resultOf(j) {
  const r = j.matchStats?.Resultado;
  if (!r || r.tigres == null || r.adversario == null) return { gf: null, ga: null, res: "?" };
  const gf = +r.tigres, ga = +r.adversario;
  return { gf, ga, res: gf > ga ? "w" : gf < ga ? "l" : "d" };
}
function seasonAgg(data) {
  const out = {
    jogos: data.jornadas.length, v: 0, e: 0, d: 0, gf: 0, ga: 0,
    players: {}, results: [],
  };
  for (const j of data.jornadas) {
    const { gf, ga, res } = resultOf(j);
    if (res === "w") out.v++; else if (res === "d") out.e++; else if (res === "l") out.d++;
    if (gf != null) { out.gf += gf; out.ga += ga; }
    out.results.push({ numero: j.numero, adversario: j.adversario, gf, ga, res });
    for (const p of j.players) {
      const a = (out.players[p.nome] ||= { nome: p.nome, jogos: 0, titular: 0, minutos: 0, golos: 0, assistencias: 0, remates: 0, desarmes: 0, defesas: 0, passeFinalizacao: 0, faltas: 0, passesErrados: 0, perdasBola: 0, driblesBemSucedidos: 0, driblesFalhados: 0, cruzamentosBemSucedidos: 0, cruzamentosFalhados: 0 });
      a.jogos++; if (p.titular) a.titular++;
      for (const k of ["minutos", "golos", "assistencias", "remates", "desarmes", "defesas", "passeFinalizacao", "faltas", "passesErrados", "perdasBola", "driblesBemSucedidos", "driblesFalhados", "cruzamentosBemSucedidos", "cruzamentosFalhados"]) a[k] += (+p[k] || 0);
    }
  }
  out.playersArr = Object.values(out.players);
  return out;
}

/* Prémios por jogo ("kings") — médias por jogo com base nas participações */
function computeKings(data) {
  const P = {};
  for (const j of data.jornadas) {
    for (const p of j.players) (P[p.nome] ||= []).push(p);
  }
  const players = Object.entries(P).map(([nome, games]) => ({ nome, games }));
  const jogou = (g) => (+g.minutos || 0) > 0;       // participou
  // Ranking de contagem com dois separadores:
  //  - total: soma na época
  //  - p80:   soma ÷ minutos jogados na época × 80
  function rankingDual(metric, dir, filter) {
    const total = [], p80 = [];
    for (const pl of players) {
      const gs = pl.games.filter(filter);
      if (!gs.length) continue;
      const soma = gs.reduce((s, g) => s + (+g[metric] || 0), 0);
      total.push({ nome: pl.nome, avg: soma, total: soma, jogos: gs.length });
      const min = gs.reduce((s, g) => s + (+g.minutos || 0), 0);
      if (min > 0) p80.push({ nome: pl.nome, avg: (soma / min) * 80, min, jogos: gs.length, insuf: min < P80_MIN_EPOCA });
    }
    const ord = (k) => (a, b) => (dir === "max" ? b[k] - a[k] : a[k] - b[k]) || a.nome.localeCompare(b.nome);
    total.sort(ord("total"));
    // por 80 min: quem tem minutos suficientes primeiro (ordenado); os restantes no fim, por minutos
    p80.sort((a, b) => (a.insuf - b.insuf) || (a.insuf ? b.min - a.min || a.nome.localeCompare(b.nome) : ord("avg")(a, b)));
    return { total, p80 }; // listas completas (o cartão mostra o top 3; o popup mostra tudo)
  }
  // Ranking por rácio: soma de "num" a dividir pela soma de (num+den) em todos os jogos.
  // Só conta jogadores com pelo menos 1 tentativa (num+den > 0).
  function rankingRatio(numKey, denKey, dir) {
    const rows = players.map((pl) => {
      const bem = pl.games.reduce((s, g) => s + (+g[numKey] || 0), 0);
      const fal = pl.games.reduce((s, g) => s + (+g[denKey] || 0), 0);
      const tent = bem + fal;
      if (tent <= 0) return null;
      return { nome: pl.nome, avg: bem / tent, bem, tent };
    }).filter(Boolean);
    rows.sort((a, b) => dir === "max" ? b.avg - a.avg || b.tent - a.tent || a.nome.localeCompare(b.nome) : a.avg - b.avg || b.tent - a.tent || a.nome.localeCompare(b.nome));
    return rows; // lista completa (o cartão mostra o top 3; o popup mostra tudo)
  }
  // Precisão de remate: remates à baliza (dos eventos) ÷ remates totais (stat).
  // Só conta jogadores com pelo menos 1 remate.
  function rankingPrecisaoRemate() {
    const onTarget = {};
    for (const j of data.jornadas) {
      for (const e of (j.eventos || [])) {
        if (TigresXG.isOwnShotOnTarget(e.acao) && e.jogador) onTarget[e.jogador] = (onTarget[e.jogador] || 0) + 1;
      }
    }
    const rows = players.map((pl) => {
      const rem = pl.games.reduce((s, g) => s + (+g.remates || 0), 0);
      if (rem <= 0) return null;
      const ab = Math.min(onTarget[pl.nome] || 0, rem);
      return { nome: pl.nome, avg: ab / rem, bem: ab, tent: rem };
    }).filter(Boolean);
    rows.sort((a, b) => b.avg - a.avg || b.tent - a.tent || a.nome.localeCompare(b.nome));
    return rows; // lista completa (o cartão mostra o top 3; o popup mostra tudo)
  }
  return {
    golos: rankingDual("golos", "max", jogou),
    assistencias: rankingDual("assistencias", "max", jogou),
    consistency: rankingDual("passesErrados", "min", jogou),
    keyPass: rankingDual("passeFinalizacao", "max", jogou),
    recovery: rankingDual("desarmes", "max", jogou),
    shooting: rankingDual("remates", "max", jogou),
    noX: rankingDual("perdasBola", "max", jogou),
    blindPasser: rankingDual("passesErrados", "max", jogou),
    foul: rankingDual("faltas", "max", jogou),
    drible: rankingDual("driblesBemSucedidos", "max", jogou),
    dribleEfficiency: rankingRatio("driblesBemSucedidos", "driblesFalhados", "max"),
    peDeTijolo: rankingRatio("driblesBemSucedidos", "driblesFalhados", "min"),
    crossing: rankingRatio("cruzamentosBemSucedidos", "cruzamentosFalhados", "max"),
    precisaoRemate: rankingPrecisaoRemate(),
  };
}

/* ================= VIEWS ================= */
let viewCleanup = null; // função de limpeza da vista atual (listeners/intervalos)
function render() {
  if (typeof viewCleanup === "function") { viewCleanup(); viewCleanup = null; }
  $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === state.view));
  const app = $("#app");
  app.innerHTML = "";
  ({ epoca: viewEpoca, jornadas: viewJornadas, classificacao: viewClassificacao, jogadores: viewJogadores, comparar: viewComparar, equipa: viewEquipa, dicas: viewDicas, posse: viewPosse, nova: viewNova }[state.view])(app);
  const s = state.source;
  $("#syncStatus").className = "status " + (s === "github" ? "ok" : s === "seed" ? "err" : "local");
  $("#syncStatus").title = s === "github" ? "Ligado ao GitHub (dados partilhados)" : s === "seed" ? "Dados iniciais (não partilhado ainda)" : "Cache local";
  $("#footerInfo").textContent = `${state.data.meta.clube} · ${state.data.jornadas.length} jornadas · atualizado ${new Date(state.data.meta.atualizado).toLocaleDateString("pt-PT")}`;
}

function viewEpoca(app) {
  const A = seasonAgg(state.data);
  app.append(el("div", { class: "section-title" }, "Resumo da época"));
  const cards = el("div", { class: "grid cards" });
  cards.append(
    statCard(`${A.v}-${A.e}-${A.d}`, "V–E–D", `${A.jogos} jogos`),
    statCard(`${A.gf}`, "Golos marcados"),
    statCard(`${A.ga}`, "Golos sofridos"),
    statCard(`${A.gf - A.ga > 0 ? "+" : ""}${A.gf - A.ga}`, "Diferença"),
  );
  app.append(cards);

  app.append(el("div", { class: "section-title" }, "Resultados"));
  const rec = el("div", { class: "record" });
  A.results.forEach((r) =>
    rec.append(el("span", { class: "pill " + (r.res === "?" ? "" : r.res) },
      `J${r.numero} vs ${r.adversario}: ${r.gf ?? "?"}-${r.ga ?? "?"}`)));
  app.append(rec);

  // Top scorers / assists
  app.append(el("div", { class: "section-title" }, "Melhores marcadores"));
  app.append(topTable(A.playersArr, "golos", ["golos", "remates"], ["Golos", "Remates"]));

  app.append(el("div", { class: "section-title" }, "Mais Assistências"));
  app.append(topTable(A.playersArr, "assistencias", ["assistencias", "passeFinalizacao"], ["Assist.", "Passe fin."]));

  // Highlights da época ("kings")
  const K = computeKings(state.data);
  app.append(el("div", { class: "section-title" }, "Highlights da Época"));
  const kings = el("div", { class: "grid kings" });
  kings.append(
    kingCard("⚽", "Golden Boot", "Mais golos", K.golos),
    kingCard("🅰️", "Assist King", "Mais assistências", K.assistencias),
    kingCard("👑", "Consistency King", "Menos passes falhados", K.consistency),
    kingCard("🎯", "Key Pass King", "Mais passes p/ finalização", K.keyPass),
    kingCard("🛡️", "Recovery King", "Mais desarmes", K.recovery),
    kingCard("🥅", "Shooting King", "Mais remates", K.shooting),
    kingCard("🎯", "Sniper — Precisão de remate", "Melhor % de remates à baliza", K.precisaoRemate, "unidade", "(remates à baliza ÷ remates)", fmtRatio),
    kingCard("🧱", 'No "X" King', "Mais perdas de bola", K.noX),
    kingCard("🙈", "The Blind Passer", "Mais passes falhados", K.blindPasser),
    kingCard("🥊", "The Foul King", "Mais faltas", K.foul),
    kingCard("⚡", "Drible King", "Mais dribles bem sucedidos", K.drible),
    kingCard("🎩", "Drible Efficiency King", "Melhor % de dribles conseguidos", K.dribleEfficiency, "unidade", "(dribles bem sucedidos ÷ efetuados)", fmtRatio),
    kingCard("🎯", "Crossing King", "Melhor % de cruzamentos conseguidos", K.crossing, "unidade", "(cruzamentos bem sucedidos ÷ efetuados)", fmtRatio),
    kingCard("🧿", "Pés de tijolo", "Pior % de dribles conseguidos", K.peDeTijolo, "unidade", "(mín. 1 drible efetuado)", fmtRatio),
  );
  app.append(kings);
  app.append(el("p", { class: "hint" }, `Total = soma na época. Por 80 min = total ÷ minutos jogados na época × 80 (só entram no ranking jogadores com pelo menos ${P80_MIN_EPOCA} min na época).`));
}

// Formatação de valor para os cartões de rácio (percentagem)
function fmtRatio(r, isLeader) {
  const p = Math.round(r.avg * 100);
  return `${p}% (${r.bem}/${r.tent})`;
}
// Formatação dos separadores dos cartões de contagem
function fmtTotal(r) { return `${r.total}`; }
function fmtP80(r, isLeader) { const v = (Math.round(r.avg * 10) / 10).toFixed(1); return isLeader ? `${v} / 80 min` : v; }
// Mínimo de minutos na época para entrar nos rankings "por 80 min"
const P80_MIN_EPOCA = 80;
const KING_TABS = [["total", "Total", fmtTotal], ["p80", "Por 80 min", fmtP80]];

// Cartão de highlight. `data` é uma lista (rácios) ou { total, p80 } (contagens, com separadores).
function kingCard(icon, title, subtitle, data, unit, note, valFmt) {
  const card = el("div", { class: "card king" });
  card.append(el("div", { class: "king-title" }, el("span", { class: "king-icon" }, icon), el("span", {}, title)));
  card.append(el("div", { class: "king-sub" }, subtitle + (note ? " " + note : "")));
  const dual = data && !Array.isArray(data);
  const body = el("div", { class: "king-body" });
  const show = (rows, fmt, tabLabel) => {
    body.innerHTML = "";
    const ranked = (rows || []).filter((r) => !r.insuf); // no cartão só entram jogadores com minutos suficientes
    if (!ranked.length) {
      body.append(el("div", { class: "empty" }, rows && rows.length ? `Ninguém tem ainda ${P80_MIN_EPOCA} min na época` : "Sem dados"));
    } else {
      const top3 = ranked.slice(0, 3);
      const leader = top3[0];
      body.append(el("div", { class: "king-leader", onclick: () => openPlayerModal(leader.nome) },
        el("span", { class: "king-name" }, leader.nome),
        el("span", { class: "king-val" }, fmt(leader, true))));
      const rest = top3.slice(1);
      if (rest.length) {
        const list = el("div", { class: "king-rest" });
        rest.forEach((r, i) => list.append(el("div", { class: "king-rest-row", onclick: () => openPlayerModal(r.nome) },
          el("span", { class: "king-rank" }, (i + 2) + "."),
          el("span", { class: "king-rname" }, r.nome),
          el("span", { class: "king-rval" }, fmt(r, false)))));
        body.append(list);
      }
    }
    if (rows && rows.length > Math.min(3, ranked.length)) {
      body.append(el("button", { class: "king-more", onclick: () => openRankingModal(icon, title, subtitle, note, rows, fmt, tabLabel) },
        `Ver lista completa (${rows.length})`));
    }
  };
  if (dual) {
    const tabs = el("div", { class: "king-tabs" });
    const btns = KING_TABS.map(([key, label, fmt]) => {
      const b = el("button", { type: "button" }, label);
      b.addEventListener("click", () => { btns.forEach((x) => x.classList.toggle("active", x === b)); show(data[key], fmt, label); });
      return b;
    });
    tabs.append(...btns);
    card.append(tabs);
    btns[0].classList.add("active");
    show(data.total, fmtTotal, KING_TABS[0][1]); // default: Total
  } else {
    show(data, valFmt || fmtTotal, null);
  }
  card.append(body);
  return card;
}

// Popup com o ranking completo de um "king"
function openRankingModal(icon, title, subtitle, note, rows, valFmt, tabLabel) {
  const b = $("#modalBody"); b.innerHTML = "";
  b.append(el("h2", {}, el("span", {}, icon), el("span", {}, title)));
  b.append(el("p", { class: "hint" }, subtitle + (tabLabel ? ` — ${tabLabel}` : "") + (note ? " " + note : "")));
  const isP80 = valFmt === fmtP80;
  const t = el("table", { class: "rank-full" });
  t.append(el("thead", {}, el("tr", {}, el("th", { class: "rank" }, "#"), el("th", {}, "Jogador"),
    el("th", { class: "num" }, isP80 ? "Por 80 min" : "Valor"), isP80 ? el("th", { class: "num" }, "Minutos") : null)));
  const tb = el("tbody");
  let pos = 0, sepFeito = false;
  rows.forEach((r) => {
    if (r.insuf && !sepFeito) {
      sepFeito = true;
      tb.append(el("tr", { class: "rank-sep" }, el("td", { colspan: isP80 ? 4 : 3 }, `Sem minutos suficientes (menos de ${P80_MIN_EPOCA} min na época) — fora do ranking`)));
    }
    if (!r.insuf) pos++;
    const tr = el("tr", { class: r.insuf ? "rank-insuf" : pos === 1 ? "rank-leader" : "" },
      el("td", { class: "rank" }, r.insuf ? "—" : pos),
      el("td", {}, r.nome),
      el("td", { class: "num" }, isP80 ? fmtP80(r, false) : valFmt(r, pos === 1)),
      isP80 ? el("td", { class: "num" }, r.min) : null);
    tr.addEventListener("click", () => openPlayerModal(r.nome));
    tb.append(tr);
  });
  t.append(tb);
  b.append(tableScroll(t));
  showModal();
}

function statCard(big, lbl, sub) {
  return el("div", { class: "card stat" },
    el("span", { class: "big" }, big),
    el("span", { class: "lbl" }, lbl),
    sub ? el("span", { class: "sub" }, sub) : null);
}

function topTable(players, sortKey, cols, colLabels, limit = 8) {
  const rows = [...players].filter((p) => (p[sortKey] || 0) > 0).sort((a, b) => b[sortKey] - a[sortKey]).slice(0, limit);
  const t = el("table");
  const head = el("tr", {}, el("th", { class: "rank" }, "#"), el("th", {}, "Jogador"));
  colLabels.forEach((c) => head.append(el("th", { class: "num" }, c)));
  t.append(el("thead", {}, head));
  const tb = el("tbody");
  if (!rows.length) tb.append(el("tr", {}, el("td", { colspan: cols.length + 2, class: "empty" }, "Sem dados ainda")));
  rows.forEach((p, i) => {
    const tr = el("tr", {}, el("td", { class: "rank" }, i + 1), el("td", {}, p.nome));
    cols.forEach((c) => tr.append(el("td", { class: "num" }, fmt(p[c]))));
    tr.addEventListener("click", () => openPlayerModal(p.nome));
    t.append(tr);
    tb.append(tr);
  });
  t.append(tb);
  return t;
}

/* Data real da jornada: o intervalo ("3 / 4 Outubro") é o fim de semana Sábado / Domingo
   (1.º número = Sábado, 2.º = Domingo). A hora indica Sexta (21:30, = Sábado − 1),
   Sábado (restantes slots) ou Domingo (11:00 / 12:40). */
const MESES_PT = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
function mesIdxPT(nome) { return MESES_PT.findIndex((x) => x.toLowerCase() === (nome || "").toLowerCase()); }
function anoDoMes(mesIdx) { return mesIdx >= 8 ? 2025 : 2026; } // Set–Dez → 2025, Jan–Jun → 2026
function dataJornada(range, hora) {
  const parts = String(range || "").split("/");
  if (parts.length < 2) return range || "";
  // 2.º número (Domingo) traz sempre o mês; o 1.º (Sábado) pode herdá-lo
  const mDom = parts[1].trim().match(/(\d{1,2})\s+([A-Za-zçÇãÃéÉíÍ]+)/);
  const mSab = parts[0].trim().match(/(\d{1,2})(?:\s+([A-Za-zçÇãÃéÉíÍ]+))?/);
  if (!mDom || !mSab) return range || "";
  const mesDom = mesIdxPT(mDom[2]);
  const mesSab = mSab[2] ? mesIdxPT(mSab[2]) : mesDom; // sem mês no 1.º → usa o do 2.º
  if (mesSab < 0 || mesDom < 0) return range || "";
  if (hora === "11:00" || hora === "12:40") {
    // Domingo — 2.º número
    return `Domingo, ${+mDom[1]} ${MESES_PT[mesDom]}`;
  }
  // Sábado — 1.º número
  const sab = new Date(anoDoMes(mesSab), mesSab, +mSab[1]);
  if (hora === "21:30") {
    // Sexta = Sábado − 1 (aritmética trata salto de mês)
    const sex = new Date(sab); sex.setDate(sex.getDate() - 1);
    return `Sexta, ${sex.getDate()} ${MESES_PT[sex.getMonth()]}`;
  }
  return `Sábado, ${sab.getDate()} ${MESES_PT[sab.getMonth()]}`;
}

function viewJornadas(app) {
  app.append(el("div", { class: "section-title" }, "Jornadas disputadas"));
  const jogadas = [...state.data.jornadas].sort((a, b) => b.numero - a.numero);
  const list = el("div", { class: "jlist" });
  if (!jogadas.length) list.append(el("div", { class: "empty" }, "Ainda sem jornadas registadas."));
  jogadas.forEach((j) => {
    const { gf, ga, res } = resultOf(j);
    const dataTxt = dataJornada(j.data, j.hora);
    const meta = [dataTxt, j.hora, j.casa === false ? "fora" : j.casa === true ? "casa" : null].filter(Boolean).join(" · ");
    const row = el("div", { class: "jrow", onclick: () => openJornadaModal(j.numero) },
      el("span", { class: "jnum" }, `Jornada ${j.numero}`, meta ? el("span", { class: "jdate" }, meta) : null),
      el("span", { class: "jteams" }, teamTag(state.data.meta.clube), el("span", { class: "vs" }, "vs"), teamTag(j.adversario)),
      el("span", { class: "jscore" }, `${gf ?? "?"}–${ga ?? "?"}`),
      el("span", { class: "badge " + (res === "?" ? "" : res) }, res === "w" ? "V" : res === "d" ? "E" : res === "l" ? "D" : "?"),
      videoLink(j.video),
    );
    list.append(row);
  });
  app.append(list);

  // Próximas jornadas (do calendário)
  const cal = state.data.calendario || [];
  const jogadasNums = new Set(state.data.jornadas.map((j) => j.numero));
  const futuras = cal.filter((f) => !jogadasNums.has(f.numero)).sort((a, b) => a.numero - b.numero);
  if (futuras.length) {
    app.append(el("div", { class: "section-title" }, "Próximas jornadas"));
    const fl = el("div", { class: "jlist" });
    futuras.forEach((f) => {
      const local = f.casa ? "casa" : "fora";
      const meta = [dataJornada(f.data, f.hora), f.hora, local].filter(Boolean).join(" · ");
      fl.append(el("div", { class: "jrow future" },
        el("span", { class: "jnum" }, `Jornada ${f.numero}`, el("span", { class: "jdate" }, meta)),
        el("span", { class: "jteams" }, teamTag(state.data.meta.clube), el("span", { class: "vs" }, "vs"), teamTag(f.adversario)),
        el("span", { class: "jscore muted" }, "–"),
        videoLink(f.video),
      ));
    });
    app.append(fl);
  }
}

/* Link para o vídeo do jogo (abre o YouTube em nova aba, sem abrir o modal) */
function videoLink(url) {
  if (!url) return null;
  return el("a", {
    class: "jvideo", href: url, target: "_blank", rel: "noopener",
    title: "Ver vídeo do jogo no YouTube",
    onclick: (e) => e.stopPropagation(),
  }, "▶ Vídeo");
}

/* Extrai o ID de 11 caracteres de um URL do YouTube (watch?v=, youtu.be/, embed/) */
function youtubeId(url) {
  if (!url) return null;
  const m = String(url).match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/);
  return m ? m[1] : null;
}
/* Caixa de vídeo embebido (responsiva, 16:9) */
function videoEmbed(url) {
  const id = youtubeId(url);
  if (!id) return null;
  const box = el("div", { class: "video-embed" });
  box.append(el("iframe", {
    src: `https://www.youtube.com/embed/${id}`,
    title: "Vídeo do jogo", frameborder: "0", allowfullscreen: "true",
    allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture",
  }));
  return box;
}

/* ================= CLASSIFICAÇÃO ================= */
function viewClassificacao(app) {
  const tabela = state.data.classificacao || [];
  app.append(el("div", { class: "section-title" }, "Classificação"));
  if (!tabela.length) { app.append(el("div", { class: "empty" }, "Sem classificação disponível.")); return; }
  const clube = state.data.meta.clube;
  const cols = [["pts", "Pts"], ["j", "J"], ["v", "V"], ["e", "E"], ["dd", "D"], ["gm", "GM"], ["gs", "GS"]];
  const t = el("table", { class: "pstat-table standings" });
  const h = el("tr", {}, el("th", { class: "rank" }, "#"), el("th", {}, "Equipa"));
  cols.forEach((c) => h.append(el("th", { class: "num" }, c[1])));
  h.append(el("th", { class: "num" }, "DIF"));
  h.append(el("th", { class: "num" }, "TD"));
  t.append(el("thead", {}, h));
  const tb = el("tbody");
  [...tabela].sort((a, b) => a.pos - b.pos).forEach((r) => {
    const isClube = r.equipa === clube;
    const tr = el("tr", isClube ? { class: "me" } : {},
      el("td", { class: "rank" }, r.pos),
      el("td", {}, teamTag(r.equipa)));
    cols.forEach((c) => tr.append(el("td", { class: "num" + (c[0] === "pts" ? " strong" : "") }, fmt(r[c[0]]))));
    const dif = (r.gm || 0) - (r.gs || 0);
    tr.append(el("td", { class: "num" }, (dif > 0 ? "+" : "") + dif));
    tr.append(el("td", { class: "num" }, fmt(r.td)));
    tb.append(tr);
  });
  t.append(tb);
  app.append(tableScroll(t));
  app.append(el("p", { class: "hint" }, "J=jogos, V=vitórias, E=empates, D=derrotas, GM=golos marcados, GS=golos sofridos, DIF=diferença de golos, TD=taça disciplina."));
}

function openJornadaModal(numero) {
  const j = state.data.jornadas.find((x) => x.numero === numero);
  const b = $("#modalBody"); b.innerHTML = "";
  const { gf, ga } = resultOf(j);
  b.append(el("h2", {},
    `Jornada ${j.numero}: `,
    teamTag(state.data.meta.clube, true),
    el("span", {}, ` ${gf ?? "?"}–${ga ?? "?"} `),
    teamTag(j.adversario, true)));
  b.append(el("div", { class: "chips" },
    j.data ? el("span", { class: "chip" }, `Data: ${dataJornada(j.data, j.hora)}${j.hora ? " · " + j.hora : ""}${j.casa === false ? " (fora)" : j.casa === true ? " (casa)" : ""}`) : null,
    el("span", { class: "chip" }, `Tática: ${fmt(j.tatica)}`),
    el("span", { class: "chip" }, `Convocados: ${j.players.length}`)));

  if (j.video) {
    b.append(el("div", { class: "section-title" }, "Vídeo do jogo"));
    b.append(videoEmbed(j.video));
  }

  // Match stats compare
  b.append(el("div", { class: "section-title" }, "Estatísticas do jogo"));
  b.append(compareBlock(j.matchStats, j.adversario, TigresXG.xgSeason(state.data).porJornada[j.numero]));

  // Player table
  b.append(el("div", { class: "section-title" }, "Jogadores"));
  const cols = [["minutos", "Min"], ["golos", "G"], ["assistencias", "A"], ["remates", "Rem"], ["desarmes", "Des"], ["defesas", "Def"], ["passeFinalizacao", "PF"], ["faltas", "Flt"], ["passesErrados", "PE"], ["perdasBola", "PB"], ["driblesBemSucedidos", "DB"], ["driblesFalhados", "DF"], ["cruzamentosBemSucedidos", "CB"], ["cruzamentosFalhados", "CF"]];
  const t = el("table", { class: "pstat-table" });
  const h = el("tr", {}, el("th", {}, "Jogador"), el("th", {}, "Tit"));
  cols.forEach((c) => h.append(el("th", { class: "num" }, c[1])));
  t.append(el("thead", {}, h));
  [...j.players]
    .sort((a, b) => (b.titular ? 1 : 0) - (a.titular ? 1 : 0) || (b.minutos || 0) - (a.minutos || 0))
    .forEach((p) => {
      const tr = el("tr", {}, el("td", {}, p.nome), el("td", {}, p.titular ? "●" : "○"));
      cols.forEach((c) => tr.append(el("td", { class: "num" }, fmt(p[c[0]]))));
      t.append(tr);
    });
  b.append(tableScroll(t));
  b.append(el("p", { class: "hint" }, "Tit = titular (●) / suplente (○). PF=passe p/ finalização, PE=passes errados, PB=perdas de bola, DB=dribles bem sucedidos, DF=dribles falhados, CB=cruzamentos bem sucedidos, CF=cruzamentos falhados."));

  // Events summary
  const evCount = {};
  j.eventos.forEach((e) => { evCount[e.acao] = (evCount[e.acao] || 0) + 1; });
  b.append(el("div", { class: "section-title" }, `Eventos registados (${j.eventos.length})`));
  const chips = el("div", { class: "chips" });
  Object.entries(evCount).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => chips.append(el("span", { class: "chip" }, `${k}: ${v}`)));
  b.append(chips);
  showModal();
}

function fmtDif(v) { const r = Math.round(v * 10) / 10; return r > 0 ? `+${r.toFixed(1)}` : r < 0 ? r.toFixed(1) : "0.0"; }

function compareBlock(ms, adversario, xg) {
  const wrap = el("div", { class: "cmp" });
  wrap.append(el("div", { class: "cmp-head" },
    teamTag(state.data.meta.clube), teamTag(adversario)));
  const colL = teamColor(state.data.meta.clube);
  const colR = teamColor(adversario, true); // vsTigres = true (é sempre contra os Tigres)
  const order = ["Resultado", "Remates", "Remates à baliza", "Cantos", "Faltas", "Fora de jogo", "Posse de bola"];
  const keys = order.filter((k) => ms && k in ms).concat(Object.keys(ms || {}).filter((k) => !order.includes(k)));
  // xG logo a seguir à posse de bola
  const stats = { ...ms };
  if (xg) {
    const XK = "xG (golos esperados)";
    stats[XK] = { tigres: Math.round(xg.tigres.xg * 100) / 100, adversario: Math.round(xg.adv.xg * 100) / 100 };
    const iP = keys.indexOf("Posse de bola");
    keys.splice(iP >= 0 ? iP + 1 : keys.length, 0, XK);
  }
  keys.forEach((k) => {
    const v = stats[k]; let a = v.tigres, c = v.adversario;
    const isPct = k === "Posse de bola";
    const isXg = k.startsWith("xG");
    const dispA = isPct ? pct(a) : isXg ? a.toFixed(2) : fmt(a), dispC = isPct ? pct(c) : isXg ? c.toFixed(2) : fmt(c);
    const na = +a || 0, nc = +c || 0, tot = na + nc || 1;
    const row = el("div", { class: "cmprow" });
    row.append(el("span", { class: "lbl" }, k));
    const line = el("div", { style: "display:grid;grid-template-columns:52px 1fr 52px;align-items:center;gap:10px" },
      el("span", { class: "v l" }, dispA),
      el("div", { class: "bar" },
        el("div", { class: "fill-l", style: fillStyle((na / tot) * 100, colL) }),
        el("div", { class: "fill-r", style: fillStyle((nc / tot) * 100, colR) })),
      el("span", { class: "v r" }, dispC));
    row.append(line);
    wrap.append(row);
  });
  return wrap;
}

function viewJogadores(app) {
  const A = seasonAgg(state.data);
  app.append(el("div", { class: "section-title" }, "Jogadores — totais da época"));
  const cols = [["jogos", "J"], ["titular", "Tit"], ["minutos", "Min"], ["golos", "G"], ["assistencias", "A"], ["remates", "Rem"], ["desarmes", "Des"], ["defesas", "Def"], ["faltas", "Flt"], ["passesErrados", "PE"], ["perdasBola", "PB"], ["driblesBemSucedidos", "DB"], ["driblesFalhados", "DF"], ["cruzamentosBemSucedidos", "CB"], ["cruzamentosFalhados", "CF"]];
  let sortKey = "golos", desc = true;
  const t = el("table", { class: "pstat-table sticky-first" });
  const build = () => {
    t.innerHTML = "";
    const h = el("tr", {}, el("th", {}, "Jogador"));
    cols.forEach((c) => {
      const th = el("th", { class: "num sortable" }, c[1] + (sortKey === c[0] ? (desc ? " ▾" : " ▴") : ""));
      th.addEventListener("click", () => { if (sortKey === c[0]) desc = !desc; else { sortKey = c[0]; desc = true; } build(); });
      h.append(th);
    });
    t.append(el("thead", {}, h));
    const tb = el("tbody");
    [...A.playersArr].sort((a, b) => desc ? b[sortKey] - a[sortKey] : a[sortKey] - b[sortKey]).forEach((p) => {
      const tr = el("tr", { onclick: () => openPlayerModal(p.nome) }, el("td", {}, p.nome));
      cols.forEach((c) => tr.append(el("td", { class: "num" }, fmt(p[c[0]]))));
      tb.append(tr);
    });
    t.append(tb);
  };
  build();
  app.append(tableScroll(t));
  app.append(el("p", { class: "hint" }, "Clica num cabeçalho para ordenar · clica num jogador para detalhe. J=jogos, Tit=titular, PE=passes errados, PB=perdas de bola, DB=dribles bem sucedidos, DF=dribles falhados, CB=cruzamentos bem sucedidos, CF=cruzamentos falhados."));
}

/* ================= ESTATÍSTICAS DA EQUIPA ================= */
// Soma de uma stat dos jogadores numa jornada
function sumPlayers(j, key) { return (j.players || []).reduce((s, p) => s + (+p[key] || 0), 0); }
// Valor de um matchStat da equipa (lado tigres)
function ms(j, key) { const v = j.matchStats?.[key]; return v && v.tigres != null ? +v.tigres : null; }
function msAdv(j, key) { const v = j.matchStats?.[key]; return v && v.adversario != null ? +v.adversario : null; }

function viewEquipa(app) {
  const js = [...state.data.jornadas].sort((a, b) => a.numero - b.numero);
  app.append(el("div", { class: "section-title" }, "Estatísticas da equipa"));
  if (!js.length) { app.append(el("div", { class: "empty" }, "Sem jornadas registadas.")); return; }

  // Cada métrica: label, função por jornada, "melhor" quando sobe (up) ou desce (down), casas decimais, sufixo
  const XG = TigresXG.xgSeason(state.data);
  const xgOf = (j, lado) => { const x = XG.porJornada[j.numero]; return x ? Math.round(x[lado].xg * 10) / 10 : null; };
  const metricas = [
    { lbl: "Golos marcados", f: (j) => ms(j, "Resultado"), dir: "up" },
    { lbl: "Golos sofridos", f: (j) => msAdv(j, "Resultado"), dir: "down" },
    { lbl: "xG — golos esperados", f: (j) => xgOf(j, "tigres"), dir: "up", dec: 1 },
    { lbl: "xG sofrido", f: (j) => xgOf(j, "adv"), dir: "down", dec: 1 },
    { lbl: "Diferença de xG", f: (j) => { const a = xgOf(j, "tigres"), b = xgOf(j, "adv"); return a == null || b == null ? null : Math.round((a - b) * 10) / 10; }, dir: "up", sign: true, dec: 1 },
    { lbl: "Remates", f: (j) => ms(j, "Remates"), dir: "up" },
    { lbl: "Remates à baliza", f: (j) => ms(j, "Remates à baliza"), dir: "up" },
    { lbl: "Precisão de remate", f: (j) => { const r = ms(j, "Remates"), b = ms(j, "Remates à baliza"); return r ? Math.round((b / r) * 100) : null; }, dir: "up", suf: "%" },
    { lbl: "Cantos", f: (j) => ms(j, "Cantos"), dir: "up" },
    { lbl: "Faltas cometidas", f: (j) => ms(j, "Faltas"), dir: "down" },
    { lbl: "Fora de jogo", f: (j) => ms(j, "Fora de jogo"), dir: "down" },
    { lbl: "Posse de bola", f: (j) => { const v = ms(j, "Posse de bola"); return v == null ? null : Math.round(v * 100); }, dir: "up", suf: "%" },
    { lbl: "Cruzamentos (equipa)", f: (j) => ms(j, "Cruzamentos"), dir: "up" },
    { lbl: "Cruzamentos bem sucedidos", f: (j) => sumPlayers(j, "cruzamentosBemSucedidos"), dir: "up" },
    { lbl: "Passes para finalização", f: (j) => sumPlayers(j, "passeFinalizacao"), dir: "up" },
    { lbl: "Passes errados", f: (j) => sumPlayers(j, "passesErrados"), dir: "down" },
    { lbl: "Perdas de bola", f: (j) => sumPlayers(j, "perdasBola"), dir: "down" },
    { lbl: "Desarmes", f: (j) => sumPlayers(j, "desarmes"), dir: "up" },
    { lbl: "Cartões vermelhos", f: (j) => ms(j, "Cartões Vermelhos"), dir: "down" },
    { lbl: "Golos por jornada (dif.)", f: (j) => { const g = ms(j, "Resultado"), s = msAdv(j, "Resultado"); return g == null || s == null ? null : g - s; }, dir: "up", sign: true },
  ];

  const grid = el("div", { class: "grid team-stats" });
  metricas.forEach((m) => {
    const serie = js.map((j) => ({ numero: j.numero, adversario: j.adversario, val: m.f(j) })).filter((x) => x.val != null);
    grid.append(teamStatCard(m, serie));
  });
  app.append(grid);
  app.append(el("p", { class: "hint" }, "Cada cartão mostra a média por jornada (número grande) e a evolução jornada a jornada. As setas indicam se variou para melhor (verde) ou pior (vermelho) face à jornada anterior."));

  // Golos vs golos esperados (época)
  const somaXG = (lado) => js.reduce((s, j) => s + (XG.porJornada[j.numero]?.[lado].xg || 0), 0);
  const gm = js.reduce((s, j) => s + (ms(j, "Resultado") || 0), 0), gs = js.reduce((s, j) => s + (msAdv(j, "Resultado") || 0), 0);
  const xgT = somaXG("tigres"), xgA = somaXG("adv");
  app.append(el("div", { class: "section-title" }, "Golos vs golos esperados (época)"));
  const xc = el("div", { class: "grid cards" });
  xc.append(
    statCard(`${gm} / ${xgT.toFixed(1)}`, "Golos marcados / xG", gm >= xgT ? `${fmtDif(gm - xgT)} — finalização acima do esperado` : `${fmtDif(gm - xgT)} — finalização abaixo do esperado`),
    statCard(`${gs} / ${xgA.toFixed(1)}`, "Golos sofridos / xG sofrido", gs <= xgA ? `${fmtDif(gs - xgA)} — sofremos menos do que o esperado` : `${fmtDif(gs - xgA)} — sofremos mais do que o esperado`),
    statCard(fmtDif(xgT - xgA), "Diferença de xG", xgT >= xgA ? "criámos mais do que o adversário" : "o adversário criou mais"),
  );
  app.append(xc);
  app.append(el("p", { class: "hint" }, `xG = soma da probabilidade de golo de cada remate, conforme a zona (dentro/fora da área) e o resultado (à baliza, para fora, bloqueado). Penálti = 0.76. Os remates à baliza estão calibrados com os golos desta liga (×${XG.fator.toFixed(2)}). Abre uma jornada para ver o detalhe.`));

  // Quando marcamos e sofremos golos
  app.append(el("div", { class: "section-title" }, "Quando marcamos e sofremos golos"));
  app.append(goalMinutesAnalysis(js));
}

/* Distribuição dos golos por períodos de 10 minutos (jogos de 80 min) */
function goalMinutesAnalysis(js) {
  const wrap = el("div", { class: "card gma" });
  const golos = js.flatMap((j) => TigresXG.goalEvents(j).map((g) => ({ ...g, numero: j.numero, adversario: j.adversario })));
  const comMin = golos.filter((g) => g.minuto != null);
  if (!comMin.length) { wrap.append(el("div", { class: "empty" }, "Sem minutos de golo registados.")); return wrap; }
  const BINS = 8;
  const bin = (m) => Math.min(BINS - 1, Math.max(0, Math.floor((m - 1) / 10)));
  const cont = Array.from({ length: BINS }, () => ({ tigres: [], adv: [] }));
  comMin.forEach((g) => cont[bin(g.minuto)][g.lado].push(g));
  const maxN = Math.max(1, ...cont.map((c) => Math.max(c.tigres.length, c.adv.length)));
  const tab = el("div", { class: "gma-rows" });
  tab.append(el("div", { class: "gma-row gma-head" }, el("span", {}, "Minutos"), el("span", { class: "gma-h-t" }, "Marcados"), el("span", { class: "gma-h-a" }, "Sofridos")));
  cont.forEach((c, i) => {
    if (i === 4) tab.append(el("div", { class: "gma-sep" }, "Intervalo"));
    const bar = (arr, cls) => el("div", { class: "gma-cell" },
      el("div", { class: `gma-bar ${cls}`, style: `width:${(arr.length / maxN) * 100}%` }),
      el("span", { class: "gma-n" }, arr.length ? String(arr.length) : ""),
      arr.some((g) => g.bolaParada) ? el("span", { class: "gma-bp", title: "dos quais de bola parada" }, `${arr.filter((g) => g.bolaParada).length} BP`) : null);
    const row = el("div", { class: "gma-row", title: [...c.tigres, ...c.adv].sort((a, b) => a.minuto - b.minuto).map((g) => `J${g.numero} ${g.minuto}' ${g.lado === "tigres" ? "marcado" : "sofrido"}`).join("\n") },
      el("span", { class: "gma-lbl" }, `${i * 10 + 1}–${(i + 1) * 10}'`), bar(c.tigres, "t"), bar(c.adv, "a"));
    tab.append(row);
  });
  wrap.append(tab);

  // Resumo por parte e conclusões
  const parte = (lado, p) => comMin.filter((g) => g.lado === lado && (p === 1 ? g.minuto <= 40 : g.minuto > 40)).length;
  const bp = (lado) => golos.filter((g) => g.lado === lado && g.bolaParada).length;
  const nT = golos.filter((g) => g.lado === "tigres").length, nA = golos.filter((g) => g.lado === "adv").length;
  const resumo = el("div", { class: "gma-sum" },
    el("div", {}, el("strong", {}, "Marcados: "), `${parte("tigres", 1)} na 1.ª parte · ${parte("tigres", 2)} na 2.ª parte · ${bp("tigres")} de ${nT} de bola parada`),
    el("div", {}, el("strong", {}, "Sofridos: "), `${parte("adv", 1)} na 1.ª parte · ${parte("adv", 2)} na 2.ª parte · ${bp("adv")} de ${nA} de bola parada`));
  wrap.append(resumo);
  const insights = [];
  const topBin = (lado) => { let best = -1, n = 0; cont.forEach((c, i) => { if (c[lado].length > n) { n = c[lado].length; best = i; } }); return best < 0 ? null : { i: best, n }; };
  const tA = topBin("adv"), tT = topBin("tigres");
  // janela de 20 min com mais golos sofridos
  let wA = { i: 0, n: 0 }; for (let i = 0; i < BINS - 1; i++) { const n = cont[i].adv.length + cont[i + 1].adv.length; if (n > wA.n) wA = { i, n }; }
  if (wA.n >= 2) insights.push(`Período mais perigoso: entre os ${wA.i * 10 + 1}' e os ${(wA.i + 2) * 10}' sofremos ${wA.n} dos ${nA} golos.`);
  else if (tA) insights.push(`Os golos sofridos estão espalhados; o período com mais é ${tA.i * 10 + 1}–${(tA.i + 1) * 10}'.`);
  if (tT) insights.push(`Marcamos mais entre os ${tT.i * 10 + 1}' e os ${(tT.i + 1) * 10}' (${tT.n} ${tT.n === 1 ? "golo" : "golos"}).`);
  const p1A = parte("adv", 1), p2A = parte("adv", 2), p1T = parte("tigres", 1), p2T = parte("tigres", 2);
  if (p1A !== p2A) insights.push(`Sofremos mais golos na ${p1A > p2A ? "1.ª" : "2.ª"} parte (${Math.max(p1A, p2A)} contra ${Math.min(p1A, p2A)}).`);
  if (p1T !== p2T) insights.push(`Marcamos mais na ${p1T > p2T ? "1.ª" : "2.ª"} parte (${Math.max(p1T, p2T)} contra ${Math.min(p1T, p2T)}).`);
  if (nA && bp("adv") / nA >= 0.5) insights.push(`${bp("adv")} dos ${nA} golos sofridos foram de bola parada — é um ponto a trabalhar.`);
  if (insights.length) wrap.append(el("ul", { class: "gma-ins" }, ...insights.map((t) => el("li", {}, t))));
  if (comMin.length < golos.length) wrap.append(el("p", { class: "hint" }, `${golos.length - comMin.length} golo(s) sem minuto registado não entram no gráfico.`));
  return wrap;
}

function teamStatCard(m, serie) {
  const card = el("div", { class: "card team-stat" });
  card.append(el("div", { class: "ts-title" }, m.lbl));
  if (!serie.length) { card.append(el("div", { class: "empty" }, "Sem dados")); return card; }
  const suf = m.suf || "";
  const avg = serie.reduce((s, x) => s + x.val, 0) / serie.length;
  const avgTxt = (m.suf === "%" ? Math.round(avg) : m.dec != null ? avg.toFixed(m.dec) : (Math.round(avg * 10) / 10)) + suf;
  card.append(el("div", { class: "ts-avg" }, avgTxt, el("span", { class: "ts-avg-lbl" }, "média/jornada")));

  // valores máximos para escala das barras
  const maxV = Math.max(...serie.map((x) => Math.abs(x.val)), 1);
  const rows = el("div", { class: "ts-rows" });
  serie.forEach((x, i) => {
    const prev = i > 0 ? serie[i - 1].val : null;
    let trend = "", arrow = "";
    if (prev != null && x.val !== prev) {
      const better = m.dir === "up" ? x.val > prev : x.val < prev;
      trend = better ? "up" : "down";
      arrow = x.val > prev ? "▲" : "▼";
    } else if (prev != null) { trend = "eq"; arrow = "="; }
    const disp = (m.sign && x.val > 0 ? "+" : "") + (m.dec != null ? x.val.toFixed(m.dec) : x.val) + suf;
    const w = Math.round((Math.abs(x.val) / maxV) * 100);
    rows.append(el("div", { class: "ts-row" },
      el("span", { class: "ts-jn" }, "J" + x.numero),
      el("div", { class: "ts-bar" }, el("div", { class: "ts-fill", style: `width:${w}%` })),
      el("span", { class: "ts-val" }, disp),
      el("span", { class: "ts-trend " + trend }, arrow),
    ));
  });
  card.append(rows);
  return card;
}

/* ================= DICAS DE TREINO ================= */
function viewDicas(app) {
  const js = [...state.data.jornadas].sort((a, b) => a.numero - b.numero);
  const n = js.length || 1;
  const mean = (fn) => js.reduce((s, j) => s + (fn(j) || 0), 0) / n;
  // médias da época
  const gs = mean((j) => msAdv(j, "Resultado"));
  const gm = mean((j) => ms(j, "Resultado"));
  const rem = mean((j) => ms(j, "Remates"));
  const remB = mean((j) => ms(j, "Remates à baliza"));
  const posse = mean((j) => { const v = ms(j, "Posse de bola"); return v == null ? 0 : v * 100; });
  const pe = mean((j) => sumPlayers(j, "passesErrados"));
  const pb = mean((j) => sumPlayers(j, "perdasBola"));
  const des = mean((j) => sumPlayers(j, "desarmes"));
  const pf = mean((j) => sumPlayers(j, "passeFinalizacao"));
  const cruzOk = mean((j) => sumPlayers(j, "cruzamentosBemSucedidos"));
  const cruzTot = mean((j) => sumPlayers(j, "cruzamentosBemSucedidos") + sumPlayers(j, "cruzamentosFalhados"));
  const turnovers = pe + pb;
  const precisao = rem ? Math.round((remB / rem) * 100) : 0;
  const cruzPrec = cruzTot ? Math.round((cruzOk / cruzTot) * 100) : 0;
  const r1 = (x) => Math.round(x * 10) / 10;

  app.append(el("div", { class: "section-title" }, "Dicas de treino"));
  app.append(el("p", { class: "dicas-intro" }, "Sugestões de treino baseadas nas estatísticas reais da equipa. Com apenas 1 hora por semana (quinta-feira), o objetivo é treinar com foco, não treinar tudo ao mesmo tempo."));

  // ---- O que dizem os números ----
  app.append(el("h3", { class: "dicas-h" }, "O que dizem os números"));
  const sinais = [
    ["Perdas de posse", `~${r1(pe)} passes errados + ~${r1(pb)} perdas = ~${r1(turnovers)} por jogo`, "É o principal problema"],
    ["Posse de bola", `${Math.round(posse)}%`, "Passamos o jogo a correr atrás da bola"],
    ["Desarmes", `~${r1(des)} por jogo`, "Confirma: enorme carga defensiva, sempre sem bola"],
    ["Produção ofensiva", `${r1(rem)} remates, ${precisao}% à baliza, ${r1(pf)} passes p/ finalização, ${r1(gm)} golos`, "Cria-se pouco e o que se cria falha"],
    ["Cruzamentos", `${r1(cruzTot)} tentados, ${cruzPrec}% conseguidos`, "Uma tática que ainda não compensa"],
    ["Golos sofridos", `${r1(gs)} por jogo`, "Muitos vêm dessas perdas de bola → contra-ataques"],
  ];
  const st = el("table", { class: "dicas-table" });
  st.append(el("thead", {}, el("tr", {}, el("th", {}, "Sinal"), el("th", {}, "Números"), el("th", {}, "Leitura"))));
  const stb = el("tbody");
  sinais.forEach((row) => stb.append(el("tr", {}, el("td", { class: "sig" }, row[0]), el("td", { class: "nums" }, row[1]), el("td", {}, row[2]))));
  st.append(stb);
  app.append(tableScroll(st));
  app.append(el("p", { class: "dicas-note" }, "A história é uma cadeia ligada: perdemos a bola facilmente → não temos posse → defendemos constantemente → as perdas em zonas perigosas viram golos sofridos. Resolver a posse primeiro melhora quase tudo o resto."));

  // ---- Prioridade nº1 ----
  app.append(el("h3", { class: "dicas-h" }, "Prioridade n.º 1: manter a bola"));
  app.append(el("p", {}, "Com apenas 1 hora por semana, não treines dez coisas. A retenção de bola sob pressão é o que dá maior retorno — reduz as perdas, aumenta a posse, alivia a carga defensiva e cria mais tempo de ataque, tudo ao mesmo tempo."));

  // ---- Sessão de 1 hora ----
  app.append(el("h3", { class: "dicas-h" }, "Uma sessão de 1 hora (repetível)"));
  const sessao = [
    ["10 min", "Rondos (meínhos / keep-away)", "4x2 ou 5x2 num quadrado apertado, máximo 2 toques. É o melhor exercício para os nossos números — treina passe sob pressão, exatamente onde perdemos as bolas. Conta passes seguidos, torna-o competitivo."],
    ["20 min", "Jogo de posse posicional", "6x6 (+2 jogadores neutros que jogam sempre com quem tem a bola, logo 8x6). Objetivo: completar X passes = 1 ponto. Sem rematar. Obriga a valorizar a bola em vez de a forçar para a frente e perder."],
    ["20 min", "Transição + finalização", "Jogo reduzido (ex.: 7x7) com balizas a sério, mas com regra: ao recuperar a bola há ~6 segundos / 3 passes para rematar. Treina reagir depressa após recuperar e acertar na baliza (a nossa precisão e os golos precisam)."],
    ["10 min", "Jogo livre", "Para terminar — deixa-os jogar e divertirem-se."],
  ];
  const sl = el("div", { class: "dicas-session" });
  sessao.forEach((b) => sl.append(el("div", { class: "sess-block" },
    el("span", { class: "sess-time" }, b[0]),
    el("div", { class: "sess-body" }, el("strong", {}, b[1]), el("p", {}, b[2])),
  )));
  app.append(sl);

  // ---- Rotação semanal ----
  app.append(el("h3", { class: "dicas-h" }, "Roda o bloco temático (20 min) de semana para semana"));
  app.append(el("p", {}, "Mantém os rondos + jogo de posse constantes (são a nossa fraqueza central). Varia o foco do bloco de finalização:"));
  const rot = [
    ["Semana A — Qualidade de finalização", "Repetições de remate: primeiro acertar na baliza, depois potência. A precisão de " + precisao + "% e " + r1(gm) + " golos precisam de volume + técnica."],
    ["Semana B — Cruzamentos e ataque à área", `Só ${cruzPrec}% dos cruzamentos resultam, por isso treina a entrega (cruzamentos rasteiros e atrasados batem os altos neste escalão) e o timing das desmarcações para os receber.`],
    ["Semana C — Organização defensiva", `Como sofremos ${r1(gs)} golos por jogo, treina manter o bloco compacto e não entrar de rompante nos desarmes (${r1(des)} desarmes/jogo sugere que nos precipitamos) — temporizar, atrasar, encaminhar para fora.`],
  ];
  const rl = el("div", { class: "dicas-cards" });
  rot.forEach((r) => rl.append(el("div", { class: "card dica-card" }, el("strong", {}, r[0]), el("p", {}, r[1]))));
  app.append(rl);

  // ---- Mentalidade ----
  app.append(el("h3", { class: "dicas-h" }, "Uma ideia para o dia de jogo"));
  app.append(el("div", { class: "dica-highlight" },
    el("p", {}, el("strong", {}, "A bola é a melhor defesa. "), `Com a diferença de posse (${Math.round(posse)}%), cada passe certo mantido é um desarme que não temos de fazer. Premeia os passes seguros ("aborrecidos") no treino para que isso passe para os jogos.`)));

  app.append(el("p", { class: "dicas-foot" }, "Estas dicas atualizam-se automaticamente com os números da época. À medida que registas mais jornadas, o separador \u201cEstatísticas da equipa\u201d mostra se as perdas de bola estão mesmo a baixar — esse é o teu marcador de que o treino está a resultar."));
}


function openPlayerModal(nome) {
  const b = $("#modalBody"); b.innerHTML = "";
  const pos = state.data.listas.posicoes?.[nome];
  b.append(el("h2", {}, nome));
  if (pos) b.append(el("div", { class: "chips" }, el("span", { class: "chip" }, pos)));
  const perJ = [];
  state.data.jornadas.forEach((j) => {
    const p = j.players.find((x) => x.nome === nome);
    if (p) perJ.push({ numero: j.numero, adversario: j.adversario, ...p });
  });
  if (!perJ.length) { b.append(el("p", { class: "empty" }, "Sem participações registadas.")); showModal(); return; }

  // Perfil do jogador — médias por 80 min (mostra a "forma" do jogador)
  b.append(playerProfile(perJ));

  // Evolução jornada a jornada (nota + estatísticas)
  b.append(playerEvolution(nome));

  const cols = [["titular", "Tit"], ["minutos", "Min"], ["golos", "G"], ["assistencias", "A"], ["remates", "Rem"], ["desarmes", "Des"], ["defesas", "Def"], ["passeFinalizacao", "PF"], ["faltas", "Flt"], ["passesErrados", "PE"], ["perdasBola", "PB"], ["driblesBemSucedidos", "DB"], ["driblesFalhados", "DF"], ["cruzamentosBemSucedidos", "CB"], ["cruzamentosFalhados", "CF"]];
  const t = el("table", { class: "pstat-table" });
  const h = el("tr", {}, el("th", {}, "Jornada"));
  cols.forEach((c) => h.append(el("th", { class: "num" }, c[1])));
  t.append(el("thead", {}, h));
  const tot = {};
  perJ.forEach((p) => {
    const tr = el("tr", {}, el("td", {}, `J${p.numero} vs ${p.adversario}`));
    cols.forEach((c) => {
      const v = c[0] === "titular" ? (p.titular ? "●" : "○") : p[c[0]];
      if (c[0] !== "titular") tot[c[0]] = (tot[c[0]] || 0) + (+p[c[0]] || 0);
      tr.append(el("td", { class: "num" }, fmt(v)));
    });
    t.append(tr);
  });
  const trT = el("tr", { style: "font-weight:700" }, el("td", {}, "Total"));
  cols.forEach((c) => trT.append(el("td", { class: "num" }, c[0] === "titular" ? perJ.filter(p => p.titular).length : fmt(tot[c[0]]))));
  t.append(trT);
  b.append(tableScroll(t));
  showModal();
}

/* Perfil do jogador — barras de médias por 80 minutos, com escala de referência */
function playerProfile(perJ) {
  const minutos = perJ.reduce((s, p) => s + (+p.minutos || 0), 0);
  const wrap = el("div", { class: "profile" });
  wrap.append(el("div", { class: "profile-title" }, "Perfil por 80 min"));
  if (minutos <= 0) { wrap.append(el("div", { class: "empty" }, "Sem minutos jogados.")); return wrap; }
  const sum = (k) => perJ.reduce((s, p) => s + (+p[k] || 0), 0);
  const per80 = (k) => (sum(k) / minutos) * 80;
  const rows = el("div", { class: "profile-rows" });
  PERFIL_METRICS.forEach(([lbl, key, ref, neg]) => {
    const v = per80(key);
    const w = Math.max(0, Math.min(100, (v / ref) * 100));
    rows.append(el("div", { class: "pf-row" },
      el("span", { class: "pf-lbl" }, lbl),
      el("div", { class: "pf-bar" }, el("div", { class: "pf-fill" + (neg ? " neg" : ""), style: `width:${w}%` })),
      el("span", { class: "pf-val" }, (Math.round(v * 10) / 10).toString()),
    ));
  });
  wrap.append(rows);
  wrap.append(el("div", { class: "pf-note" }, `Média por 80 min ao longo de ${perJ.length} ${perJ.length === 1 ? "jogo" : "jogos"} (${minutos} min no total). Barras a vermelho = indicadores a reduzir.`));
  return wrap;
}

/* ================= EVOLUÇÃO DO JOGADOR ================= */
// Jogos com menos minutos do que isto não são extrapolados para 80 min
// (mostram o valor real, a cinzento, e não entram nas comparações).
const EVO_MIN_EXTRAPOLAR = 40;

// Estatísticas na tabela de evolução: [label, chave, negativo?]
const EVO_STATS = [
  ["Golos", "golos", false],
  ["Assistências", "assistencias", false],
  ["Passe p/ finalização", "passeFinalizacao", false],
  ["Remates", "remates", false],
  ["Desarmes", "desarmes", false],
  ["Defesas", "defesas", false],
  ["Dribles conseguidos", "driblesBemSucedidos", false],
  ["Dribles falhados", "driblesFalhados", true],
  ["Cruzamentos conseguidos", "cruzamentosBemSucedidos", false],
  ["Cruzamentos falhados", "cruzamentosFalhados", true],
  ["Passes errados", "passesErrados", true],
  ["Perdas de bola", "perdasBola", true],
  ["Faltas", "faltas", true],
];

function playerEvolution(nome) {
  const wrap = el("div", { class: "evo" });
  const R = window.TigresRatings;
  const notas = R ? R.computeRatings(state.data).porJornada : null;
  const jornadas = [...state.data.jornadas].sort((a, b) => a.numero - b.numero);
  // uma linha por jornada; jogos sem minutos contam como "não jogou"
  const jogos = jornadas.map((j) => {
    const p = j.players.find((x) => x.nome === nome);
    const jogou = !!p && (+p.minutos || 0) > 0;
    const row = notas?.[j.numero]?.find((r) => r.nome === nome);
    const equipa = (notas?.[j.numero] || []).filter((r) => r.min > 0);
    return {
      numero: j.numero, adversario: j.adversario, jogou, p,
      min: jogou ? +p.minutos : 0,
      nota: jogou && row ? row.nota : null,
      pos: row?.pos || "",
      mediaEquipa: equipa.length ? equipa.reduce((s, r) => s + r.nota, 0) / equipa.length : null,
    };
  });

  wrap.append(el("div", { class: "profile-title" }, "Evolução da nota por jornada"));
  if (!notas) wrap.append(el("div", { class: "empty" }, "Modelo de notas indisponível."));
  else wrap.append(evoChart(jogos));

  wrap.append(el("div", { class: "profile-title evo-gap" }, "Estatísticas jogo a jogo"));
  wrap.append(evoTable(jogos));
  return wrap;
}

/* Gráfico SVG: nota do jogador (linha sólida) vs média da equipa (tracejado) */
function evoChart(jogos) {
  const NS = "http://www.w3.org/2000/svg";
  const s = (tag, attrs, text) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (text != null) n.textContent = text; return n; };
  const W = 640, H = 230, L = 34, Rr = 14, T = 16, B = 46;
  const n = jogos.length;
  const x = (i) => L + (n === 1 ? (W - L - Rr) / 2 : (i * (W - L - Rr)) / (n - 1));
  const y = (v) => T + ((10 - v) / 6) * (H - T - B); // eixo 4–10
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "evo-chart", role: "img", "aria-label": "Evolução da nota por jornada" });
  for (let v = 4; v <= 10; v += 2) {
    svg.append(s("line", { x1: L, x2: W - Rr, y1: y(v), y2: y(v), class: "evo-grid" }));
    svg.append(s("text", { x: L - 8, y: y(v) + 4, class: "evo-axis", "text-anchor": "end" }, v));
  }
  // linha da equipa (todas as jornadas)
  const eq = jogos.map((g, i) => (g.mediaEquipa == null ? null : `${x(i)},${y(g.mediaEquipa)}`)).filter(Boolean);
  if (eq.length > 1) svg.append(s("polyline", { points: eq.join(" "), class: "evo-team" }));
  // linha do jogador: quebra nas jornadas em que não jogou
  let seg = [];
  const flush = () => { if (seg.length > 1) svg.append(s("polyline", { points: seg.join(" "), class: "evo-line" })); seg = []; };
  jogos.forEach((g, i) => { if (g.nota == null) flush(); else seg.push(`${x(i)},${y(g.nota)}`); });
  flush();
  jogos.forEach((g, i) => {
    svg.append(s("text", { x: x(i), y: H - B + 18, class: "evo-axis evo-j", "text-anchor": "middle" }, `J${g.numero}`));
    if (g.nota == null) {
      svg.append(s("text", { x: x(i), y: H - B + 32, class: "evo-axis", "text-anchor": "middle" }, "não jogou"));
      return;
    }
    svg.append(s("text", { x: x(i), y: H - B + 32, class: "evo-axis", "text-anchor": "middle" }, `${g.pos} · ${g.min}'`));
    const dot = s("circle", { cx: x(i), cy: y(g.nota), r: 6, class: "evo-dot" + (g.mediaEquipa != null && g.nota >= g.mediaEquipa ? " up" : " down") });
    dot.append(s("title", {}, `J${g.numero} vs ${g.adversario}\nNota ${g.nota.toFixed(1)} (média da equipa ${g.mediaEquipa?.toFixed(1) ?? "—"})\n${g.pos} · ${g.min} min`));
    svg.append(dot);
    svg.append(s("text", { x: x(i), y: y(g.nota) - 11, class: "evo-val", "text-anchor": "middle" }, g.nota.toFixed(1)));
  });
  const box = el("div", { class: "evo-chart-wrap" });
  box.append(svg);
  box.append(el("div", { class: "evo-legend" },
    el("span", { class: "lg lg-player" }, "Nota do jogador"),
    el("span", { class: "lg lg-team" }, "Média da equipa"),
    el("span", { class: "lg lg-up" }, "acima da média"),
    el("span", { class: "lg lg-down" }, "abaixo da média")));
  return box;
}

/* Tabela: estatísticas × jornadas, com cor face à média do próprio jogador */
function evoTable(jogos) {
  const box = el("div");
  let modo = "total"; // "total" | "p80"
  const toggle = el("div", { class: "evo-toggle" });
  const bTot = el("button", { class: "active" }, "Totais por jogo");
  const bP80 = el("button", {}, "Por 80 min");
  toggle.append(bTot, bP80);
  const holder = el("div");
  const note = el("p", { class: "pf-note" });
  const jogados = jogos.filter((g) => g.jogou);

  const build = () => {
    holder.innerHTML = "";
    // valor de uma estatística num jogo; em "por 80" só extrapola com minutos suficientes
    const val = (g, key) => {
      const v = +g.p[key] || 0;
      if (modo === "p80" && g.min >= EVO_MIN_EXTRAPOLAR) return { v: (v / g.min) * 80, escalado: true };
      return { v, escalado: false };
    };
    // um jogo entra nas comparações em "totais" sempre; em "por 80" só se foi extrapolado
    const conta = (g) => modo === "total" || g.min >= EVO_MIN_EXTRAPOLAR;
    const t = el("table", { class: "pstat-table evo-table sticky-first" });
    const h = el("tr", {}, el("th", {}, "Estatística"));
    jogos.forEach((g) => h.append(el("th", { class: "num", title: `vs ${g.adversario}` }, `J${g.numero}`)));
    h.append(el("th", { class: "num" }, modo === "total" ? "Média" : "Média/80"));
    t.append(el("thead", {}, h));
    const tb = el("tbody");
    // linha de minutos (contexto)
    const trMin = el("tr", { class: "evo-min" }, el("td", {}, "Minutos"));
    jogos.forEach((g) => trMin.append(el("td", { class: "num" + (g.jogou && modo === "p80" && g.min < EVO_MIN_EXTRAPOLAR ? " evo-few" : "") }, g.jogou ? g.min : "—")));
    trMin.append(el("td", { class: "num" }, jogados.length ? Math.round(jogados.reduce((s, g) => s + g.min, 0) / jogados.length) : "—"));
    tb.append(trMin);
    EVO_STATS.forEach(([lbl, key, neg]) => {
      const base = jogados.filter(conta);
      const media = base.length ? base.reduce((s, g) => s + val(g, key).v, 0) / base.length : null;
      const tr = el("tr", {}, el("td", {}, lbl));
      jogos.forEach((g) => {
        if (!g.jogou) { tr.append(el("td", { class: "num evo-na" }, "—")); return; }
        const { v } = val(g, key);
        let cls = "num";
        if (!conta(g)) cls += " evo-few";
        else if (media != null && base.length > 1 && Math.abs(v - media) > 1e-9) {
          const melhor = neg ? v < media : v > media;
          cls += melhor ? " evo-good" : " evo-bad";
        }
        tr.append(el("td", { class: cls }, fmtEvo(v)));
      });
      tr.append(el("td", { class: "num evo-avg" }, media == null ? "—" : fmtEvo(media)));
      tb.append(tr);
    });
    t.append(tb);
    holder.append(tableScroll(t));
    note.textContent = modo === "total"
      ? "Verde = melhor do que a média do próprio jogador; vermelho = pior (nos indicadores a reduzir, como passes errados, menos é melhor). — = não jogou."
      : `Valores por 80 min. Jogos com menos de ${EVO_MIN_EXTRAPOLAR} min não são extrapolados: mostram o valor real a cinzento e não entram na média nem nas cores.`;
  };
  bTot.addEventListener("click", () => { modo = "total"; bTot.classList.add("active"); bP80.classList.remove("active"); build(); });
  bP80.addEventListener("click", () => { modo = "p80"; bP80.classList.add("active"); bTot.classList.remove("active"); build(); });
  build();
  box.append(toggle, holder, note);
  return box;
}
function fmtEvo(v) { return Number.isInteger(v) ? String(v) : (Math.round(v * 10) / 10).toString(); }

/* Métricas usadas no perfil e no comparador: [label, chave, máx referência, negativo?] */
const PERFIL_METRICS = [
  ["Golos", "golos", 2, false],
  ["Assistências", "assistencias", 2, false],
  ["Remates", "remates", 4, false],
  ["Passe p/ finalização", "passeFinalizacao", 3, false],
  ["Desarmes", "desarmes", 12, false],
  ["Defesas", "defesas", 6, false],
  ["Dribles conseguidos", "driblesBemSucedidos", 4, false],
  ["Cruzamentos conseguidos", "cruzamentosBemSucedidos", 3, false],
  ["Perdas de bola", "perdasBola", 6, true],
  ["Passes errados", "passesErrados", 8, true],
  ["Faltas", "faltas", 4, true],
];

/* ================= COMPARAR JOGADORES ================= */
function viewComparar(app) {
  app.append(el("div", { class: "section-title" }, "Comparar jogadores"));
  app.append(el("p", { class: "dicas-intro" }, "Escolhe 2 ou 3 jogadores para comparar os perfis por 80 minutos lado a lado: primeiro no radar (ofensivas em cima, defensivas em baixo) e depois indicador a indicador. Nas barras, o melhor valor de cada indicador fica destacado (verde = bom; vermelho = indicador a reduzir)."));

  // Jogadores com minutos registados
  const agregados = {};
  state.data.jornadas.forEach((j) => j.players.forEach((p) => {
    const a = (agregados[p.nome] ||= { nome: p.nome, minutos: 0 });
    PERFIL_METRICS.forEach(([, k]) => { a[k] = (a[k] || 0) + (+p[k] || 0); });
    a.minutos += (+p.minutos || 0);
  }));
  const nomes = Object.values(agregados).filter((a) => a.minutos > 0).map((a) => a.nome).sort((x, y) => x.localeCompare(y));
  if (nomes.length < 2) { app.append(el("div", { class: "empty" }, "Precisas de pelo menos 2 jogadores com minutos registados.")); return; }

  // Seleção (3 dropdowns; o 3.º é opcional)
  const sel = [0, 1, 2].map((i) => {
    const s = el("select");
    s.append(el("option", { value: "" }, i < 2 ? "— escolher —" : "— (opcional) —"));
    nomes.forEach((n) => s.append(el("option", { value: n }, n)));
    if (i < nomes.length && i < 2) s.value = nomes[i];
    return s;
  });
  const picker = el("div", { class: "cmp-picker" },
    field("Jogador 1", sel[0]), field("Jogador 2", sel[1]), field("Jogador 3", sel[2]));
  app.append(picker);

  const out = el("div", { class: "cmp-out" });
  app.append(out);

  const per80 = (a, k) => a.minutos > 0 ? ((+a[k] || 0) / a.minutos) * 80 : 0;
  function build() {
    out.innerHTML = "";
    const chosen = sel.map((s) => s.value).filter(Boolean);
    const uniq = [...new Set(chosen)];
    if (uniq.length < 2) { out.append(el("div", { class: "empty" }, "Escolhe pelo menos 2 jogadores diferentes.")); return; }
    const players = uniq.map((n) => agregados[n]);

    // Radar (ofensivas em cima, defensivas em baixo)
    out.append(radarChart(uniq, radarAgg(state.data)));
    out.append(el("div", { class: "section-title" }, "Valores por 80 min"));

    // Cabeçalho com nomes + posição + minutos
    const header = el("div", { class: "cmp-grid cmp-head", style: `grid-template-columns:1.4fr repeat(${players.length},1fr)` });
    header.append(el("div", { class: "cmp-cell cmp-metric" }, "Por 80 min"));
    players.forEach((p) => {
      const pos = state.data.listas.posicoes?.[p.nome] || "";
      header.append(el("div", { class: "cmp-cell cmp-player", onclick: () => openPlayerModal(p.nome) },
        el("strong", {}, p.nome),
        el("span", { class: "cmp-sub" }, `${pos ? pos + " · " : ""}${p.minutos} min`)));
    });
    out.append(header);

    // Linhas de métricas
    PERFIL_METRICS.forEach(([lbl, key, ref, neg]) => {
      const vals = players.map((p) => per80(p, key));
      // melhor valor: menor se negativo, maior se positivo
      const best = neg ? Math.min(...vals) : Math.max(...vals);
      const anyNonZero = vals.some((v) => v > 0);
      const grid = el("div", { class: "cmp-grid", style: `grid-template-columns:1.4fr repeat(${players.length},1fr)` });
      grid.append(el("div", { class: "cmp-cell cmp-metric" }, lbl));
      vals.forEach((v) => {
        const w = Math.max(0, Math.min(100, (v / ref) * 100));
        const isBest = anyNonZero && v === best;
        const cell = el("div", { class: "cmp-cell" },
          el("div", { class: "cmp-bar" }, el("div", { class: "cmp-fill" + (neg ? " neg" : "") + (isBest ? " best" : ""), style: `width:${w}%` })),
          el("span", { class: "cmp-val" + (isBest ? " best" : "") }, (Math.round(v * 10) / 10).toString()));
        grid.append(cell);
      });
      out.append(grid);
    });
    out.append(el("p", { class: "pf-note" }, "Valores por 80 min ao longo da época. O destaque assinala o melhor em cada indicador (nos negativos, o mais baixo)."));
  }
  sel.forEach((s) => s.addEventListener("change", build));
  build();
}

/* ================= RADAR (comparador) =================
   Ofensivas na metade de cima, defensivas na metade de baixo.
   Tudo por 80 min (exceto % de remates à baliza). "Mais longe do centro = melhor":
   nos indicadores a reduzir a escala é invertida (0 fica na extremidade). */
const RADAR_COLORS = ["#1f4e8c", "#e0734f", "#2a9d6a"];
// [label (linhas), chave, tipo, invertido?, ângulo em graus a partir do topo, sentido horário]
const RADAR_AXES = [
  [["Remates"], "remates", "p80", false, -84],
  [["Remate à", "baliza %"], "pctBaliza", "pct", false, -56],
  [["Passe p/", "finalização"], "passeFinalizacao", "p80", false, -28],
  [["Golos"], "golos", "p80", false, 0],
  [["Assistências"], "assistencias", "p80", false, 28],
  [["Dribles", "conseguidos"], "driblesBemSucedidos", "p80", false, 56],
  [["Cruzamentos", "conseguidos"], "cruzamentosBemSucedidos", "p80", false, 84],
  [["Desarmes"], "desarmes", "p80", false, 132],
  [["Faltas"], "faltas", "p80", true, 168],
  [["Passes", "errados"], "passesErrados", "p80", true, 204],
  [["Perdas", "de bola"], "perdasBola", "p80", true, 240],
];

// Totais da época por jogador (+ remates à baliza a partir dos eventos)
function radarAgg(data) {
  const A = {};
  for (const j of data.jornadas) {
    for (const p of j.players) {
      const a = (A[p.nome] ||= { nome: p.nome, minutos: 0, baliza: 0 });
      a.minutos += +p.minutos || 0;
      for (const [, k, tipo] of RADAR_AXES) if (tipo === "p80") a[k] = (a[k] || 0) + (+p[k] || 0);
    }
    for (const e of j.eventos || []) if (TigresXG.isOwnShotOnTarget(e.acao) && e.jogador && A[e.jogador]) A[e.jogador].baliza++;
  }
  for (const a of Object.values(A)) a.baliza = Math.min(a.baliza, a.remates || 0);
  return A;
}
function radarValue(a, key, tipo) {
  if (tipo === "pct") return a.remates > 0 ? (a.baliza / a.remates) * 100 : 0;
  return a.minutos > 0 ? ((a[key] || 0) / a.minutos) * 80 : 0;
}
// arredonda para cima para um valor "redondo" (1, 2, 2.5, 5, 10 × 10^n)
function radarNice(v) {
  if (v <= 0) return 1;
  const m = Math.pow(10, Math.floor(Math.log10(v)));
  for (const s of [1, 2, 2.5, 5, 10]) if (s * m >= v - 1e-9) return s * m;
  return 10 * m;
}
function radarFmt(v) { return Number.isInteger(Math.round(v * 100) / 100) ? String(Math.round(v)) : (Math.round(v * 10) / 10).toString(); }

function radarChart(players, agg) {
  const NS = "http://www.w3.org/2000/svg";
  const s = (tag, attrs, text) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (text != null) n.textContent = text; return n; };
  const W = 640, H = 600, cx = W / 2, cy = 300, R = 210;
  const rad = (deg) => (deg * Math.PI) / 180;
  const pt = (deg, r) => [cx + r * Math.sin(rad(deg)), cy - r * Math.cos(rad(deg))];

  // Escala de cada eixo: melhor/pior valor do plantel com minutos suficientes
  const todos = Object.values(agg).filter((a) => a.minutos > 0);
  const base = todos.filter((a) => a.minutos >= P80_MIN_EPOCA).length ? todos.filter((a) => a.minutos >= P80_MIN_EPOCA) : todos;
  const escala = RADAR_AXES.map(([, key, tipo]) => (tipo === "pct" ? 100 : radarNice(Math.max(...base.map((a) => radarValue(a, key, tipo))))));
  // fração 0..1 do centro para fora (invertidos: 0 = extremidade)
  const frac = (v, i) => { const f = Math.max(0, Math.min(1, v / escala[i])); return RADAR_AXES[i][3] ? 1 - f : f; };

  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "radar-chart", role: "img", "aria-label": "Radar de comparação de jogadores" });
  // metades: ofensiva (cima) e defensiva (baixo), separadas a ±108°
  const sector = (a0, a1, cls) => {
    const [x0, y0] = pt(a0, R), [x1, y1] = pt(a1, R);
    svg.append(s("path", { d: `M${cx},${cy} L${x0},${y0} A${R},${R} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1},${y1} Z`, class: cls }));
  };
  sector(-108, 108, "radar-off");
  sector(108, 252, "radar-def");
  for (let k = 1; k <= 5; k++) svg.append(s("circle", { cx, cy, r: (R * k) / 5, class: "radar-ring" }));
  svg.append(s("text", { x: cx, y: cy - R - 52, class: "radar-half", "text-anchor": "middle" }, "OFENSIVAS"));
  svg.append(s("text", { x: cx, y: cy + R + 62, class: "radar-half def", "text-anchor": "middle" }, "DEFENSIVAS"));

  RADAR_AXES.forEach(([lbl, , tipo, inv, deg], i) => {
    const [x, y] = pt(deg, R);
    svg.append(s("line", { x1: cx, y1: cy, x2: x, y2: y, class: "radar-axis" }));
    // valores de escala a meio e na extremidade
    [0.5, 1].forEach((f) => {
      const v = inv ? escala[i] * (1 - f) : escala[i] * f;
      const [tx, ty] = pt(deg, R * f);
      svg.append(s("text", { x: tx, y: ty + 4, class: "radar-tick", "text-anchor": "middle" }, radarFmt(v) + (tipo === "pct" ? "%" : "")));
    });
    // rótulo do eixo
    const [lx, ly] = pt(deg, R + 22);
    const sx = Math.sin(rad(deg));
    const anchor = Math.abs(sx) < 0.2 ? "middle" : sx > 0 ? "start" : "end";
    const cy0 = Math.cos(rad(deg));
    const nl = lbl.length + (inv ? 1 : 0); // n.º de linhas do rótulo
    const y0 = cy0 > 0.3 ? ly - (nl - 1) * 13 : cy0 < -0.3 ? ly + 12 : ly + 4 - ((nl - 1) * 13) / 2;
    const t = s("text", { x: lx, y: y0, class: "radar-lbl", "text-anchor": anchor });
    lbl.forEach((line, k) => t.append(s("tspan", { x: lx, dy: k ? 13 : 0 }, line)));
    if (inv) t.append(s("tspan", { x: lx, dy: 13, class: "radar-inv" }, "(menos é melhor)"));
    svg.append(t);
  });

  // polígonos dos jogadores
  players.forEach((nome, pi) => {
    const a = agg[nome];
    const cor = RADAR_COLORS[pi];
    const pts = RADAR_AXES.map(([, key, tipo, , deg], i) => pt(deg, R * frac(radarValue(a, key, tipo), i)));
    svg.append(s("polygon", { points: pts.map((p) => p.join(",")).join(" "), class: "radar-poly", fill: cor, stroke: cor }));
    RADAR_AXES.forEach(([lbl, key, tipo], i) => {
      const v = radarValue(a, key, tipo);
      const dot = s("circle", { cx: pts[i][0], cy: pts[i][1], r: 4.5, fill: cor, class: "radar-dot" });
      dot.append(s("title", {}, `${nome} — ${lbl.join(" ")}: ${radarFmt(v)}${tipo === "pct" ? "%" : " / 80 min"}${v > escala[i] && !RADAR_AXES[i][3] ? " (acima da escala)" : ""}`));
      svg.append(dot);
    });
  });

  const box = el("div", { class: "radar-box" });
  const wrap = el("div", { class: "radar-wrap" });
  wrap.append(svg);
  box.append(wrap);
  const legend = el("div", { class: "radar-legend" });
  players.forEach((nome, pi) => {
    const a = agg[nome];
    legend.append(el("span", { class: "radar-lg", onclick: () => openPlayerModal(nome) },
      el("span", { class: "radar-sw", style: `background:${RADAR_COLORS[pi]}` }),
      el("strong", {}, nome),
      el("span", { class: "cmp-sub" }, ` ${a.minutos} min${a.minutos < P80_MIN_EPOCA ? " · poucos minutos" : ""}`)));
  });
  box.append(legend);
  box.append(el("p", { class: "pf-note" },
    `Tudo por 80 min, exceto "Remate à baliza %" (remates à baliza ÷ remates). Mais longe do centro = melhor. Em Faltas, Passes errados e Perdas de bola a escala é invertida: a extremidade é 0. A escala de cada eixo vai até ao melhor (ou pior, nos invertidos) valor do plantel entre jogadores com ≥${P80_MIN_EPOCA} min.`));
  return box;
}

/* ================= POSSE DE BOLA (cronómetros) =================
   Dois cronómetros (Tigres / Adversário). Arrancar um pára o outro.
   Atalhos de teclado configuráveis. Tempos finais + percentagens no fim. */
const posseState = {
  ms: { tigres: 0, adv: 0 }, // tempo acumulado em milissegundos
  active: null,              // 'tigres' | 'adv' | null
  since: 0,                  // timestamp em que o cronómetro ativo arrancou
};
function posseKeys() {
  let k = {};
  try { k = JSON.parse(localStorage.getItem("tigres_posse_keys") || "{}"); } catch (e) { k = {}; }
  return { tigres: k.tigres || "a", adv: k.adv || "l", pause: k.pause || " " };
}
function setPosseKeys(k) { localStorage.setItem("tigres_posse_keys", JSON.stringify(k)); }
function posseElapsed(side) {
  let v = posseState.ms[side];
  if (posseState.active === side) v += Date.now() - posseState.since;
  return v;
}
function posseBank() {
  if (posseState.active) { posseState.ms[posseState.active] += Date.now() - posseState.since; posseState.active = null; }
}
function posseActivate(side) {
  if (posseState.active === side) { posseBank(); return; } // tocar de novo = pausa
  posseBank();
  posseState.active = side;
  posseState.since = Date.now();
}
function fmtClock(ms) {
  const t = Math.floor(ms / 1000);
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  const mm = String(m).padStart(2, "0"), ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
function keyLabel(k) { return k === " " ? "Espaço" : k.length === 1 ? k.toUpperCase() : k; }

function viewPosse(app) {
  const clube = state.data.meta.clube || "Tigres";
  app.append(el("div", { class: "section-title" }, "Posse de bola — cronómetros"));
  app.append(el("p", { class: "dicas-intro" }, "Enquanto revês o vídeo do jogo, usa os atalhos de teclado para cronometrar a posse de cada equipa. Arrancar um cronómetro pára automaticamente o outro. No fim tens os tempos e as percentagens."));

  const keys = posseKeys();

  const timers = el("div", { class: "posse-timers" });
  const makeCard = (side, nome) => {
    const clock = el("div", { class: "posse-clock" }, fmtClock(posseElapsed(side)));
    const pct = el("div", { class: "posse-pct" }, "");
    const keyTxt = el("strong", {}, keyLabel(keys[side]));
    const card = el("div", { class: "posse-card " + side },
      el("div", { class: "posse-team" }, nome),
      clock,
      pct,
      el("div", { class: "posse-key" }, "Atalho: ", keyTxt),
      el("button", { class: "btn posse-btn", onclick: () => { posseActivate(side); tick(); } }, "Iniciar / Pausar"),
    );
    card._clock = clock; card._pct = pct; card._keyTxt = keyTxt;
    return card;
  };
  const cTigres = makeCard("tigres", clube);
  const cAdv = makeCard("adv", "Adversário");
  timers.append(cTigres, cAdv);

  const status = el("div", { class: "posse-status" }, "");

  // Controlos
  const pauseBtn = el("button", { class: "btn ghost", onclick: () => { posseBank(); tick(); } }, `Pausar tudo (${keyLabel(keys.pause)})`);
  const resetBtn = el("button", { class: "btn danger", onclick: () => {
    if (confirm("Repor ambos os cronómetros a zero?")) { posseState.ms.tigres = 0; posseState.ms.adv = 0; posseState.active = null; tick(); }
  } }, "Repor a zero");
  const controls = el("div", { class: "posse-controls" }, pauseBtn, resetBtn);

  // Painel de vídeo (dropdown de jogo + embed) ao lado dos cronómetros
  const comVideo = (state.data.calendario || []).filter((c) => c.video).sort((a, b) => a.numero - b.numero);
  const videoPanel = el("div", { class: "posse-video" });
  if (comVideo.length) {
    const sel = el("select");
    comVideo.forEach((c) => sel.append(el("option", { value: c.video }, `Jornada ${c.numero} · ${c.casa ? clube + " vs " + c.adversario : c.adversario + " vs " + clube}`)));
    const holder = el("div", { class: "posse-video-holder" });
    const refresh = () => { holder.innerHTML = ""; const emb = videoEmbed(sel.value); if (emb) holder.append(emb); };
    sel.addEventListener("change", refresh);
    videoPanel.append(el("label", {}, "Vídeo do jogo"), sel, holder);
    refresh();
  } else {
    videoPanel.append(el("p", { class: "dicas-note" }, "Sem vídeos disponíveis para já. Quando houver, aparecem aqui para cronometrares ao lado."));
  }

  // Coluna dos cronómetros + estado + controlos
  const timerCol = el("div", { class: "posse-timercol" }, timers, status, controls);
  app.append(el("div", { class: "posse-main" }, videoPanel, timerCol));

  // Configurar atalhos
  const cfg = el("div", { class: "posse-cfg" });
  cfg.append(el("div", { class: "posse-cfg-title" }, "Atalhos de teclado"));
  const caps = {};
  let capturing = null; // 'tigres' | 'adv' | 'pause'
  const mkRow = (which, label) => {
    const val = el("button", { class: "key-cap" }, keyLabel(keys[which]));
    val.addEventListener("click", () => { capturing = which; val.textContent = "Prime uma tecla…"; val.classList.add("capturing"); });
    caps[which] = val;
    return el("div", { class: "posse-cfg-row" }, el("span", {}, label), val);
  };
  cfg.append(mkRow("tigres", clube), mkRow("adv", "Adversário"), mkRow("pause", "Pausar tudo"));
  cfg.append(el("p", { class: "dicas-note" }, "Clica num atalho e prime a tecla que queres. Evita teclas que uses para escrever."));
  app.append(cfg);

  // Gravar posse medida numa jornada existente (overwrite)
  const save = el("div", { class: "posse-save" });
  save.append(el("div", { class: "posse-cfg-title" }, "Guardar na jornada"));
  const jornadas = [...state.data.jornadas].sort((a, b) => a.numero - b.numero);
  if (!jornadas.length) {
    save.append(el("p", { class: "dicas-note" }, "Ainda não há jornadas registadas para gravar."));
  } else {
    const sel = el("select");
    jornadas.forEach((j) => sel.append(el("option", { value: j.numero }, `Jornada ${j.numero} vs ${j.adversario}`)));
    const info = el("p", { class: "dicas-note" }, "Substitui a posse de bola atual da jornada escolhida pelas percentagens medidas acima.");
    const saveMsg = el("div", { class: "posse-status" }, "");
    const doSave = (toGitHub) => async () => {
      const tT = posseElapsed("tigres"), tA = posseElapsed("adv"), tot = tT + tA;
      if (tot <= 0) { saveMsg.className = "posse-status"; saveMsg.style.color = "var(--loss)"; saveMsg.textContent = "❌ Sem tempo medido. Cronometra primeiro."; return; }
      const fracT = Math.round((tT / tot) * 100) / 100; // ex. 0.60
      const num = +sel.value;
      const j = state.data.jornadas.find((x) => x.numero === num);
      if (!j) return;
      j.matchStats = j.matchStats || {};
      j.matchStats["Posse de bola"] = { tigres: fracT, adversario: Math.round((1 - fracT) * 100) / 100 };
      state.data.meta.atualizado = new Date().toISOString();
      saveMsg.style.color = "";
      if (toGitHub) {
        try {
          saveMsg.textContent = "A guardar no GitHub…";
          await saveToGitHub(state.data, `Posse de bola — Jornada ${num}`);
          state.source = "github";
          saveMsg.className = "posse-status on";
          saveMsg.textContent = `✅ Posse guardada e partilhada na Jornada ${num} (${Math.round(fracT * 100)}% / ${Math.round((1 - fracT) * 100)}%).`;
        } catch (e) { saveMsg.className = "posse-status"; saveMsg.style.color = "var(--loss)"; saveMsg.textContent = "❌ " + e.message; }
      } else {
        localStorage.setItem("tigres_cache", JSON.stringify(state.data));
        state.source = "local";
        saveMsg.className = "posse-status on";
        saveMsg.textContent = `✅ Posse guardada localmente na Jornada ${num} (${Math.round(fracT * 100)}% / ${Math.round((1 - fracT) * 100)}%). Lembra-te de a enviar para o GitHub.`;
      }
    };
    const btnGh = el("button", { class: "btn", onclick: doSave(true) }, "Guardar no GitHub");
    const btnLocal = el("button", { class: "btn ghost", onclick: doSave(false) }, "Guardar localmente");
    if (!ghConfigured()) btnGh.disabled = true;
    save.append(field("Jornada", sel), info, el("div", { class: "btnrow" }, btnGh, btnLocal), saveMsg);
  }
  app.append(save);

  // Atualização visual
  function tick() {
    const tT = posseElapsed("tigres"), tA = posseElapsed("adv"), tot = tT + tA;
    cTigres._clock.textContent = fmtClock(tT);
    cAdv._clock.textContent = fmtClock(tA);
    const pT = tot > 0 ? Math.round((tT / tot) * 100) : 0;
    cTigres._pct.textContent = tot > 0 ? pT + "%" : "–";
    cAdv._pct.textContent = tot > 0 ? (100 - pT) + "%" : "–";
    cTigres.classList.toggle("running", posseState.active === "tigres");
    cAdv.classList.toggle("running", posseState.active === "adv");
    status.textContent = posseState.active === "tigres" ? `A contar: ${clube}` : posseState.active === "adv" ? "A contar: Adversário" : "Em pausa";
    status.className = "posse-status " + (posseState.active ? "on" : "");
  }

  const interval = setInterval(tick, 100);
  tick();

  // Teclado
  function onKey(e) {
    const k = (e.key || "").length === 1 ? e.key.toLowerCase() : e.key;
    if (capturing) {
      e.preventDefault();
      keys[capturing] = k;
      setPosseKeys(keys);
      caps[capturing].textContent = keyLabel(k);
      caps[capturing].classList.remove("capturing");
      cTigres._keyTxt.textContent = keyLabel(keys.tigres);
      cAdv._keyTxt.textContent = keyLabel(keys.adv);
      pauseBtn.textContent = `Pausar tudo (${keyLabel(keys.pause)})`;
      capturing = null;
      return;
    }
    if (k === keys.tigres) { e.preventDefault(); posseActivate("tigres"); tick(); }
    else if (k === keys.adv) { e.preventDefault(); posseActivate("adv"); tick(); }
    else if (k === keys.pause) { e.preventDefault(); posseBank(); tick(); }
  }
  document.addEventListener("keydown", onKey);

  // Limpeza ao sair da vista (o tempo continua guardado em posseState)
  viewCleanup = () => { clearInterval(interval); document.removeEventListener("keydown", onKey); posseBank(); };
}

/* ================= NOVA JORNADA (form) ================= */
function viewNova(app) {
  const L = state.data.listas;
  const nextNum = Math.max(0, ...state.data.jornadas.map((j) => j.numero)) + 1;
  app.append(el("div", { class: "section-title" }, `Registar Jornada ${nextNum}`));

  if (!ghConfigured()) {
    app.append(el("div", { class: "note", html: "<strong>App ainda não ligada ao GitHub.</strong> Podes preencher e <em>Exportar Excel</em>, mas para partilhar com os teus amigos tens de configurar o repositório (ver instruções no fim). Enquanto isso, os dados novos ficam guardados só neste browser." }));
  }

  const form = el("div");
  // Meta
  const meta = el("div", { class: "form-grid" });
  const advSel = selectFrom(L.equipas.filter((e) => e !== state.data.meta.clube), "Adversário");
  const numInput = el("input", { type: "number", value: nextNum, id: "f_num" });
  const nrJog = el("input", { type: "number", value: 16, id: "f_nrjog" });
  const tatica = el("input", { type: "text", value: "5-4-1", id: "f_tatica" });
  meta.append(
    field("Jornada nº", numInput),
    field("Adversário", advSel),
    field("Nº de jogadores", nrJog),
    field("Tática inicial", tatica));
  form.append(meta);

  // Match stats
  form.append(el("div", { class: "section-title" }, "Estatísticas do jogo"));
  const statDefs = [["Resultado", "golos"], ["Remates", ""], ["Remates à baliza", ""], ["Cantos", ""], ["Faltas", ""], ["Fora de jogo", ""], ["Posse de bola", "%"], ["Cruzamentos", ""]];
  const statGrid = el("div", { class: "form-grid" });
  const statInputs = {};
  statDefs.forEach(([k, hint]) => {
    const ti = el("input", { type: "number", step: hint === "%" ? "1" : "1", placeholder: hint === "%" ? "% ex: 55" : state.data.meta.clube });
    const ci = el("input", { type: "number", step: "1", placeholder: hint === "%" ? "% ex: 45" : "adversário" });
    statInputs[k] = { ti, ci, isPct: hint === "%" };
    const wrap = el("div", {},
      el("label", {}, k + (hint === "%" ? " (%)" : "")),
      el("div", { style: "display:grid;grid-template-columns:1fr 1fr;gap:8px" }, ti, ci));
    statGrid.append(wrap);
  });
  form.append(statGrid);
  form.append(el("p", { class: "hint" }, `Esquerda = ${state.data.meta.clube} · Direita = adversário. Posse de bola em % (ex: 55 e 45).`));

  // Players
  form.append(el("div", { class: "section-title" }, "Jogadores (marca os que jogaram)"));
  const pcols = [["minutos", "Min"], ["golos", "G"], ["assistencias", "A"], ["remates", "Rem"], ["desarmes", "Des"], ["defesas", "Def"], ["passeFinalizacao", "PF"], ["faltas", "Flt"], ["passesErrados", "PE"], ["perdasBola", "PB"], ["driblesBemSucedidos", "DB"], ["driblesFalhados", "DF"], ["cruzamentosBemSucedidos", "CB"], ["cruzamentosFalhados", "CF"]];
  const pt = el("table", { class: "pstat-table" });
  const ph = el("tr", {}, el("th", {}, "Conv."), el("th", {}, "Jogador"), el("th", {}, "Tit."));
  pcols.forEach((c) => ph.append(el("th", { class: "num" }, c[1])));
  pt.append(el("thead", {}, ph));
  const playerRows = [];
  L.jogadores.forEach((nome) => {
    const conv = el("input", { type: "checkbox" });
    const tit = el("input", { type: "checkbox" });
    const inputs = {};
    const tr = el("tr", {}, el("td", {}, conv), el("td", {}, nome), el("td", {}, tit));
    pcols.forEach((c) => {
      const inp = el("input", { type: "number", min: "0", style: "width:56px" });
      inputs[c[0]] = inp;
      tr.append(el("td", { class: "num" }, inp));
    });
    pt.append(tr);
    playerRows.push({ nome, conv, tit, inputs });
  });
  form.append(tableScroll(pt));
  form.append(el("p", { class: "hint" }, "Só os jogadores com 'Conv.' marcado são guardados. Deixa os campos vazios como 0."));

  // Events
  form.append(el("div", { class: "section-title" }, "Eventos do jogo (opcional)"));
  const evWrap = el("div");
  const addEventRow = (acao = "", jogador = "", minuto = "") => {
    const aSel = selectFrom(L.acontecimentos, "Ação", acao);
    const jSel = selectFrom(["", ...L.jogadores], "Jogador (opcional)", jogador);
    const mIn = el("input", { type: "number", min: "0", max: "120", placeholder: "Min.", value: minuto, style: "width:72px", title: "Minuto (obrigatório nos golos)" });
    const del = el("button", { class: "btn ghost small", type: "button" }, "✕");
    const row = el("div", { class: "event-row" }, aSel, jSel, mIn, del);
    del.addEventListener("click", () => row.remove());
    evWrap.append(row);
  };
  form.append(evWrap);
  const addBtn = el("button", { class: "btn ghost small", type: "button", onclick: () => addEventRow() }, "+ Adicionar evento");
  form.append(el("div", { class: "btnrow" }, addBtn));

  // Actions
  const msg = el("p", { class: "hint" });
  const collect = () => {
    const numero = +numInput.value;
    const adversario = advSel.value;
    if (!adversario) { throw new Error("Escolhe o adversário."); }
    const matchStats = {};
    for (const [k, o] of Object.entries(statInputs)) {
      let t = o.ti.value === "" ? null : +o.ti.value;
      let c = o.ci.value === "" ? null : +o.ci.value;
      if (o.isPct) { t = t == null ? null : t / 100; c = c == null ? null : c / 100; }
      matchStats[k] = { tigres: t, adversario: c };
    }
    const players = playerRows.filter((r) => r.conv.checked).map((r) => {
      const o = { nome: r.nome, titular: r.tit.checked };
      for (const [k, inp] of Object.entries(r.inputs)) o[k] = inp.value === "" ? 0 : +inp.value;
      return o;
    });
    const eventos = $$(".event-row", evWrap).map((row) => {
      const [a, j] = $$("select", row);
      const m = $("input", row).value;
      if (!a.value) return null;
      const e = { acao: a.value, jogador: j.value || null };
      if (m !== "") e.minuto = +m;
      return e;
    }).filter(Boolean);
    return { numero, equipa: state.data.meta.clube, adversario, nrJogadores: +nrJog.value, tatica: tatica.value, matchStats, players, eventos };
  };

  const saveGh = el("button", { class: "btn", type: "button" }, "Guardar e partilhar");
  const saveLocal = el("button", { class: "btn ghost", type: "button" }, "Guardar só neste browser");
  const exp = el("button", { class: "btn ghost", type: "button" }, "Exportar Excel");
  const settingsBtn = el("button", { class: "btn ghost small", type: "button" }, "⚙ Definições / Token");

  saveGh.addEventListener("click", async () => {
    try {
      const j = collect();
      upsertJornada(j);
      msg.textContent = "A guardar no GitHub…";
      await saveToGitHub(state.data, `Jornada ${j.numero} vs ${j.adversario}`);
      state.source = "github";
      msg.textContent = "✅ Guardado e partilhado! Os teus amigos já veem a jornada.";
      state.view = "jornadas"; render();
    } catch (e) {
      // reverte se falhou o commit
      msg.style.color = "var(--loss)"; msg.textContent = "❌ " + e.message;
    }
  });
  saveLocal.addEventListener("click", () => {
    try {
      const j = collect(); upsertJornada(j);
      localStorage.setItem("tigres_cache", JSON.stringify(state.data));
      state.source = "local";
      state.view = "jornadas"; render();
    } catch (e) { msg.style.color = "var(--loss)"; msg.textContent = "❌ " + e.message; }
  });
  exp.addEventListener("click", () => { try { collect(); } catch {} exportExcel(); });
  settingsBtn.addEventListener("click", openSettingsModal);

  form.append(el("div", { class: "btnrow" }, saveGh, saveLocal, exp, settingsBtn), msg);
  app.append(form);
}

function upsertJornada(j) {
  const idx = state.data.jornadas.findIndex((x) => x.numero === j.numero);
  if (idx >= 0) state.data.jornadas[idx] = j; else state.data.jornadas.push(j);
  state.data.jornadas.sort((a, b) => a.numero - b.numero);
  state.data.meta.atualizado = new Date().toISOString();
}

function openSettingsModal() {
  const b = $("#modalBody"); b.innerHTML = "";
  b.append(el("h2", {}, "Definições"));
  b.append(el("div", { class: "note", html: `<strong>Repositório:</strong> ${ghConfigured() ? CONFIG.githubOwner + "/" + CONFIG.githubRepo : "❌ não configurado (edita CONFIG no ficheiro app.js)"}` }));
  b.append(el("label", {}, "Token do GitHub (fica guardado só neste browser)"));
  const tok = el("input", { type: "password", value: getToken(), placeholder: "github_pat_..." });
  b.append(tok);
  b.append(el("p", { class: "hint", html: "Cria em GitHub → Settings → Developer settings → Fine-grained tokens, com permissão <strong>Contents: Read and write</strong> só neste repositório. Sem token consegues ver tudo, mas não gravar." }));
  const save = el("button", { class: "btn", onclick: () => { setToken(tok.value.trim()); closeModal(); } }, "Guardar token");
  const clear = el("button", { class: "btn danger", onclick: () => { localStorage.removeItem("tigres_gh_token"); closeModal(); } }, "Apagar token");
  b.append(el("div", { class: "btnrow" }, save, clear));
  showModal();
}

/* ================= helpers UI ================= */
function tableScroll(table) {
  return el("div", { class: "table-scroll" }, table);
}
function field(label, input) { return el("div", {}, el("label", {}, label), input); }
function selectFrom(arr, ph, val = "") {
  const s = el("select");
  if (ph) s.append(el("option", { value: "" }, ph));
  arr.forEach((o) => s.append(el("option", { value: o, ...(o === val ? { selected: "selected" } : {}) }, o || "—")));
  s.value = val;
  return s;
}
function showModal() { $("#modalBackdrop").hidden = false; }
function closeModal() { $("#modalBackdrop").hidden = true; }

/* menu lateral (mobile) */
function openNav() { $("#nav").classList.add("open"); $("#navBackdrop").hidden = false; }
function closeNav() { $("#nav").classList.remove("open"); $("#navBackdrop").hidden = true; }

/* ================= boot ================= */
async function boot() {
  try {
    state.data = await loadData();
  } catch (e) {
    $("#app").innerHTML = `<div class="empty">Erro ao carregar dados: ${e.message}</div>`;
    return;
  }
  $$(".tab").forEach((t) => t.addEventListener("click", () => { state.view = t.dataset.view; closeNav(); render(); }));
  $("#modalClose").addEventListener("click", closeModal);
  $("#modalBackdrop").addEventListener("click", (e) => { if (e.target.id === "modalBackdrop") closeModal(); });
  $("#menuBtn").addEventListener("click", openNav);
  $("#navClose").addEventListener("click", closeNav);
  $("#navBackdrop").addEventListener("click", closeNav);
  render();
}
boot();
