// ================================================================
//  app.js — Painel Android · GitHub Pages + Firebase Firestore
// ================================================================
import { firebaseConfig } from "./firebase-config.js";
import { initializeApp }  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc,
  deleteDoc, query, where, orderBy, writeBatch, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged,
  updatePassword
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// ── Init Firebase ────────────────────────────────────────────────
const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);

// ── Estado global ────────────────────────────────────────────────
const S = {
  user: null,       // { uid, username, role, canUpload, hasRecharge, expiryDate }
  codes: [],
  configs: [],
  users: [],
  notifs: [],
  transfers: [],
  page: "dashboard",
  codesPage: 1,
  codesPerPage: 50,
  codesSearch: "",
  selectedCodes: [],
};

// ── Elementos DOM ────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const E = {};
function initElements() {
  E.loading   = $("loading-overlay");
  E.loginBox  = $("login-container");
  E.panel     = $("panel-container");
  E.loginForm = $("login-form");
  E.loginErr  = $("login-error");
  E.logoutBtn = $("logout-btn");
  E.main      = $("main-content");
  E.nav       = $("sidebar-nav");
  E.userDisp  = $("username-display");
  E.title     = $("panel-title");
  E.titleMob  = $("panel-title-mobile");
  E.toast     = $("toast");
  E.modal     = $("modal-container");
  E.codesN    = $("codes-count-value");
  E.menuBtn   = $("mobile-menu-btn");
  E.overlay   = $("mobile-overlay");
  E.sidebar   = $("sidebar");
}

// ── UI helpers ───────────────────────────────────────────────────
const UI = {
  load: (v) => E.loading.classList.toggle("hidden", !v),

  toast(msg, ms = 3500) {
    E.toast.textContent = msg;
    E.toast.classList.remove("opacity-0","translate-y-10");
    clearTimeout(UI._t);
    UI._t = setTimeout(() => E.toast.classList.add("opacity-0","translate-y-10"), ms);
  },

  modal({ title, body, footer, onRender }) {
    E.modal.innerHTML = `
      <div class="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-full max-w-lg mx-auto p-6 max-h-[90vh] overflow-y-auto scale-95 transition-transform duration-200">
        <h3 class="text-lg font-semibold text-white mb-4">${title}</h3>
        <div class="mb-5">${body}</div>
        <div class="flex justify-end gap-3">${footer}</div>
      </div>`;
    E.modal.classList.remove("hidden");
    setTimeout(() => E.modal.querySelector("div").classList.remove("scale-95"), 10);
    if (onRender) onRender(E.modal);
  },

  closeModal() {
    const d = E.modal.querySelector("div");
    if (d) d.classList.add("scale-95");
    setTimeout(() => { E.modal.classList.add("hidden"); E.modal.innerHTML = ""; }, 200);
  },

  confirm(msg, onYes) {
    UI.modal({
      title: "Confirmar",
      body: `<p class="text-slate-300 text-sm">${msg}</p>`,
      footer: `<button class="c-no px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg text-sm text-white">Cancelar</button>
               <button class="c-yes px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm">Confirmar</button>`,
      onRender(m) {
        m.querySelector(".c-yes").onclick = () => { UI.closeModal(); onYes(); };
        m.querySelector(".c-no").onclick  = UI.closeModal;
      }
    });
  },

  updateCount() {
    E.codesN.textContent = S.codes.filter(c => c.status === "Indisponível").length;
  },

  closeSidebar() {
    E.sidebar.classList.remove("open");
    E.overlay.classList.add("hidden");
  },

  inp: (label, type = "text", val = "", placeholder = "") =>
    `<div><label class="block text-sm text-slate-300 mb-1">${label}</label>
     <input type="${type}" value="${val}" placeholder="${placeholder}"
       class="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"/></div>`,

  sel: (label, opts, val = "") =>
    `<div><label class="block text-sm text-slate-300 mb-1">${label}</label>
     <select class="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none">
       ${opts.map(o => `<option value="${o.v}" ${o.v==val?"selected":""}>${o.l}</option>`).join("")}
     </select></div>`,
};

// ── Firestore helpers ────────────────────────────────────────────
const DB = {
  async loadAll() {
    const uid  = S.user.uid;
    const role = S.user.role;

    // Códigos do usuário
    const cSnap = await getDocs(query(collection(db,"codes"), where("ownerId","==",uid)));
    S.codes = cSnap.docs.map(d => ({ id:d.id, ...d.data() }));

    // Configs do usuário
    const cfSnap = await getDocs(query(collection(db,"configs"), where("ownerId","==",uid)));
    S.configs = cfSnap.docs.map(d => ({ id:d.id, ...d.data() }));

    // Notificações (todos)
    const nSnap = await getDocs(query(collection(db,"notifications"), orderBy("createdAt","desc")));
    S.notifs = nSnap.docs.map(d => ({ id:d.id, ...d.data() }));

    if (role === "superadmin" || role === "master") {
      const uQ = role === "superadmin"
        ? query(collection(db,"users"))
        : query(collection(db,"users"), where("parentId","==",uid));
      const uSnap = await getDocs(uQ);
      S.users = uSnap.docs.map(d => ({ id:d.id, ...d.data() })).filter(u => u.role !== "superadmin");

      const tSnap = await getDocs(query(collection(db,"transfers"), where("fromId","==",uid), orderBy("createdAt","desc")));
      S.transfers = tSnap.docs.map(d => ({ id:d.id, ...d.data() }));
    }
  },

  async saveCode(code) {
    const ref = code.id ? doc(db,"codes",code.id) : doc(collection(db,"codes"));
    const data = { ...code }; delete data.id;
    await setDoc(ref, data);
    return ref.id;
  },

  async deleteCode(id) { await deleteDoc(doc(db,"codes",id)); },

  async saveConfig(cfg) {
    const ref = cfg.id ? doc(db,"configs",cfg.id) : doc(collection(db,"configs"));
    const data = { ...cfg }; delete data.id;
    await setDoc(ref, data);
    return ref.id;
  },

  async deleteConfig(id) { await deleteDoc(doc(db,"configs",id)); },

  async saveUser(user) {
    const ref = user.id ? doc(db,"users",user.id) : doc(collection(db,"users"));
    const data = { ...user }; delete data.id;
    await setDoc(ref, data);
    return ref.id;
  },

  async deleteUser(id) { await deleteDoc(doc(db,"users",id)); },

  async saveNotif(n) {
    const ref = n.id ? doc(db,"notifications",n.id) : doc(collection(db,"notifications"));
    const data = { ...n }; delete data.id;
    await setDoc(ref, data);
    return ref.id;
  },

  async deleteNotif(id) { await deleteDoc(doc(db,"notifications",id)); },

  async transferCodes(toId, toUsername, codes) {
    const batch = writeBatch(db);
    codes.forEach(c => batch.update(doc(db,"codes",c.id), { ownerId: toId }));
    const tr = doc(collection(db,"transfers"));
    batch.set(tr, {
      fromId: S.user.uid, fromUsername: S.user.username,
      toId, toUsername, count: codes.length,
      createdAt: new Date().toISOString()
    });
    await batch.commit();
  }
};

