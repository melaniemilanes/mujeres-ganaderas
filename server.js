const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;
const DATA_DIR = '/data/registros';
const UPLOADS_DIR = path.join(DATA_DIR, 'cedulas');

// Ensure directories exist
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const side = file.fieldname === 'cedula_frente' ? 'frente' : 'reverso';
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${timestamp}-${side}${ext}`);
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

// Serve static files
app.use(express.static('public'));

// Handle registration
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
        nombre,
        apodo,
        email,
        celular,
        direccion,
        brief,
        secreto,
        cedula_frente: req.files?.cedula_frente?.[0]?.filename || null,
        cedula_reverso: req.files?.cedula_reverso?.[0]?.filename || null
      };

      // Append to registros.json
      const dbPath = path.join(DATA_DIR, 'registros.json');
      let registros = [];
      if (fs.existsSync(dbPath)) {
        registros = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      }
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

// Admin endpoint to list registros (protected by simple token)
app.get('/api/registros', (req, res) => {
  const token = req.headers['x-admin-token'];
  if (token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  const dbPath = path.join(DATA_DIR, 'registros.json');
  if (!fs.existsSync(dbPath)) return res.json([]);
  res.json(JSON.parse(fs.readFileSync(dbPath, 'utf8')));
});

// Serve cedula images (protected)
app.get('/api/cedulas/:filename', (req, res) => {
  const token = req.headers['x-admin-token'];
  if (token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  const filePath = path.join(UPLOADS_DIR, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'No encontrado' });
  res.sendFile(filePath);
});

app.listen(PORT, () => console.log(`Mujeres Ganaderas server running on port ${PORT}`));
