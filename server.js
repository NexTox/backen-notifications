const express = require('express');
const admin = require('firebase-admin');
const axios = require('axios');
const cors = require('cors');

// ========================================
// CONFIGURATION
// ========================================

// Configuration Firebase Admin - supporte les variables d'environnement et les fichiers
let firebaseConfig;

if (process.env.FIREBASE_PRIVATE_KEY) {
    // Configuration via variables d'environnement (Production)
    firebaseConfig = {
        type: "service_account",
        project_id: process.env.FIREBASE_PROJECT_ID,
        private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
        private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        client_id: process.env.FIREBASE_CLIENT_ID,
        auth_uri: "https://accounts.google.com/o/oauth2/auth",
        token_uri: "https://oauth2.googleapis.com/token",
        auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
        client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
        universe_domain: "googleapis.com"
    };
} else {
    // Configuration via fichier (Développement local)
    try {
        firebaseConfig = require('./firebase-admin-key.json');
    } catch (error) {
        console.error('❌ Firebase admin key file not found and no environment variables set!');
        console.error('Please either:');
        console.error('1. Add firebase-admin-key.json file, or');
        console.error('2. Set the required environment variables');
        process.exit(1);
    }
}

// Initialise Firebase Admin
admin.initializeApp({
    credential: admin.credential.cert(firebaseConfig)
});

// Configuration Odoo (À MODIFIER)
const ODOO_CONFIG = {
  url: 'https://ipl-pfe-2025-groupe05-main-26038931.dev.odoo.com',  // Change par ton URL Odoo
  db: 'ipl-pfe-2025-groupe05-main-26038931',             // Change par le nom de ta DB
  username: 'c.relais@atl.be',         // Change par ton email Odoo
  password: 'StumbleDev123!',      // Change par ton mot de passe
};

// ========================================
// SERVEUR EXPRESS
// ========================================

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Stockage en mémoire des tokens (remplace par une vraie DB en production)
let deviceTokens = [];

// Stockage du dernier ID d'absence vérifié (pour éviter les doublons)
let lastCheckedLeaveId = 0;

// ========================================
// ENDPOINTS
// ========================================

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Backend Notifications Odoo',
    registeredDevices: deviceTokens.length,
    lastCheck: new Date().toISOString()
  });
});

// Endpoint pour enregistrer les tokens
app.post('/register_token', (req, res) => {
  const { token, userId } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'Token manquant' });
  }

  // Vérifie si le token existe déjà
  const existing = deviceTokens.find(d => d.token === token);

  if (!existing) {
    deviceTokens.push({
      token,
      userId,
      registeredAt: new Date(),
    });
    console.log(`✅ Token enregistré pour l'utilisateur ${userId}`);
    console.log(`📊 Total d'appareils enregistrés : ${deviceTokens.length}`);
  } else {
    console.log(`ℹ️ Token déjà enregistré pour l'utilisateur ${userId}`);
  }

  res.json({ success: true, devicesCount: deviceTokens.length });
});

// Endpoint pour supprimer un token
app.post('/unregister_token', (req, res) => {
  const { token } = req.body;

  deviceTokens = deviceTokens.filter(d => d.token !== token);
  console.log(`🗑️ Token supprimé`);

  res.json({ success: true });
});

// Endpoint pour lister les appareils (debug)
app.get('/devices', (req, res) => {
  res.json({
    count: deviceTokens.length,
    devices: deviceTokens.map(d => ({
      userId: d.userId,
      registeredAt: d.registeredAt,
      tokenPreview: d.token.substring(0, 20) + '...'
    }))
  });
});

// ========================================
// FONCTIONS ODOO
// ========================================

// Authentification Odoo
async function authenticateOdoo() {
  try {
    const response = await axios.post(`${ODOO_CONFIG.url}/jsonrpc`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        service: 'common',
        method: 'authenticate',
        args: [ODOO_CONFIG.db, ODOO_CONFIG.username, ODOO_CONFIG.password, {}]
      },
      id: 1
    });

    if (response.data.result) {
      console.log(`✅ Authentification Odoo réussie (UID: ${response.data.result})`);
      return response.data.result;
    } else {
      console.error('❌ Échec de l\'authentification Odoo');
      return null;
    }
  } catch (error) {
    console.error('❌ Erreur lors de l\'authentification Odoo:', error.message);
    return null;
  }
}