// ── Auth ─────────────────────────────────────────────────────────
async function initAuth() {
  E.loginForm.addEventListener("submit", async e => {
    e.preventDefault();
    const username = E.loginForm.username.value.trim().toLowerCase();
    const password = E.loginForm.password.value;
    E.loginErr.classList.add("hidden");
    UI.load(true);
    try {
      await signInWithEmailAndPassword(auth, `${username}@panel.local`, password);
    } catch {
      E.loginErr.textContent = "Usuário ou senha inválidos.";
      E.loginErr.classList.remove("hidden");
    } finally { UI.load(false); }
  });

  E.logoutBtn.addEventListener("click", () =>
    UI.confirm("Deseja sair do painel?", () => signOut(auth))
  );

  E.menuBtn.addEventListener("click", () => {
    E.sidebar.classList.toggle("open");
    E.overlay.classList.toggle("hidden");
  });
  E.overlay.addEventListener("click", UI.closeSidebar);

  onAuthStateChanged(auth, async fbUser => {
    if (!fbUser) {
      S.user = null;
      E.loginBox.classList.remove("hidden");
      E.panel.classList.add("hidden");
      return;
    }
    UI.load(true);
    try {
      const snap = await getDoc(doc(db,"users",fbUser.uid));
      if (!snap.exists()) { await signOut(auth); return; }
      const data = snap.data();
      if (data.status === "inactive") { UI.toast("Conta desativada."); await signOut(auth); return; }
      if (data.expiryDate && new Date(data.expiryDate) < new Date()) { UI.toast("Conta expirada."); await signOut(auth); return; }
      S.user = { uid: fbUser.uid, ...data };
      await DB.loadAll();
      showPanel();
    } catch(err) {
      console.error(err);
      UI.toast("Erro ao carregar dados.");
    } finally { UI.load(false); }
  });
}

function showPanel() {
  E.loginBox.classList.add("hidden");
  E.panel.classList.remove("hidden");
  renderSidebar();
  renderPage();
}

// ── Sidebar ───────────────────────────────────────────────────────
function renderSidebar() {
  const { role, username, canUpload, hasRecharge } = S.user;
  const title = role === "superadmin" ? "Admin Panel" : role === "master" ? "Master Panel" : "Revenda Panel";
  E.title.textContent = title;
  E.titleMob.textContent = title;
  E.userDisp.textContent = username;
  UI.updateCount();

  const items = [
    { id:"dashboard",     icon:"layout-dashboard", label:"Dashboard",          show:true },
    { id:"codes",         icon:"key-round",         label:"Códigos",            show:true },
    { id:"configs",       icon:"file-cog",          label:"Arquivos .config",   show:!!canUpload },
    { id:"resellers",     icon:"users",             label:"Usuários",           show:role==="superadmin"||role==="master" },
    { id:"transfer",      icon:"send",              label:"Transferir Códigos", show:role==="superadmin"||(role==="master"&&hasRecharge) },
    { id:"notifications", icon:"bell",              label:"Notificações",       show:role==="superadmin" },
    { id:"download",      icon:"download",          label:"Baixar Ativador",    show:true },
    { id:"settings",      icon:"settings",          label:"Configurações",      show:true },
  ];

  E.nav.innerHTML = items.filter(i => i.show).map(i => `
    <button class="nav-item" data-page="${i.id}">
      <i data-lucide="${i.icon}" class="w-4 h-4 flex-shrink-0"></i>
      <span>${i.label}</span>
    </button>`).join("");

  E.nav.querySelectorAll("[data-page]").forEach(btn => {
    btn.addEventListener("click", () => {
      S.page = btn.dataset.page;
      S.codesPage = 1;
      renderPage();
      UI.closeSidebar();
    });
  });
  lucide.createIcons();
}

// ── Page router ───────────────────────────────────────────────────
function renderPage() {
  const pages = { dashboard, codes, configs, resellers, transfer, notifications, download, settings };
  E.main.innerHTML = (pages[S.page] || dashboard)();
  E.nav.querySelectorAll("[data-page]").forEach(b => b.classList.toggle("active", b.dataset.page === S.page));
  lucide.createIcons();
}

