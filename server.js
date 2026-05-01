const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const PORT = 3000;
const DATA_DIR = '/data/registros';
const UPLOADS_DIR = path.join(DATA_DIR, 'cedulas');

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const slug = (req.body.nombre || 'sin-nombre').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
    const side = file.fieldname === 'cedula_frente' ? 'frente' : 'reverso';
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${slug}-${side}-${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Solo se aceptan imagenes'));
  }
});

app.use(express.static('public'));

function checkAdmin(req, res, next) {
  const token = req.query.token || req.headers['x-admin-token'];
  if (token !== process.env.ADMIN_TOKEN) return res.status(401).send('No autorizado');
  next();
}

function readDB() {
  const dbPath = path.join(DATA_DIR, 'registros.json');
  if (!fs.existsSync(dbPath)) return [];
  return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
}

function writeDB(data) {
  fs.writeFileSync(path.join(DATA_DIR, 'registros.json'), JSON.stringify(data, null, 2));
}

// Registration
app.post('/api/registro',
  upload.fields([{ name: 'cedula_frente', maxCount: 1 }, { name: 'cedula_reverso', maxCount: 1 }]),
  (req, res) => {
    try {
      const { nombre, apodo, email, celular, direccion, brief, secreto } = req.body;
      const registro = {
        id: Date.now(), fecha: new Date().toISOString(), status: 'pendiente',
        nombre, apodo, email, celular, direccion, brief, secreto,
        cedula_frente: req.files?.cedula_frente?.[0]?.filename || null,
        cedula_reverso: req.files?.cedula_reverso?.[0]?.filename || null
      };
      const registros = readDB();
      registros.push(registro);
      writeDB(registros);
      console.log(`Nuevo registro: ${nombre} (${email})`);
      res.json({ success: true, message: 'Registro recibido' });
    } catch (err) {
      console.error('Error en registro:', err);
      res.status(500).json({ success: false, message: 'Error al procesar el registro' });
    }
  }
);

// API: list
app.get('/api/registros', checkAdmin, (req, res) => res.json(readDB()));

// API: update status
app.patch('/api/registros/:id', checkAdmin, (req, res) => {
  const registros = readDB();
  const r = registros.find(r => r.id === parseInt(req.params.id));
  if (!r) return res.status(404).json({ error: 'No encontrado' });
  if (req.body.status) r.status = req.body.status;
  if (req.body.nombre !== undefined) r.nombre = req.body.nombre;
  if (req.body.apodo !== undefined) r.apodo = req.body.apodo;
  if (req.body.email !== undefined) r.email = req.body.email;
  if (req.body.celular !== undefined) r.celular = req.body.celular;
  if (req.body.direccion !== undefined) r.direccion = req.body.direccion;
  if (req.body.brief !== undefined) r.brief = req.body.brief;
  if (req.body.secreto !== undefined) r.secreto = req.body.secreto;
  writeDB(registros);
  res.json({ success: true });
});

// API: delete
app.delete('/api/registros/:id', checkAdmin, (req, res) => {
  let registros = readDB();
  const r = registros.find(r => r.id === parseInt(req.params.id));
  if (!r) return res.status(404).json({ error: 'No encontrado' });
  // Delete cedula files
  if (r.cedula_frente) { try { fs.unlinkSync(path.join(UPLOADS_DIR, r.cedula_frente)); } catch(e){} }
  if (r.cedula_reverso) { try { fs.unlinkSync(path.join(UPLOADS_DIR, r.cedula_reverso)); } catch(e){} }
  registros = registros.filter(x => x.id !== parseInt(req.params.id));
  writeDB(registros);
  res.json({ success: true });
});

// API: export CSV
app.get('/api/registros/export', checkAdmin, (req, res) => {
  const registros = readDB();
  const headers = ['Nombre','Apodo','Email','Celular','Direccion','Quien es','Dato curioso','Status','Fecha'];
  const rows = registros.map(r => [
    r.nombre, r.apodo, r.email, r.celular, r.direccion,
    (r.brief||'').replace(/"/g,'""'), (r.secreto||'').replace(/"/g,'""'),
    r.status || 'pendiente', r.fecha
  ].map(v => `"${v||''}"`).join(','));
  const csv = '\uFEFF' + headers.join(',') + '\n' + rows.join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=socias-fundadoras.csv');
  res.send(csv);
});

