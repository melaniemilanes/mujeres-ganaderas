const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
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

// Registration endpoint
app.post('/api/registro',
  upload.fields([
    { name: 'cedula_frente', maxCount: 1 },
    { name: 'cedula_reverso', maxCount: 1 }
  ]),
  (req, res) => {
    try {
      const { nombre, apodo, email, celular, direccion, brief, secreto } = req.body;
      const registro = {
        id: Date.now(),
        fecha: new Date().toISOString(),
        nombre, apodo, email, celular, direccion, brief, secreto,
        cedula_frente: req.files?.cedula_frente?.[0]?.filename || null,
        cedula_reverso: req.files?.cedula_reverso?.[0]?.filename || null
      };

      const dbPath = path.join(DATA_DIR, 'registros.json');
      let registros = [];
      if (fs.existsSync(dbPath)) registros = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      registros.push(registro);
      fs.writeFileSync(dbPath, JSON.stringify(registros, null, 2));

      console.log(`Nuevo registro: ${nombre} (${email})`);
      res.json({ success: true, message: 'Registro recibido' });
    } catch (err) {
      console.error('Error en registro:', err);
      res.status(500).json({ success: false, message: 'Error al procesar el registro' });
    }
  }
);

// API endpoints (protected)
app.get('/api/registros', checkAdmin, (req, res) => {
  const dbPath = path.join(DATA_DIR, 'registros.json');
  if (!fs.existsSync(dbPath)) return res.json([]);
  res.json(JSON.parse(fs.readFileSync(dbPath, 'utf8')));
});

app.get('/api/cedulas/:filename', checkAdmin, (req, res) => {
  const safe = path.basename(req.params.filename);
  const filePath = path.join(UPLOADS_DIR, safe);
  if (!fs.existsSync(filePath)) return res.status(404).send('No encontrado');
  res.sendFile(filePath);
});

// Admin panel
app.get('/admin', checkAdmin, (req, res) => {
  const token = req.query.token;
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Admin — Registros Socias Fundadoras</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Inter:wght@300;400;500;600;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
body{background:#faf7f2;color:#1a1714;font-family:'Inter',system-ui,sans-serif;padding:32px 24px}
.header{text-align:center;margin-bottom:40px}
.header h1{font-family:'Playfair Display',serif;font-size:1.8rem;color:#5c3a1e;margin-bottom:8px}
.header p{color:#9a8e82;font-size:.9rem}
.badge{display:inline-block;background:#faf1e0;color:#5c3a1e;padding:4px 12px;border-radius:999px;font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;margin-bottom:16px}
.registros{max-width:1000px;margin:0 auto;display:flex;flex-direction:column;gap:24px}
.card{background:#fff;border:1px solid rgba(92,58,30,.07);border-radius:16px;padding:28px;box-shadow:0 2px 12px rgba(26,23,20,.04)}
.card-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;flex-wrap:wrap;gap:8px}
.card-header h2{font-size:1.2rem;font-weight:600;color:#5c3a1e}
.card-header .fecha{font-size:.78rem;color:#9a8e82;font-weight:500}
.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:18px}
.info-item label{display:block;font-size:.72rem;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:#b8893e;margin-bottom:3px}
.info-item p{font-size:.9rem;color:#6b6057;line-height:1.5}
.brief-section{margin-bottom:18px}
.brief-section label{display:block;font-size:.72rem;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:#b8893e;margin-bottom:6px}
.brief-section p{font-size:.9rem;color:#6b6057;line-height:1.6;background:#fef9f1;padding:14px;border-radius:10px}
.cedulas{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.cedulas label{display:block;font-size:.72rem;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:#b8893e;margin-bottom:6px}
.cedulas img{width:100%;border-radius:10px;border:1px solid rgba(92,58,30,.07);cursor:pointer;transition:transform .2s}
.cedulas img:hover{transform:scale(1.02)}
.no-img{background:#faf7f2;border:2px dashed rgba(92,58,30,.1);border-radius:10px;padding:24px;text-align:center;color:#9a8e82;font-size:.85rem}
.empty{text-align:center;padding:60px;color:#9a8e82}
.count{font-size:.85rem;color:#9a8e82;text-align:center;margin-bottom:24px}
@media(max-width:640px){.info-grid,.cedulas{grid-template-columns:1fr}body{padding:20px 16px}.card{padding:20px}}
</style>
</head>
<body>
<div class="header">
  <span class="badge">Panel Admin</span>
  <h1>Socias Fundadoras</h1>
  <p>Registros recibidos</p>
</div>
<div class="count" id="count"></div>
<div class="registros" id="registros"><div class="empty">Cargando...</div></div>
<script>
const TOKEN='${token}';
async function load(){
  const res=await fetch('/api/registros?token='+TOKEN);
  const data=await res.json();
  const el=document.getElementById('registros');
  document.getElementById('count').textContent=data.length+' registro'+(data.length!==1?'s':'');
  if(!data.length){el.innerHTML='<div class="empty">No hay registros todavia.</div>';return}
  el.innerHTML=data.map(r=>{
    const fecha=new Date(r.fecha).toLocaleDateString('es-PA',{year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'});
    const frente=r.cedula_frente?'<img src="/api/cedulas/'+r.cedula_frente+'?token='+TOKEN+'" onclick="window.open(this.src)">':'<div class="no-img">No subida</div>';
    const reverso=r.cedula_reverso?'<img src="/api/cedulas/'+r.cedula_reverso+'?token='+TOKEN+'" onclick="window.open(this.src)">':'<div class="no-img">No subida</div>';
    return '<div class="card"><div class="card-header"><h2>'+r.nombre+(r.apodo?' <span style="font-weight:400;color:#9a8e82;font-size:.9rem">('+r.apodo+')</span>':'')+'</h2><span class="fecha">'+fecha+'</span></div><div class="info-grid"><div class="info-item"><label>Email</label><p>'+r.email+'</p></div><div class="info-item"><label>Celular</label><p>'+r.celular+'</p></div><div class="info-item"><label>Direccion</label><p>'+r.direccion+'</p></div><div class="info-item"><label>Dato curioso</label><p>'+r.secreto+'</p></div></div><div class="brief-section"><label>Quien es</label><p>'+r.brief+'</p></div><div class="cedulas"><div><label>Cedula — Frente</label>'+frente+'</div><div><label>Cedula — Reverso</label>'+reverso+'</div></div></div>'
  }).join('');
}
load();
</script>
</body>
</html>`);
});

app.listen(PORT, () => console.log('Mujeres Ganaderas server running on port ' + PORT));