// ── Helpers ───────────────────────────────────────────────────────
function fmtDate(dt) {
  if (!dt) return "—";
  try { return new Date(dt).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",year:"2-digit",hour:"2-digit",minute:"2-digit"}); }
  catch { return dt; }
}
function genCode() { return Math.floor(10000000000 + Math.random()*90000000000).toString(); }
function badge(s) {
  const m = { "Indisponível":"badge-indisp","Ativo":"badge-ativo","Usado":"badge-usado","Disponível":"badge-ativo" };
  return `<span class="badge ${m[s]||"bg-slate-700 text-slate-300"}">${s}</span>`;
}
function card(icon, label, value, color="text-white") {
  return `<div class="bg-slate-800 rounded-xl p-5 border border-slate-700 flex items-center gap-4">
    <div class="bg-slate-700 p-3 rounded-lg"><i data-lucide="${icon}" class="w-5 h-5 ${color}"></i></div>
    <div><p class="text-xs text-slate-400">${label}</p><p class="text-2xl font-bold ${color}">${value}</p></div>
  </div>`;
}

// ── PAGE: Dashboard ───────────────────────────────────────────────
function dashboard() {
  const total  = S.codes.length;
  const ativos = S.codes.filter(c => c.status==="Ativo").length;
  const usados = S.codes.filter(c => c.status==="Usado").length;
  const indisp = S.codes.filter(c => c.status==="Indisponível").length;
  const activeNotifs = S.notifs.filter(n => n.status==="active");

  const notifsHtml = activeNotifs.map(n => {
    const colors = {
      info:    "border-blue-500 bg-blue-900/30 text-blue-300",
      warning: "border-yellow-500 bg-yellow-900/30 text-yellow-300",
      success: "border-green-500 bg-green-900/30 text-green-300",
      error:   "border-red-500 bg-red-900/30 text-red-300",
    };
    const cls = colors[n.type] || colors.info;
    return `<div class="border-l-4 p-4 rounded-lg ${cls}">
      <p class="font-semibold mb-1">${n.title}</p>
      <p class="text-sm opacity-90">${n.message}</p>
    </div>`;
  }).join("");

  return `
    <h1 class="text-3xl font-bold text-white mb-6">Dashboard</h1>
    ${notifsHtml ? `<div class="space-y-3 mb-6">${notifsHtml}</div>` : ""}
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      ${card("key-round","Total de Códigos",total)}
      ${card("zap","Ativos",ativos,"text-green-400")}
      ${card("check-circle","Usados",usados,"text-teal-400")}
      ${card("pause-circle","Indisponíveis",indisp,"text-orange-400")}
    </div>
    ${total > 0 ? `
    <div class="bg-slate-800 rounded-xl border border-slate-700 p-5">
      <p class="text-sm font-semibold text-white mb-3">Distribuição dos Códigos</p>
      <div class="w-full h-4 rounded-full overflow-hidden flex bg-slate-700">
        ${ativos > 0 ? `<div style="width:${(ativos/total*100).toFixed(1)}%" class="h-full bg-green-500" title="Ativos"></div>` : ""}
        ${usados > 0 ? `<div style="width:${(usados/total*100).toFixed(1)}%" class="h-full bg-teal-500" title="Usados"></div>` : ""}
        ${indisp > 0 ? `<div style="width:${(indisp/total*100).toFixed(1)}%" class="h-full bg-orange-500" title="Indisponíveis"></div>` : ""}
      </div>
      <div class="flex flex-wrap gap-4 mt-3 text-xs text-slate-400">
        <span><span class="inline-block w-3 h-3 rounded-full bg-green-500 mr-1"></span>Ativos: <strong class="text-green-400">${ativos}</strong></span>
        <span><span class="inline-block w-3 h-3 rounded-full bg-teal-500 mr-1"></span>Usados: <strong class="text-teal-400">${usados}</strong></span>
        <span><span class="inline-block w-3 h-3 rounded-full bg-orange-500 mr-1"></span>Indisponíveis: <strong class="text-orange-400">${indisp}</strong></span>
      </div>
    </div>` : ""}`;
}

// ── PAGE: Códigos ─────────────────────────────────────────────────
function codes() {
  const filtered = S.codes.filter(c => {
    const t = S.codesSearch.toLowerCase();
    return c.code.toLowerCase().includes(t) || c.configFile.toLowerCase().includes(t);
  }).reverse();

  const totalPages = Math.ceil(filtered.length / S.codesPerPage);
  const start = (S.codesPage - 1) * S.codesPerPage;
  const paged = filtered.slice(start, start + S.codesPerPage);

  const rows = paged.map(c => `
    <tr class="border-b border-slate-700 hover:bg-slate-700/30">
      <td class="p-3 font-mono text-sm text-white">${c.code}</td>
      <td class="p-3 text-xs text-slate-400">${c.configFile}</td>
      <td class="p-3">${badge(c.status)}</td>
      <td class="p-3 text-xs text-slate-400">${fmtDate(c.createdAt)}</td>
      <td class="p-3 text-xs">
        ${c.status==="Usado" && c.usedAt
          ? `<div class="text-green-400">${fmtDate(c.usedAt)}</div>${c.usedByIP?`<div class="text-slate-500">IP: ${c.usedByIP}</div>`:""}`
          : '<span class="text-slate-600">—</span>'}
      </td>
      <td class="p-3 text-right whitespace-nowrap">
        ${c.status==="Ativo" ? `
          <button data-code="${c.code}" class="action-btn btn-copy-51 text-blue-400 hover:bg-blue-900/30" title="Copiar instruções v5.1"><i data-lucide="clipboard-copy" class="w-4 h-4"></i></button>
          <button data-code="${c.code}" class="action-btn btn-copy-52 text-purple-400 hover:bg-purple-900/30" title="Copiar instruções v5.2"><i data-lucide="clipboard-list" class="w-4 h-4"></i></button>
          <button data-code="${c.code}" class="action-btn btn-copy-54 text-pink-400 hover:bg-pink-900/30" title="Copiar instruções v5.4"><i data-lucide="clipboard-check" class="w-4 h-4"></i></button>
          <button data-code="${c.code}" class="action-btn btn-deactivate text-orange-400 hover:bg-orange-900/30" title="Tornar indisponível"><i data-lucide="pause-circle" class="w-4 h-4"></i></button>
        ` : ""}
        ${c.status==="Indisponível" ? `
          <button data-code="${c.code}" class="action-btn btn-activate text-green-400 hover:bg-green-900/30" title="Ativar"><i data-lucide="play" class="w-4 h-4"></i></button>
        ` : ""}
        ${c.status==="Usado" && (!c.reactivationCount || c.reactivationCount < 1) ? `
          <button data-code="${c.code}" class="action-btn btn-reactivate text-yellow-400 hover:bg-yellow-900/30" title="Reativar"><i data-lucide="rotate-ccw" class="w-4 h-4"></i></button>
        ` : ""}
        <button data-code="${c.code}" class="action-btn btn-delete text-red-400 hover:bg-red-900/30" title="Excluir"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
      </td>
    </tr>`).join("");

  const usedCount = S.codes.filter(c => c.status==="Usado").length;

  setTimeout(bindCodesEvents, 0);
  return `
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
      <h1 class="text-3xl font-bold text-white">Códigos</h1>
    </div>
    ${usedCount > 0 ? `
    <div class="bg-green-900/20 border-l-4 border-green-500 p-4 rounded-lg mb-4 flex flex-col md:flex-row items-center justify-between gap-3">
      <p class="text-sm text-white">Você tem <strong class="text-green-400">${usedCount} código(s) usado(s)</strong>. Limpe para liberar espaço.</p>
      <button id="btn-del-used" class="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 whitespace-nowrap">
        <i data-lucide="trash-2" class="w-4 h-4"></i> Apagar Todos Usados
      </button>
    </div>` : ""}
    <div class="mb-4 relative">
      <input id="search-codes" type="text" placeholder="Pesquisar por código ou arquivo..." value="${S.codesSearch}"
        class="search-input pl-10"/>
      <i data-lucide="search" class="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2"></i>
    </div>
    <div class="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
      <div class="tbl-wrap">
        <table class="w-full text-sm">
          <thead><tr class="text-left text-slate-400 text-xs uppercase">
            <th class="p-3">Código</th><th class="p-3">Arquivo</th><th class="p-3">Status</th>
            <th class="p-3">Criado em</th><th class="p-3">Ativado pelo cliente</th><th class="p-3 text-right">Ações</th>
          </tr></thead>
          <tbody>${rows || '<tr><td colspan="6" class="p-8 text-center text-slate-500">Nenhum código cadastrado</td></tr>'}</tbody>
        </table>
      </div>
      ${totalPages > 1 ? `
      <div class="bg-slate-700/50 p-4 flex justify-between items-center border-t border-slate-700 text-sm">
        <span class="text-slate-400">Mostrando ${start+1}–${Math.min(start+S.codesPerPage,filtered.length)} de ${filtered.length}</span>
        <div class="flex gap-2">
          <button id="pg-prev" ${S.codesPage===1?"disabled":""} class="px-3 py-1.5 bg-slate-700 rounded-lg disabled:opacity-40">‹</button>
          <span class="px-3 py-1.5 text-white">Pág ${S.codesPage}/${totalPages}</span>
          <button id="pg-next" ${S.codesPage===totalPages?"disabled":""} class="px-3 py-1.5 bg-slate-700 rounded-lg disabled:opacity-40">›</button>
        </div>
      </div>` : ""}
    </div>`;
}

function bindCodesEvents() {
  const instrucoes = (code, ver) => {
    const links = { "5.1":["9618997","http://aftv.news/9618997"], "5.2":["3582656","http://aftv.news/3582656"], "5.4":["7383464","http://aftv.news/7383464"] };
    const [dl, url] = links[ver];
    return `ATIVAR UNITV FREE (v${ver})\n\nBAIXAR O ATIVADOR:\nApp Downloader → Código: ${dl}\nOu URL: ${url}\n\n⚠️ DAR AS PERMISSÕES:\n1️⃣ Armazenamento → PERMITIR\n2️⃣ Instalar apps → PERMITIR\n\nATIVAR:\n1️⃣ Digite seu código de 11 dígitos\n2️⃣ Clique em ATIVAR e aguarde\n3️⃣ Instale o UniTV Free quando pedir\n4️⃣ Atualize o app quando abrir\n5️⃣ Pronto! 📺🍿\n\nCódigo (uso único):\n${code}`;
  };

  document.querySelectorAll(".btn-copy-51").forEach(b => b.addEventListener("click", () => {
    navigator.clipboard.writeText(instrucoes(b.dataset.code,"5.1")); UI.toast("Instruções v5.1 copiadas!");
  }));
  document.querySelectorAll(".btn-copy-52").forEach(b => b.addEventListener("click", () => {
    navigator.clipboard.writeText(instrucoes(b.dataset.code,"5.2")); UI.toast("Instruções v5.2 copiadas!");
  }));
  document.querySelectorAll(".btn-copy-54").forEach(b => b.addEventListener("click", () => {
    navigator.clipboard.writeText(instrucoes(b.dataset.code,"5.4")); UI.toast("Instruções v5.4 copiadas!");
  }));

  document.querySelectorAll(".btn-activate").forEach(b => b.addEventListener("click", () => {
    UI.confirm(`Ativar código "${b.dataset.code}"?`, async () => {
      const c = S.codes.find(x => x.code===b.dataset.code);
      if (!c) return;
      c.status = "Ativo"; c.activatedAt = new Date().toISOString();
      await DB.saveCode(c); UI.updateCount(); renderPage(); UI.toast("Código ativado!");
    });
  }));

  document.querySelectorAll(".btn-deactivate").forEach(b => b.addEventListener("click", () => {
    UI.confirm(`Tornar "${b.dataset.code}" indisponível?`, async () => {
      const c = S.codes.find(x => x.code===b.dataset.code);
      if (!c) return;
      c.status = "Indisponível"; delete c.activatedAt;
      await DB.saveCode(c); UI.updateCount(); renderPage(); UI.toast("Código pausado.");
    });
  }));

  document.querySelectorAll(".btn-reactivate").forEach(b => b.addEventListener("click", () => {
    UI.confirm(`Reativar código "${b.dataset.code}"?`, async () => {
      const c = S.codes.find(x => x.code===b.dataset.code);
      if (!c) return;
      c.status = "Ativo"; c.activatedAt = new Date().toISOString();
      delete c.usedAt; delete c.usedByIP;
      c.reactivationCount = (c.reactivationCount||0) + 1;
      await DB.saveCode(c); UI.updateCount(); renderPage(); UI.toast("Código reativado!");
    });
  }));

  document.querySelectorAll(".btn-delete").forEach(b => b.addEventListener("click", () => {
    UI.confirm(`Excluir código "${b.dataset.code}"?`, async () => {
      const c = S.codes.find(x => x.code===b.dataset.code);
      if (!c) return;
      await DB.deleteCode(c.id);
      S.codes = S.codes.filter(x => x.id !== c.id);
      S.configs = S.configs.filter(x => x.name !== c.configFile);
      UI.updateCount(); renderPage(); UI.toast("Código excluído!");
    });
  }));

  $("btn-del-used")?.addEventListener("click", () => {
    const used = S.codes.filter(c => c.status==="Usado");
    UI.confirm(`Apagar ${used.length} código(s) usado(s)?`, async () => {
      for (const c of used) await DB.deleteCode(c.id);
      S.codes = S.codes.filter(c => c.status!=="Usado");
      UI.updateCount(); renderPage(); UI.toast(`${used.length} código(s) removido(s)!`);
    });
  });

  $("search-codes")?.addEventListener("input", e => {
    S.codesSearch = e.target.value; S.codesPage = 1; renderPage();
  });
  $("pg-prev")?.addEventListener("click", () => { S.codesPage--; renderPage(); });
  $("pg-next")?.addEventListener("click", () => { S.codesPage++; renderPage(); });
}

// ── PAGE: Configs (.config) ───────────────────────────────────────
function configs() {
  if (!S.user.canUpload) return `
    <div class="flex flex-col items-center justify-center h-64 text-slate-500">
      <i data-lucide="lock" class="w-12 h-12 mb-3"></i>
      <p>Apenas usuários com permissão podem enviar arquivos .config</p>
    </div>`;

  const rows = S.configs.map(f => `
    <tr class="border-b border-slate-700 hover:bg-slate-700/30">
      <td class="p-3 text-sm text-white">${f.name}</td>
      <td class="p-3 text-xs text-slate-400">${f.uploadDate||"—"}</td>
      <td class="p-3 text-right">
        <button data-file="${f.name}" class="action-btn btn-del-cfg text-red-400 hover:bg-red-900/30"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
      </td>
    </tr>`).join("");

  setTimeout(() => {
    $("btn-upload-cfg")?.addEventListener("click", () => {
      UI.modal({
        title: "Enviar Arquivo(s) .config",
        body: `<div class="space-y-3">
          <div><label class="block text-sm text-slate-300 mb-1">Arquivo(s) .config</label>
          <input id="cfg-file-inp" type="file" accept=".config" multiple class="w-full text-sm text-slate-300 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white hover:file:bg-blue-700"/></div>
          <p class="text-xs text-slate-500">Máx. 50 arquivos por envio</p>
        </div>`,
        footer: `<button class="c-cancel px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg text-sm text-white">Cancelar</button>
                 <button class="c-send px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm">Enviar</button>`,
        onRender(m) {
          m.querySelector(".c-cancel").onclick = UI.closeModal;
          m.querySelector(".c-send").onclick = async () => {
            const files = m.querySelector("#cfg-file-inp").files;
            if (!files.length) { UI.toast("Selecione ao menos um arquivo."); return; }
            UI.load(true);
            let count = 0;
            for (const file of Array.from(files).slice(0,50)) {
              const content = await file.text();
              const name = file.name;
              const exists = S.configs.some(c => c.name===name);
              const finalName = exists ? name.replace(".config",`_${Date.now()}.config`) : name;
              const code = genCode();
              const cfgObj = { name:finalName, content, uploadDate:new Date().toLocaleString("pt-BR"), ownerId:S.user.uid };
              const codeObj = { code, configFile:finalName, status:"Indisponível", ownerId:S.user.uid, createdAt:new Date().toISOString() };
              const cfgId = await DB.saveConfig(cfgObj);
              const codeId = await DB.saveCode(codeObj);
              cfgObj.id = cfgId; codeObj.id = codeId;
              S.configs.push(cfgObj); S.codes.push(codeObj);
              count++;
            }
            UI.load(false); UI.closeModal(); UI.updateCount(); renderPage();
            UI.toast(`${count} arquivo(s) enviado(s)!`);
          };
        }
      });
    });

    document.querySelectorAll(".btn-del-cfg").forEach(b => b.addEventListener("click", () => {
      UI.confirm(`Excluir arquivo "${b.dataset.file}"?`, async () => {
        const cfg = S.configs.find(c => c.name===b.dataset.file);
        if (!cfg) return;
        await DB.deleteConfig(cfg.id);
        const relCodes = S.codes.filter(c => c.configFile===b.dataset.file);
        for (const c of relCodes) await DB.deleteCode(c.id);
        S.configs = S.configs.filter(c => c.name!==b.dataset.file);
        S.codes   = S.codes.filter(c => c.configFile!==b.dataset.file);
        UI.updateCount(); renderPage(); UI.toast("Arquivo excluído!");
      });
    }));
  }, 0);

  return `
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-3xl font-bold text-white">Arquivos .config</h1>
      <button id="btn-upload-cfg" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm">
        <i data-lucide="upload" class="w-4 h-4"></i> Enviar Arquivo
      </button>
    </div>
    <div class="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
      <div class="tbl-wrap">
        <table class="w-full text-sm">
          <thead><tr class="text-left text-slate-400 text-xs uppercase">
            <th class="p-3">Nome</th><th class="p-3">Data de Envio</th><th class="p-3 text-right">Ações</th>
          </tr></thead>
          <tbody>${rows||'<tr><td colspan="3" class="p-8 text-center text-slate-500">Nenhum arquivo enviado</td></tr>'}</tbody>
        </table>
      </div>
    </div>`;
}

// ── PAGE: Usuários (Revendedores) ─────────────────────────────────
function resellers() {
  const role = S.user.role;
  if (role !== "superadmin" && role !== "master") return '<p class="text-slate-400">Acesso negado.</p>';

  const rows = S.users.map(u => {
    const expired = u.expiryDate && new Date(u.expiryDate) < new Date();
    const statusColor = u.status==="active" && !expired ? "green" : "red";
    const statusText  = expired ? "Expirado" : u.status==="active" ? "Ativo" : "Inativo";
    const roleBadge   = u.role==="master"
      ? `<span class="badge bg-purple-900 text-purple-300">Master</span>`
      : `<span class="badge bg-blue-900 text-blue-300">Revenda</span>`;
    return `
      <tr class="border-b border-slate-700 hover:bg-slate-700/30">
        <td class="p-3 text-sm text-white">${u.username}</td>
        <td class="p-3">${roleBadge}</td>
        <td class="p-3 text-xs text-slate-400">${u.expiryDate ? new Date(u.expiryDate).toLocaleDateString("pt-BR") : "Sem limite"}</td>
        <td class="p-3"><span class="badge bg-${statusColor}-900 text-${statusColor}-300">${statusText}</span></td>
        <td class="p-3 text-right whitespace-nowrap">
          <button data-uid="${u.id}" class="action-btn btn-edit-user text-blue-400 hover:bg-blue-900/30"><i data-lucide="edit" class="w-4 h-4"></i></button>
          <button data-uid="${u.id}" class="action-btn btn-toggle-user text-${u.status==="active"?"red":"green"}-400 hover:bg-slate-700"><i data-lucide="${u.status==="active"?"user-x":"user-check"}" class="w-4 h-4"></i></button>
          <button data-uid="${u.id}" class="action-btn btn-del-user text-red-400 hover:bg-red-900/30"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
        </td>
      </tr>`;
  }).join("");

  setTimeout(() => {
    $("btn-add-user")?.addEventListener("click", () => openUserModal(null));
    document.querySelectorAll(".btn-edit-user").forEach(b => b.addEventListener("click", () => {
      openUserModal(S.users.find(u => u.id===b.dataset.uid));
    }));
    document.querySelectorAll(".btn-toggle-user").forEach(b => b.addEventListener("click", async () => {
      const u = S.users.find(x => x.id===b.dataset.uid);
      if (!u) return;
      u.status = u.status==="active" ? "inactive" : "active";
      await DB.saveUser(u); renderPage();
    }));
    document.querySelectorAll(".btn-del-user").forEach(b => b.addEventListener("click", () => {
      UI.confirm("Excluir usuário?", async () => {
        await DB.deleteUser(b.dataset.uid);
        S.users = S.users.filter(u => u.id!==b.dataset.uid);
        renderPage(); UI.toast("Usuário excluído!");
      });
    }));
  }, 0);

  return `
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-3xl font-bold text-white">Usuários</h1>
      <button id="btn-add-user" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm">
        <i data-lucide="user-plus" class="w-4 h-4"></i> Adicionar
      </button>
    </div>
    <div class="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
      <div class="tbl-wrap">
        <table class="w-full text-sm">
          <thead><tr class="text-left text-slate-400 text-xs uppercase">
            <th class="p-3">Usuário</th><th class="p-3">Tipo</th><th class="p-3">Validade</th><th class="p-3">Status</th><th class="p-3 text-right">Ações</th>
          </tr></thead>
          <tbody>${rows||'<tr><td colspan="5" class="p-8 text-center text-slate-500">Nenhum usuário cadastrado</td></tr>'}</tbody>
        </table>
      </div>
    </div>`;
}

function openUserModal(user) {
  const isNew = !user;
  const isSA  = S.user.role === "superadmin";
  UI.modal({
    title: isNew ? "Adicionar Usuário" : `Editar: ${user.username}`,
    body: `<div class="space-y-3">
      ${UI.inp("Usuário","text",user?.username||"")}
      ${UI.inp("Senha (deixe em branco para manter)","password","")}
      ${isSA ? UI.sel("Tipo",[{v:"reseller",l:"Revendedor"},{v:"master",l:"Master"}],user?.role||"reseller") : ""}
      ${UI.sel("Validade",[{v:"1",l:"1 mês"},{v:"3",l:"3 meses"},{v:"6",l:"6 meses"},{v:"12",l:"12 meses"},{v:"0",l:"Sem limite"}],"3")}
      <label class="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
        <input type="checkbox" ${user?.canUpload?"checked":""} id="chk-upload" class="w-4 h-4"/>
        Permitir envio de arquivos .config
      </label>
    </div>`,
    footer: `<button class="c-cancel px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg text-sm text-white">Cancelar</button>
             <button class="c-save px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm">Salvar</button>`,
    onRender(m) {
      m.querySelector(".c-cancel").onclick = UI.closeModal;
      m.querySelector(".c-save").onclick = async () => {
        const inputs = m.querySelectorAll("input[type=text],input[type=password],select");
        const username = inputs[0].value.trim().toLowerCase();
        const password = inputs[1].value;
        const roleVal  = isSA ? inputs[2].value : (user?.role||"reseller");
        const validity = m.querySelector("select:last-of-type")?.value || "3";
        const canUpload = m.querySelector("#chk-upload").checked;
        if (!username) { UI.toast("Informe o usuário."); return; }
        if (isNew && !password) { UI.toast("Informe a senha."); return; }
        let expiryDate = null;
        if (validity !== "0") {
          expiryDate = new Date(Date.now() + parseInt(validity)*30*24*60*60*1000).toISOString().split("T")[0];
        }
        const obj = {
          ...(user||{}),
          username, role:roleVal, status:"active", canUpload, expiryDate,
          parentId: S.user.uid,
        };
        if (password) obj.password = password;
        if (isNew) obj.email = `${username}@panel.local`;
        UI.load(true);
        try {
          const id = await DB.saveUser(obj);
          if (isNew) { obj.id = id; S.users.push(obj); }
          else { const idx = S.users.findIndex(u => u.id===user.id); if (idx>=0) S.users[idx]=obj; }
          UI.closeModal(); renderPage(); UI.toast(isNew?"Usuário criado!":"Usuário atualizado!");
        } catch(e) { UI.toast("Erro ao salvar usuário."); console.error(e); }
        finally { UI.load(false); }
      };
    }
  });
}

// ── PAGE: Transferir Códigos ──────────────────────────────────────
function transfer() {
  const role = S.user.role;
  if (role!=="superadmin" && !(role==="master" && S.user.hasRecharge))
    return '<p class="text-slate-400">Acesso negado.</p>';

  const transferable = S.codes.filter(c => c.status==="Indisponível");
  const eligible = S.users.filter(u => role==="superadmin" ? true : u.parentId===S.user.uid);

  const codeRows = transferable.map(c => `
    <tr class="border-b border-slate-700">
      <td class="p-2 text-center"><input type="checkbox" class="tr-chk w-4 h-4" data-code="${c.code}"/></td>
      <td class="p-2 font-mono text-sm text-white">${c.code}</td>
      <td class="p-2 text-xs text-slate-400">${c.configFile}</td>
    </tr>`).join("");

  const userCards = eligible.map(u => `
    <div class="bg-slate-700 rounded-lg p-4 border border-slate-600 flex items-center justify-between">
      <div>
        <p class="font-semibold text-white text-sm">${u.username}</p>
        <p class="text-xs text-slate-400">${u.role==="master"?"Master":"Revendedor"}</p>
      </div>
      <button data-uid="${u.id}" data-uname="${u.username}" class="btn-send-to bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-sm flex items-center gap-1">
        <i data-lucide="send" class="w-3 h-3"></i> Enviar
      </button>
    </div>`).join("");

  const trRows = S.transfers.slice(0,20).map(t => `
    <tr class="border-b border-slate-700">
      <td class="p-3 text-xs text-slate-400">${fmtDate(t.createdAt)}</td>
      <td class="p-3 text-sm text-white">${t.fromUsername}</td>
      <td class="p-3 text-sm text-white">${t.toUsername}</td>
      <td class="p-3 text-center text-sm text-white">${t.count}</td>
    </tr>`).join("");

  setTimeout(() => {
    $("btn-sel-all")?.addEventListener("click", () => {
      document.querySelectorAll(".tr-chk").forEach(c => c.checked=true);
      updateSelCount();
    });
    $("btn-desel-all")?.addEventListener("click", () => {
      document.querySelectorAll(".tr-chk").forEach(c => c.checked=false);
      updateSelCount();
    });
    $("btn-sel-qty")?.addEventListener("click", () => {
      const qty = parseInt($("inp-qty")?.value)||0;
      let n=0;
      document.querySelectorAll(".tr-chk").forEach(c => { c.checked = n<qty; if(n<qty) n++; });
      updateSelCount();
    });
    document.querySelectorAll(".tr-chk").forEach(c => c.addEventListener("change", updateSelCount));
    document.querySelectorAll(".btn-send-to").forEach(b => b.addEventListener("click", () => {
      const selected = [...document.querySelectorAll(".tr-chk:checked")].map(c => c.dataset.code);
      if (!selected.length) { UI.toast("Selecione ao menos um código."); return; }
      UI.confirm(`Transferir ${selected.length} código(s) para ${b.dataset.uname}?`, async () => {
        const codes = S.codes.filter(c => selected.includes(c.code));
        UI.load(true);
        try {
          await DB.transferCodes(b.dataset.uid, b.dataset.uname, codes);
          S.codes = S.codes.filter(c => !selected.includes(c.code));
          S.transfers.unshift({ fromId:S.user.uid, fromUsername:S.user.username, toId:b.dataset.uid, toUsername:b.dataset.uname, count:codes.length, createdAt:new Date().toISOString() });
          UI.updateCount(); renderPage(); UI.toast("Transferência realizada!");
        } catch(e) { UI.toast("Erro na transferência."); console.error(e); }
        finally { UI.load(false); }
      });
    }));
  }, 0);

  return `
    <h1 class="text-3xl font-bold text-white mb-6">Transferir Códigos</h1>
    <div class="bg-slate-800 rounded-xl border border-slate-700 mb-6">
      <div class="p-4 border-b border-slate-700 flex flex-wrap gap-3 items-center">
        <h2 class="text-sm font-semibold text-white flex-1">Selecionar Códigos (${transferable.length} disponíveis)</h2>
        <div class="flex gap-2 items-center">
          <input id="inp-qty" type="number" min="1" placeholder="Qtd" class="search-input w-20 text-sm"/>
          <button id="btn-sel-qty" class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm">Selecionar</button>
          <button id="btn-sel-all" class="bg-slate-600 hover:bg-slate-500 text-white px-3 py-1.5 rounded-lg text-sm">Todos</button>
          <button id="btn-desel-all" class="bg-slate-600 hover:bg-slate-500 text-white px-3 py-1.5 rounded-lg text-sm">Limpar</button>
        </div>
        <span id="sel-count" class="text-sm text-orange-400 font-bold">0 selecionado(s)</span>
      </div>
      <div class="tbl-wrap" style="max-height:250px">
        <table class="w-full text-sm">
          <thead><tr class="text-left text-slate-400 text-xs uppercase">
            <th class="p-2 w-10"></th><th class="p-2">Código</th><th class="p-2">Arquivo</th>
          </tr></thead>
          <tbody>${codeRows||'<tr><td colspan="3" class="p-6 text-center text-slate-500">Nenhum código disponível</td></tr>'}</tbody>
        </table>
      </div>
    </div>
    <div class="bg-slate-800 rounded-xl border border-slate-700 mb-6 p-4">
      <h2 class="text-sm font-semibold text-white mb-3">Destinatário</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        ${userCards||'<p class="text-slate-500 text-sm col-span-3">Nenhum usuário disponível</p>'}
      </div>
    </div>
    <div class="bg-slate-800 rounded-xl border border-slate-700">
      <div class="p-4 border-b border-slate-700"><h2 class="text-sm font-semibold text-white">Histórico de Transferências</h2></div>
      <div class="tbl-wrap" style="max-height:200px">
        <table class="w-full text-sm">
          <thead><tr class="text-left text-slate-400 text-xs uppercase">
            <th class="p-3">Data</th><th class="p-3">De</th><th class="p-3">Para</th><th class="p-3 text-center">Qtd</th>
          </tr></thead>
          <tbody>${trRows||'<tr><td colspan="4" class="p-6 text-center text-slate-500">Nenhuma transferência</td></tr>'}</tbody>
        </table>
      </div>
    </div>`;
}

function updateSelCount() {
  const n = document.querySelectorAll(".tr-chk:checked").length;
  const el = $("sel-count");
  if (el) el.textContent = `${n} selecionado(s)`;
}

// ── PAGE: Notificações ────────────────────────────────────────────
function notifications() {
  if (S.user.role !== "superadmin") return '<p class="text-slate-400">Acesso negado.</p>';

  const rows = S.notifs.map(n => {
    const sc = n.status==="active" ? "green" : "gray";
    return `
      <tr class="border-b border-slate-700 hover:bg-slate-700/30">
        <td class="p-3 text-sm text-white">${n.title}</td>
        <td class="p-3 text-xs text-slate-400">${n.message.substring(0,60)}${n.message.length>60?"...":""}</td>
        <td class="p-3"><span class="badge bg-${sc}-900 text-${sc}-300">${n.status==="active"?"Ativa":"Inativa"}</span></td>
        <td class="p-3 text-right whitespace-nowrap">
          <button data-nid="${n.id}" class="action-btn btn-toggle-notif text-${n.status==="active"?"red":"green"}-400 hover:bg-slate-700"><i data-lucide="${n.status==="active"?"eye-off":"eye"}" class="w-4 h-4"></i></button>
          <button data-nid="${n.id}" class="action-btn btn-del-notif text-red-400 hover:bg-red-900/30"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
        </td>
      </tr>`;
  }).join("");

  setTimeout(() => {
    $("btn-add-notif")?.addEventListener("click", () => {
      UI.modal({
        title: "Nova Notificação",
        body: `<div class="space-y-3">
          ${UI.inp("Título","text","")}
          <div><label class="block text-sm text-slate-300 mb-1">Mensagem</label>
          <textarea rows="3" class="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 resize-none"></textarea></div>
          ${UI.sel("Tipo",[{v:"info",l:"Informação"},{v:"warning",l:"Aviso"},{v:"success",l:"Sucesso"},{v:"error",l:"Erro"}],"info")}
        </div>`,
        footer: `<button class="c-cancel px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg text-sm text-white">Cancelar</button>
                 <button class="c-save px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm">Criar</button>`,
        onRender(m) {
          m.querySelector(".c-cancel").onclick = UI.closeModal;
          m.querySelector(".c-save").onclick = async () => {
            const title   = m.querySelector("input").value.trim();
            const message = m.querySelector("textarea").value.trim();
            const type    = m.querySelector("select").value;
            if (!title||!message) { UI.toast("Preencha todos os campos."); return; }
            const n = { title, message, type, status:"active", createdAt:new Date().toISOString() };
            UI.load(true);
            try {
              const id = await DB.saveNotif(n);
              n.id = id; S.notifs.unshift(n);
              UI.closeModal(); renderPage(); UI.toast("Notificação criada!");
            } finally { UI.load(false); }
          };
        }
      });
    });

    document.querySelectorAll(".btn-toggle-notif").forEach(b => b.addEventListener("click", async () => {
      const n = S.notifs.find(x => x.id===b.dataset.nid);
      if (!n) return;
      n.status = n.status==="active" ? "inactive" : "active";
      await DB.saveNotif(n); renderPage();
    }));

    document.querySelectorAll(".btn-del-notif").forEach(b => b.addEventListener("click", () => {
      UI.confirm("Excluir notificação?", async () => {
        await DB.deleteNotif(b.dataset.nid);
        S.notifs = S.notifs.filter(n => n.id!==b.dataset.nid);
        renderPage(); UI.toast("Notificação excluída!");
      });
    }));
  }, 0);

  return `
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-3xl font-bold text-white">Notificações</h1>
      <button id="btn-add-notif" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm">
        <i data-lucide="plus" class="w-4 h-4"></i> Nova
      </button>
    </div>
    <div class="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
      <div class="tbl-wrap">
        <table class="w-full text-sm">
          <thead><tr class="text-left text-slate-400 text-xs uppercase">
            <th class="p-3">Título</th><th class="p-3">Mensagem</th><th class="p-3">Status</th><th class="p-3 text-right">Ações</th>
          </tr></thead>
          <tbody>${rows||'<tr><td colspan="4" class="p-8 text-center text-slate-500">Nenhuma notificação</td></tr>'}</tbody>
        </table>
      </div>
    </div>`;
}

// ── PAGE: Download ────────────────────────────────────────────────
function download() {
  const versions = [
    { label:"Ativador v5.1", color:"blue",  code:"9618997",  url:"http://aftv.news/9618997",  desc:"Versão Estável — recomendada" },
    { label:"Ativador v5.2", color:"green", code:"3582656",  url:"http://aftv.news/3582656",  desc:"Versão Intermediária" },
    { label:"Ativador v5.4", color:"pink",  code:"7383464",  url:"http://aftv.news/7383464",  desc:"Versão Mais Recente" },
  ];

  const cards = versions.map(v => `
    <div class="bg-slate-800 rounded-xl border border-slate-700 p-6">
      <h2 class="text-lg font-semibold text-white mb-1">${v.label}</h2>
      <p class="text-xs text-slate-400 mb-4">${v.desc}</p>
      <div class="space-y-3">
        <div class="bg-slate-700 rounded-lg p-3">
          <p class="text-xs text-slate-400 mb-1">Código App Downloader</p>
          <div class="flex items-center gap-2">
            <input type="text" value="${v.code}" readonly class="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-white font-mono font-bold text-lg focus:outline-none"/>
            <button onclick="navigator.clipboard.writeText('${v.code}');document.getElementById('toast').textContent='Código copiado!';document.getElementById('toast').classList.remove('opacity-0','translate-y-10');setTimeout(()=>document.getElementById('toast').classList.add('opacity-0','translate-y-10'),2500)"
              class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm">Copiar</button>
          </div>
        </div>
        <div class="bg-slate-700 rounded-lg p-3">
          <p class="text-xs text-slate-400 mb-1">URL de Download</p>
          <div class="flex items-center gap-2">
            <input type="text" value="${v.url}" readonly class="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none"/>
            <button onclick="navigator.clipboard.writeText('${v.url}');document.getElementById('toast').textContent='URL copiada!';document.getElementById('toast').classList.remove('opacity-0','translate-y-10');setTimeout(()=>document.getElementById('toast').classList.add('opacity-0','translate-y-10'),2500)"
              class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm">Copiar</button>
          </div>
        </div>
        <a href="${v.url}" target="_blank" class="block w-full text-center bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg text-sm font-semibold">
          Baixar ${v.label}
        </a>
      </div>
    </div>`).join("");

  return `
    <h1 class="text-3xl font-bold text-white mb-6">Baixar Ativador</h1>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">${cards}</div>
    <div class="bg-slate-800 rounded-xl border border-slate-700 p-5">
      <h3 class="text-red-400 font-semibold mb-3">⚠️ Não poste em grupos públicos — seu painel pode ser excluído!</h3>
      <ol class="list-decimal list-inside space-y-2 text-sm text-slate-300">
        <li>Instale o <strong>App Downloader</strong> no dispositivo Android</li>
        <li>Abra o App Downloader e insira o <strong>código</strong> da versão desejada</li>
        <li>Ou acesse a <strong>URL</strong> diretamente no navegador do dispositivo</li>
        <li>Aguarde o download e instale o ativador</li>
        <li>Abra o ativador, insira o código de 11 dígitos e clique em <strong>ATIVAR</strong></li>
      </ol>
    </div>`;
}

// ── PAGE: Configurações ───────────────────────────────────────────
function settings() {
  setTimeout(() => {
    $("btn-save-settings")?.addEventListener("click", async () => {
      const newPass    = $("inp-new-pass")?.value;
      const confirmPass = $("inp-confirm-pass")?.value;
      if (newPass) {
        if (newPass.length < 6) { UI.toast("Senha deve ter ao menos 6 caracteres."); return; }
        if (newPass !== confirmPass) { UI.toast("Senhas não coincidem."); return; }
        UI.load(true);
        try {
          await updatePassword(auth.currentUser, newPass);
          $("inp-new-pass").value = "";
          $("inp-confirm-pass").value = "";
          UI.toast("Senha alterada com sucesso!");
        } catch(e) {
          UI.toast("Erro ao alterar senha. Faça login novamente.");
          console.error(e);
        } finally { UI.load(false); }
      } else {
        UI.toast("Nenhuma alteração feita.");
      }
    });
  }, 0);

  return `
    <h1 class="text-3xl font-bold text-white mb-6">Configurações</h1>
    <div class="bg-slate-800 rounded-xl border border-slate-700 p-6 max-w-md">
      <h2 class="text-lg font-semibold text-white mb-4">Alterar Senha</h2>
      <div class="space-y-4">
        <div>
          <label class="block text-sm text-slate-300 mb-1">Usuário</label>
          <input type="text" value="${S.user.username}" disabled class="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-slate-400 text-sm cursor-not-allowed"/>
        </div>
        <div>
          <label class="block text-sm text-slate-300 mb-1">Nova Senha</label>
          <input id="inp-new-pass" type="password" placeholder="Mínimo 6 caracteres" class="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"/>
        </div>
        <div>
          <label class="block text-sm text-slate-300 mb-1">Confirmar Nova Senha</label>
          <input id="inp-confirm-pass" type="password" placeholder="Repita a nova senha" class="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"/>
        </div>
        <button id="btn-save-settings" class="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg font-semibold text-sm transition">Salvar Alterações</button>
      </div>
    </div>`;
}

// ── Start ─────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  initElements();
  initAuth();
});