// Cedulas
app.get('/api/cedulas/:filename', checkAdmin, (req, res) => {
  const safe = path.basename(req.params.filename);
  const filePath = path.join(UPLOADS_DIR, safe);
  if (!fs.existsSync(filePath)) return res.status(404).send('No encontrado');
  res.sendFile(filePath);
});

// Admin panel
app.get('/admin', checkAdmin, (req, res) => {
  const token = req.query.token;
  res.send(adminHTML(token));
});

function adminHTML(token) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Admin — Socias Fundadoras</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Inter:wght@300;400;500;600;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
body{background:#1e3a2a;color:#1a1714;font-family:'Inter',system-ui,sans-serif;padding:0;min-height:100vh}
.topbar{background:#1e3a2a;padding:28px 24px 20px;text-align:center;border-bottom:1px solid rgba(200,165,100,.15)}
.topbar img{height:50px;margin-bottom:12px}
.topbar h1{font-family:'Playfair Display',serif;font-size:1.4rem;color:#c8a564;margin-bottom:4px}
.topbar p{color:rgba(200,165,100,.5);font-size:.82rem;letter-spacing:.1em;text-transform:uppercase}
.toolbar{background:#faf7f2;padding:16px 24px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;border-bottom:1px solid rgba(92,58,30,.07)}
.toolbar .left{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.toolbar .count{font-size:.85rem;color:#9a8e82}
.filter-btn{padding:6px 14px;border-radius:999px;border:1px solid rgba(92,58,30,.1);background:#fff;color:#6b6057;font-size:.78rem;font-weight:500;cursor:pointer;transition:all .2s}
.filter-btn.active{background:#5c3a1e;color:#fff;border-color:#5c3a1e}
.filter-btn:hover{border-color:#b8893e}
.export-btn{padding:8px 18px;border-radius:999px;border:1px solid #b8893e;background:transparent;color:#b8893e;font-size:.78rem;font-weight:600;cursor:pointer;text-decoration:none;letter-spacing:.05em;transition:all .2s}
.export-btn:hover{background:rgba(184,137,62,.1)}
.content{background:#faf7f2;padding:24px;min-height:calc(100vh - 160px)}
.registros{max-width:1000px;margin:0 auto;display:flex;flex-direction:column;gap:20px}
.card{background:#fff;border:1px solid rgba(92,58,30,.07);border-radius:16px;padding:24px;box-shadow:0 2px 12px rgba(26,23,20,.04);position:relative;transition:border-color .2s}
.card.aprobada{border-left:4px solid #2a5038}
.card.descartada{border-left:4px solid #c0392b;opacity:.6}
.card.pendiente{border-left:4px solid #b8893e}
.card-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;flex-wrap:wrap;gap:8px}
.card-top h2{font-size:1.1rem;font-weight:600;color:#5c3a1e}
.card-top .meta{text-align:right}
.card-top .fecha{font-size:.75rem;color:#9a8e82}
.status-badge{display:inline-block;padding:3px 10px;border-radius:999px;font-size:.7rem;font-weight:600;text-transform:uppercase;letter-spacing:.08em;margin-top:4px}
.status-badge.pendiente{background:#faf1e0;color:#b8893e}
.status-badge.aprobada{background:#e6efe9;color:#2a5038}
.status-badge.descartada{background:#fde8e8;color:#c0392b}
.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px}
.info-item label{display:block;font-size:.7rem;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:#b8893e;margin-bottom:2px}
.info-item p{font-size:.88rem;color:#6b6057;line-height:1.4}
.brief-box{background:#fef9f1;padding:12px;border-radius:10px;font-size:.88rem;color:#6b6057;line-height:1.55;margin-bottom:14px}
.brief-box label{display:block;font-size:.7rem;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:#b8893e;margin-bottom:6px}
.cedulas{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px}
.cedulas label{display:block;font-size:.7rem;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:#b8893e;margin-bottom:4px}
.cedulas img{width:100%;border-radius:8px;border:1px solid rgba(92,58,30,.07);cursor:pointer}
.no-img{background:#faf7f2;border:2px dashed rgba(92,58,30,.1);border-radius:8px;padding:20px;text-align:center;color:#9a8e82;font-size:.8rem}
.actions{display:flex;gap:8px;flex-wrap:wrap;padding-top:14px;border-top:1px solid rgba(92,58,30,.05)}
.act-btn{padding:7px 16px;border-radius:999px;border:1px solid;font-size:.75rem;font-weight:600;cursor:pointer;transition:all .2s;background:transparent}
.act-btn.approve{border-color:#2a5038;color:#2a5038}.act-btn.approve:hover{background:#2a5038;color:#fff}
.act-btn.discard{border-color:#c0392b;color:#c0392b}.act-btn.discard:hover{background:#c0392b;color:#fff}
.act-btn.edit{border-color:#b8893e;color:#b8893e}.act-btn.edit:hover{background:#b8893e;color:#fff}
.act-btn.delete{border-color:#999;color:#999}.act-btn.delete:hover{background:#999;color:#fff}
.act-btn.pending{border-color:#b8893e;color:#b8893e}.act-btn.pending:hover{background:#b8893e;color:#fff}
.empty{text-align:center;padding:60px;color:#9a8e82}
.modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:100;align-items:center;justify-content:center}
.modal-overlay.show{display:flex}
.modal{background:#fff;border-radius:16px;padding:32px;max-width:500px;width:90%;max-height:85vh;overflow-y:auto}
.modal h3{font-size:1.1rem;color:#5c3a1e;margin-bottom:20px}
.modal label{display:block;font-size:.78rem;font-weight:600;color:#b8893e;margin-bottom:4px;text-transform:uppercase;letter-spacing:.06em}
.modal input,.modal textarea{width:100%;padding:10px 12px;border:1px solid rgba(92,58,30,.1);border-radius:8px;font-family:'Inter',sans-serif;font-size:.9rem;margin-bottom:14px;outline:none}
.modal input:focus,.modal textarea:focus{border-color:#b8893e}
.modal textarea{min-height:80px;resize:vertical}
.modal-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:8px}
.modal-actions button{padding:10px 24px;border-radius:999px;border:none;font-size:.85rem;font-weight:600;cursor:pointer}
.modal-actions .save{background:#5c3a1e;color:#fff}
.modal-actions .cancel{background:#f0ebe4;color:#6b6057}
@media(max-width:640px){.info-grid,.cedulas{grid-template-columns:1fr}.content{padding:16px}.card{padding:18px}}
</style>
</head>
<body>
<div class="topbar">
  <img src="/logo.png" alt="Logo">
  <h1>Panel Admin</h1>
  <p>Socias Fundadoras</p>
</div>
<div class="toolbar">
  <div class="left">
    <span class="count" id="count"></span>
    <button class="filter-btn active" data-filter="all" onclick="setFilter('all')">Todas</button>
    <button class="filter-btn" data-filter="pendiente" onclick="setFilter('pendiente')">Pendientes</button>
    <button class="filter-btn" data-filter="aprobada" onclick="setFilter('aprobada')">Aprobadas</button>
    <button class="filter-btn" data-filter="descartada" onclick="setFilter('descartada')">Descartadas</button>
  </div>
  <a class="export-btn" href="/api/registros/export?token=${token}" download>Exportar CSV</a>
</div>
<div class="content">
  <div class="registros" id="registros"><div class="empty">Cargando...</div></div>
</div>

<div class="modal-overlay" id="editModal">
  <div class="modal">
    <h3>Editar registro</h3>
    <input type="hidden" id="editId">
    <label>Nombre</label><input type="text" id="editNombre">
    <label>Apodo</label><input type="text" id="editApodo">
    <label>Email</label><input type="text" id="editEmail">
    <label>Celular</label><input type="text" id="editCelular">
    <label>Direccion</label><input type="text" id="editDireccion">
    <label>Quien es</label><textarea id="editBrief"></textarea>
    <label>Dato curioso</label><input type="text" id="editSecreto">
    <div class="modal-actions">
      <button class="cancel" onclick="closeEdit()">Cancelar</button>
      <button class="save" onclick="saveEdit()">Guardar</button>
    </div>
  </div>
</div>

<script>
const T='${token}';
let DATA=[];
let FILTER='all';

function setFilter(f){
  FILTER=f;
  document.querySelectorAll('.filter-btn').forEach(b=>b.classList.toggle('active',b.dataset.filter===f));
  render();
}

async function load(){
  const res=await fetch('/api/registros?token='+T);
  DATA=await res.json();
  render();
}

function render(){
  const filtered=FILTER==='all'?DATA:DATA.filter(r=>(r.status||'pendiente')===FILTER);
  const el=document.getElementById('registros');
  const total=DATA.length;
  const approved=DATA.filter(r=>r.status==='aprobada').length;
  const pending=DATA.filter(r=>!r.status||r.status==='pendiente').length;
  document.getElementById('count').textContent=total+' total | '+pending+' pendientes | '+approved+' aprobadas';
  if(!filtered.length){el.innerHTML='<div class="empty">No hay registros en esta categoria.</div>';return}
  el.innerHTML=filtered.map(r=>{
    const st=r.status||'pendiente';
    const fecha=new Date(r.fecha).toLocaleDateString('es-PA',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
    const frente=r.cedula_frente?'<img src="/api/cedulas/'+r.cedula_frente+'?token='+T+'" onclick="window.open(this.src)">':'<div class="no-img">No subida</div>';
    const reverso=r.cedula_reverso?'<img src="/api/cedulas/'+r.cedula_reverso+'?token='+T+'" onclick="window.open(this.src)">':'<div class="no-img">No subida</div>';
    return '<div class="card '+st+'"><div class="card-top"><h2>'+esc(r.nombre)+(r.apodo?' <span style="font-weight:400;color:#9a8e82;font-size:.85rem">('+esc(r.apodo)+')</span>':'')+'</h2><div class="meta"><div class="fecha">'+fecha+'</div><div class="status-badge '+st+'">'+st+'</div></div></div>'
    +'<div class="info-grid"><div class="info-item"><label>Email</label><p>'+esc(r.email)+'</p></div><div class="info-item"><label>Celular</label><p>'+esc(r.celular)+'</p></div><div class="info-item"><label>Direccion</label><p>'+esc(r.direccion)+'</p></div><div class="info-item"><label>Dato curioso</label><p>'+esc(r.secreto)+'</p></div></div>'
    +'<div class="brief-box"><label>Quien es</label>'+esc(r.brief)+'</div>'
    +'<div class="cedulas"><div><label>Cedula Frente</label>'+frente+'</div><div><label>Cedula Reverso</label>'+reverso+'</div></div>'
    +'<div class="actions">'
    +(st!=='aprobada'?'<button class="act-btn approve" onclick="setStatus('+r.id+',\\'aprobada\\')">Aprobar</button>':'')
    +(st!=='descartada'?'<button class="act-btn discard" onclick="setStatus('+r.id+',\\'descartada\\')">Descartar</button>':'')
    +(st!=='pendiente'?'<button class="act-btn pending" onclick="setStatus('+r.id+',\\'pendiente\\')">Pendiente</button>':'')
    +'<button class="act-btn edit" onclick="openEdit('+r.id+')">Editar</button>'
    +'<button class="act-btn delete" onclick="del('+r.id+')">Eliminar</button>'
    +'</div></div>';
  }).join('');
}

function esc(s){if(!s)return'';return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

async function setStatus(id,status){
  await fetch('/api/registros/'+id+'?token='+T,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status})});
  const r=DATA.find(x=>x.id===id);if(r)r.status=status;
  render();
}

async function del(id){
  if(!confirm('Segura que quieres eliminar este registro?'))return;
  await fetch('/api/registros/'+id+'?token='+T,{method:'DELETE'});
  DATA=DATA.filter(x=>x.id!==id);
  render();
}

function openEdit(id){
  const r=DATA.find(x=>x.id===id);if(!r)return;
  document.getElementById('editId').value=id;
  document.getElementById('editNombre').value=r.nombre||'';
  document.getElementById('editApodo').value=r.apodo||'';
  document.getElementById('editEmail').value=r.email||'';
  document.getElementById('editCelular').value=r.celular||'';
  document.getElementById('editDireccion').value=r.direccion||'';
  document.getElementById('editBrief').value=r.brief||'';
  document.getElementById('editSecreto').value=r.secreto||'';
  document.getElementById('editModal').classList.add('show');
}

function closeEdit(){document.getElementById('editModal').classList.remove('show');}

async function saveEdit(){
  const id=document.getElementById('editId').value;
  const body={
    nombre:document.getElementById('editNombre').value,
    apodo:document.getElementById('editApodo').value,
    email:document.getElementById('editEmail').value,
    celular:document.getElementById('editCelular').value,
    direccion:document.getElementById('editDireccion').value,
    brief:document.getElementById('editBrief').value,
    secreto:document.getElementById('editSecreto').value
  };
  await fetch('/api/registros/'+id+'?token='+T,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const r=DATA.find(x=>x.id==id);if(r)Object.assign(r,body);
  closeEdit();render();
}

load();
</script>
</body>
</html>`;
}

app.listen(PORT, () => console.log('Mujeres Ganaderas server running on port ' + PORT));
