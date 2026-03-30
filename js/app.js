
// ============================================================
// CONFIG — preencha após criar o projeto no Supabase
// ============================================================
const SUPABASE_URL = 'https://tjtaubwtwppzoojnlsqy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqdGF1Ynd0d3Bwem9vam5sc3F5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5Mzk0MDIsImV4cCI6MjA4OTUxNTQwMn0.Bd87DtXycxnbtnElVrRzVMETTxoJHrlX8UgiuGe2fNA';
// Números admin (sem formatação, só dígitos)
const ADMIN_PHONES = ['48991520230'];
// ============================================================

const POSITIONS = ['Zagueiro','Meia','Atacante'];
const POS_TAG = {Zagueiro:'tag-zag',Meia:'tag-meia',Atacante:'tag-atk'};

const CARNE_SHEET_ROWS = [{"id": "2026-03-25|BAHIA|TROCINHO", "date": "2026-03-25", "a": "BAHIA", "b": "TROCINHO"}, {"id": "2026-04-01|DAVID|MATEUS", "date": "2026-04-01", "a": "DAVID", "b": "MATEUS"}, {"id": "2026-04-08|JÚNIOR|SAMUEL", "date": "2026-04-08", "a": "JÚNIOR", "b": "SAMUEL"}, {"id": "2026-04-15|BROCA|BROQUINHA", "date": "2026-04-15", "a": "BROCA", "b": "BROQUINHA"}, {"id": "2026-04-22|ANDRÉ|CAUÊ", "date": "2026-04-22", "a": "ANDRÉ", "b": "CAUÊ"}, {"id": "2026-04-29|GEDIMITO|VITOR", "date": "2026-04-29", "a": "GEDIMITO", "b": "VITOR"}, {"id": "2026-05-06|PANGA|ADRIEL", "date": "2026-05-06", "a": "PANGA", "b": "ADRIEL"}, {"id": "2026-05-13|SOLI|MALVADEZA", "date": "2026-05-13", "a": "SOLI", "b": "MALVADEZA"}, {"id": "2026-05-20|DIGÃO|GUILHERME", "date": "2026-05-20", "a": "DIGÃO", "b": "GUILHERME"}, {"id": "2026-05-27|ADRIANO|NINIU", "date": "2026-05-27", "a": "ADRIANO", "b": "NINIU"}, {"id": "2026-06-03|DICK|LUQUINHA", "date": "2026-06-03", "a": "DICK", "b": "LUQUINHA"}, {"id": "2026-06-10|WILLIAM|TELO", "date": "2026-06-10", "a": "WILLIAM", "b": "TELO"}, {"id": "2026-06-17|VINÍCIUS|PH", "date": "2026-06-17", "a": "VINÍCIUS", "b": "PH"}, {"id": "2026-06-24|CAETANO|PAULO", "date": "2026-06-24", "a": "CAETANO", "b": "PAULO"}];
const CARNE_STORAGE_KEY = 'harmonia_carne_schedule_v1';
let carneEditingId = null;
let carneSchedule = loadCarneSchedule();

let sb = null;
let currentPhone = null;
let currentPlayer = null;
let currentTab = 'home';
let editingPlayer = null;
let appData = { players:[], game:null, confirmations:[], notifications:[] };

function isConfigured(){
  return SUPABASE_URL.startsWith('https://') && SUPABASE_ANON_KEY.startsWith('eyJ');
}

// ---- TOAST ----
let toastTimer;
function toast(msg, type='ok'){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>t.classList.remove('show'), 3000);
}

// ---- INIT ----
async function init(){
  if(!isConfigured()){ renderSetup(); return; }
  try {
    sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const saved = sessionStorage.getItem('pelada_phone');
    if(saved){ currentPhone = saved; }
    await loadData();
    if(currentPhone){
      currentPlayer = appData.players.find(p=>p.phone===currentPhone);
      if(!currentPlayer){ currentPhone=null; sessionStorage.removeItem('pelada_phone'); }
    }
    if(!currentPhone){
      // Try passkey auto-login
      const didPasskey = await tryPasskeyLogin();
      if(!didPasskey) render();
    } else {
      render();
    }
  } catch(e){
    console.error(e);
    document.getElementById('app').innerHTML = `<div class="loading">Erro ao conectar com o banco de dados.<br><br><small>${e.message}</small></div>`;
  }
}

async function loadData(){
  await loadChamp();
  const [players, games, confirmations, notifications] = await Promise.all([
    sb.from('players').select('*').order('name'),
    sb.from('games').select('*').order('created_at',{ascending:false}).limit(1),
    sb.from('confirmations').select('*').order('confirmed_at'),
    sb.from('notifications').select('*').order('created_at',{ascending:false}).limit(10),
  ]);
  appData.players = players.data || [];
  appData.game = (games.data||[])[0] || null;
  appData.confirmations = confirmations.data || [];
  appData.notifications = notifications.data || [];
}