// Récupère les absences validées depuis Odoo
async function checkOdooLeaves(uid) {
  try {
    const response = await axios.post(`${ODOO_CONFIG.url}/jsonrpc`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        service: 'object',
        method: 'execute_kw',
        args: [
          ODOO_CONFIG.db,
          uid,
          ODOO_CONFIG.password,
          'hr.leave',
          'search_read',
          [[['state', '=', 'validate'], ['id', '>', lastCheckedLeaveId]]],
          {
            fields: ['id', 'name', 'employee_id', 'date_from', 'date_to'],
            limit: 10,
            order: 'id DESC'
          }
        ]
      },
      id: 1
    });

    const leaves = response.data.result || [];

    if (leaves.length > 0) {
      // Met à jour le dernier ID vérifié
      lastCheckedLeaveId = Math.max(...leaves.map(l => l.id));
      console.log(`📬 ${leaves.length} nouvelle(s) absence(s) détectée(s)`);
    }

    return leaves;
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des absences:', error.message);
    return [];
  }
}

// ========================================
// FONCTION D'ENVOI DE NOTIFICATION
// ========================================

async function sendNotification(token, title, body, data = {}) {
  // Décommente après avoir configuré Firebase Admin
  try {
    await admin.messaging().send({
      token: token,
      notification: {
        title: title,
        body: body
      },
      data: data,
      android: {
        priority: 'high'
      },
      apns: {
        payload: {
          aps: {
            sound: 'default'
          }
        }
      }
    });
    console.log(`✅ Notification envoyée : ${title}`);
  } catch (error) {
    console.error(`❌ Erreur FCM:`, error.message);
    // Supprime le token s'il est invalide
    if (error.code === 'messaging/invalid-registration-token' ||
        error.code === 'messaging/registration-token-not-registered') {
      deviceTokens = deviceTokens.filter(d => d.token !== token);
      console.log(`🗑️ Token invalide supprimé`);
    }
  }

  // Version de debug (retire-la après avoir configuré Firebase)
  console.log(`📤 [DEBUG] Notification à envoyer : ${title} - ${body}`);
}

// ========================================
// POLLING ODOO
// ========================================

let isPolling = false;
let odooUid = null;

async function startPolling() {
  if (isPolling) return;

  console.log('🔄 Démarrage du polling Odoo...');

  // Authentification initiale
  odooUid = await authenticateOdoo();

  if (!odooUid) {
    console.error('❌ Impossible de démarrer le polling sans authentification');
    return;
  }

  isPolling = true;

  // Polling toutes les 30 secondes
  setInterval(async () => {
    if (deviceTokens.length === 0) {
      console.log('⏸️ Aucun appareil enregistré, skip du polling');
      return;
    }

    console.log('🔍 Vérification des nouvelles absences Odoo...');

    const newLeaves = await checkOdooLeaves(odooUid);

    if (newLeaves.length > 0) {
      for (const leave of newLeaves) {
        const title = '🎉 Nouvelle absence validée';
        const body = `${leave.name} a été approuvée pour ${leave.employee_id[1]}`;
        const data = {
          leaveId: leave.id.toString(),
          employeeId: leave.employee_id[0].toString(),
          dateFrom: leave.date_from,
          dateTo: leave.date_to
        };

        // Envoie la notification à tous les appareils enregistrés
        for (const device of deviceTokens) {
          await sendNotification(device.token, title, body, data);
        }
      }
    }
  }, 30000); // 30 secondes
}

// ========================================
// DÉMARRAGE DU SERVEUR
// ========================================

app.listen(PORT, () => {
  console.log('');
  console.log('='.repeat(50));
  console.log('🚀 Serveur de notifications Odoo démarré');
  console.log('='.repeat(50));
  console.log(`📍 URL: http://localhost:${PORT}`);
  console.log(`🔧 Environnement: ${process.env.NODE_ENV || 'development'}`);
  console.log('='.repeat(50));
  console.log('');

  // Démarre le polling Odoo (décommente après configuration)
  startPolling();
});

// Gestion de l'arrêt propre
process.on('SIGTERM', () => {
  console.log('👋 Arrêt du serveur...');
  process.exit(0);
});