function playerIsAdmin(player){
  return !!(player?.is_admin || (player?.phone && ADMIN_PHONES.includes(player.phone)));
}
function isAdmin(){ return playerIsAdmin(currentPlayer); }
function getInitials(name){ return (name||'').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase(); }
function posTag(pos){ return POS_TAG[pos]||'tag-meia'; }

function isMensExpired(){
  if(!appData.game?.mens_expire_date) return false;
  return new Date(appData.game.mens_expire_date) < new Date();
}

function getConfirmedIds(){
  return appData.confirmations.filter(c=>c.confirmed).map(c=>c.player_id);
}

function getConfirmedPlayers(){
  const ids = getConfirmedIds();
  return ids.map(id=>appData.players.find(p=>p.id===id)).filter(Boolean);
}

function canConfirm(player){
  if(!player) return false;
  if(isMensExpired() && !player.mens_ok) return false;
  return true;
}

function getMyConfirmation(){
  if(!currentPlayer) return null;
  return appData.confirmations.find(c=>c.player_id===currentPlayer.id);
}

function formatDate(str){
  if(!str) return '';
  const d = new Date(str+'T12:00:00');
  return d.toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'});
}
function formatDateTime(str){
  if(!str) return '';
  return new Date(str).toLocaleString('pt-BR');
}
function formatDateBR(str){
  if(!str) return '';
  return new Date(str+'T12:00:00').toLocaleDateString('pt-BR');
}

function getMonth10Date(baseDate=new Date(), monthOffset=0){
  return new Date(baseDate.getFullYear(), baseDate.getMonth() + monthOffset, 10, 12, 0, 0, 0);
}

function formatMonthYearLabel(date){
  if(!date) return '';
  return date.toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
}

function getMensalidadeHomeMeta(){
  const now = new Date();
  now.setHours(12,0,0,0);
  const currentPlayerOk = !!currentPlayer?.mens_ok;
  const currentDue = getMonth10Date(now, 0);
  const nextDue = getMonth10Date(now, 1);
  if(currentPlayerOk){
    return {
      status: 'Em dia',
      subline: `Válida até ${nextDue.toLocaleDateString('pt-BR')}`,
      toneBg: 'rgba(76,175,80,.12)',
      toneColor: 'var(--green-dark)',
      toneBorder: 'rgba(76,175,80,.28)',
      chipLabel: nextDue.toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'})
    };
  }
  const overdue = now > currentDue;
  return {
    status: overdue ? 'Pendente' : 'Atenção',
    subline: overdue ? `Venceu em ${currentDue.toLocaleDateString('pt-BR')}` : `Vence em ${currentDue.toLocaleDateString('pt-BR')}`,
    toneBg: overdue ? 'rgba(244,67,54,.10)' : 'rgba(255,193,7,.14)',
    toneColor: overdue ? 'var(--red)' : '#8a6d00',
    toneBorder: overdue ? 'rgba(244,67,54,.24)' : 'rgba(255,193,7,.32)',
    chipLabel: currentDue.toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'})
  };
}


function normalizeCarneRows(rows){
  return (rows||[])
    .map(r=>({
      id: String(r.id || `${r.date||''}|${r.a||r.name1||''}|${r.b||r.name2||''}`),
      date: String(r.date || '').slice(0,10),
      a: String(r.a || r.name1 || '').trim(),
      b: String(r.b || r.name2 || '').trim(),
    }))
    .filter(r=>r.date && r.a && r.b)
    .sort((x,y)=>x.date.localeCompare(y.date)||x.a.localeCompare(y.a)||x.b.localeCompare(y.b));
}

function loadCarneSchedule(){
  try{
    const raw = localStorage.getItem(CARNE_STORAGE_KEY);
    if(raw){
      const parsed = JSON.parse(raw);
      if(Array.isArray(parsed) && parsed.length) return normalizeCarneRows(parsed);
    }
  }catch(e){ console.warn('carne schedule localStorage error', e); }
  return normalizeCarneRows(CARNE_SHEET_ROWS);
}

function saveCarneSchedule(){
  carneSchedule = normalizeCarneRows(carneSchedule);
  localStorage.setItem(CARNE_STORAGE_KEY, JSON.stringify(carneSchedule));
}

function formatCarneDateShort(str){
  if(!str) return '';
  return new Date(str+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});
}

function formatCarneDateLong(str){
  if(!str) return '';
  return new Date(str+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit'});
}

function getCurrentCarneRow(){
  const rows = normalizeCarneRows(carneSchedule);
  if(!rows.length) return null;
  const today = new Date();
  today.setHours(0,0,0,0);
  let current = rows[0];
  rows.forEach(r=>{
    const d = new Date(r.date+'T12:00:00');
    if(d <= today) current = r;
  });
  return current;
}

function renderCarneFeature(){
  const current = getCurrentCarneRow();
  if(!current) return '';
  return `
    <div class="carne-feature">
      <div class="carne-kicker">Carne da semana</div>
      <div class="carne-main">
        <div>
          <div class="carne-date">${formatCarneDateShort(current.date)}</div>
          <div class="carne-names">${current.a} + ${current.b}</div>
          <div class="carne-note">Calendário completo disponível na aba Carne.</div>
        </div>
        <div class="carne-badge">Dupla vigente</div>
      </div>
    </div>
  `;
}

function renderCarneRows(showAdmin=false){
  const current = getCurrentCarneRow();
  const rows = normalizeCarneRows(carneSchedule);
  if(!rows.length) return '<div class="empty-state">Sem escala de carne cadastrada.</div>';
  return rows.map(r=>`
    <div class="carne-row ${current && current.id===r.id ? 'current' : ''}">
      <div class="carne-date-pill">${formatCarneDateShort(r.date)}</div>
      <div class="carne-pair">
        <div class="carne-pair-main">${r.a} + ${r.b}</div>
        <div class="carne-pair-sub">${current && current.id===r.id ? 'Dupla vigente' : new Date(r.date+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'long'})}</div>
      </div>
      ${showAdmin ? `
        <div class="carne-actions">
          <button class="icon-btn" onclick="editCarneRow('${r.id.replace(/'/g,"\\'")}')">Editar</button>
          <button class="icon-btn del" onclick="deleteCarneRow('${r.id.replace(/'/g,"\\'")}')">Excluir</button>
        </div>` : ''}
    </div>
  `).join('');
}

function renderCarneEditor(){
  if(!isAdmin()) return '';
  const editing = carneEditingId ? carneSchedule.find(r=>r.id===carneEditingId) : null;
  return `
    <div class="card carne-list-card">
      <div class="card-title">${editing ? 'Editar dupla' : 'Nova dupla'}</div>
      <div class="carne-grid">
        <div class="form-group">
          <label>Data</label>
          <input type="date" id="carne-date" value="${editing?.date||''}">
        </div>
        <div class="form-group">
          <label>Nome 1</label>
          <input type="text" id="carne-a" value="${editing?.a||''}" placeholder="Primeiro nome">
        </div>
        <div class="form-group">
          <label>Nome 2</label>
          <input type="text" id="carne-b" value="${editing?.b||''}" placeholder="Segundo nome">
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-primary" style="width:auto;padding:10px 14px" onclick="saveCarneRow()">${editing ? 'Salvar alteração' : 'Adicionar dupla'}</button>
        ${editing ? `<button class="btn btn-secondary" style="width:auto;padding:10px 14px;margin-top:0" onclick="cancelEditCarne()">Cancelar</button>` : ''}
      </div>
    </div>
  `;
}

function renderCarneBlock(showAdmin=false){
  return `
    ${showAdmin ? renderCarneEditor() : ''}
    <div class="card carne-list-card">
      <div class="card-title">Calendário da carne</div>
      <div style="font-size:12px;color:var(--gray3);margin-bottom:8px">Escala completa da planilha, com edição liberada ao administrador.</div>
      ${renderCarneRows(showAdmin)}
    </div>
  `;
}

function renderCarne(){
  const c = document.getElementById('content');
  c.innerHTML = renderCarneFeature() + renderCarneBlock(isAdmin());
}

function editCarneRow(id){
  carneEditingId = id;
  currentTab = 'carne';
  render();
}

function cancelEditCarne(){
  carneEditingId = null;
  renderCarne();
}

function saveCarneRow(){
  const date = document.getElementById('carne-date')?.value;
  const a = document.getElementById('carne-a')?.value?.trim();
  const b = document.getElementById('carne-b')?.value?.trim();
  if(!date || !a || !b){ toast('Preencha data e os dois nomes','err'); return; }

  const newRow = { id: carneEditingId || `${date}|${a}|${b}`, date, a, b };

  if(carneEditingId){
    carneSchedule = carneSchedule.map(r=>r.id===carneEditingId ? newRow : r);
    toast('Dupla atualizada!');
  } else {
    carneSchedule.push(newRow);
    toast('Dupla adicionada!');
  }
  carneEditingId = null;
  saveCarneSchedule();
  renderCarne();
  if(currentTab==='home') renderHome();
}

function deleteCarneRow(id){
  if(!confirm('Excluir esta dupla da escala da carne?')) return;
  carneSchedule = carneSchedule.filter(r=>r.id!==id);
  if(carneEditingId===id) carneEditingId = null;
  saveCarneSchedule();
  toast('Dupla removida.');
  renderCarne();
}


// ---- RENDER ----
