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
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;

    console.log('🔍 Debug: Raw private key length:', privateKey.length);
    console.log('🔍 Debug: First 50 chars:', privateKey.substring(0, 50));
    console.log('🔍 Debug: Last 50 chars:', privateKey.substring(privateKey.length - 50));

    // Retirer les guillemets de début/fin si présents (cas Render)
    privateKey = privateKey.trim();
    if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
        console.log('⚠️  Guillemets détectés, suppression...');
        privateKey = privateKey.slice(1, -1);
    }
    if (privateKey.startsWith("'") && privateKey.endsWith("'")) {
        console.log('⚠️  Guillemets simples détectés, suppression...');
        privateKey = privateKey.slice(1, -1);
    }

    // Si la clé ne commence pas par BEGIN, on assume qu'elle est mal formatée
    if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
        console.error('❌ FIREBASE_PRIVATE_KEY seems to be malformed');
        console.error('Make sure it starts with -----BEGIN PRIVATE KEY----- and ends with -----END PRIVATE KEY-----');
        console.error('Current value starts with:', privateKey.substring(0, 100));
        process.exit(1);
    }

    // Nettoyage et formatage de la clé - version améliorée pour Render
    privateKey = privateKey
        .replace(/\\n/g, '\n')          // Remplace \\n par de vrais retours à la ligne
        .replace(/\\r\\n/g, '\n')       // Remplace \\r\\n par \n
        .replace(/\\r/g, '\n')          // Remplace \\r par \n
        .replace(/\r\n/g, '\n')         // Remplace \r\n par \n
        .replace(/\r/g, '\n')           // Remplace \r par \n
        .trim();

    console.log('🔍 Debug: Processed key length:', privateKey.length);
    console.log('🔍 Debug: Processed first 50 chars:', privateKey.substring(0, 50));
    console.log('🔍 Debug: Processed last 50 chars:', privateKey.substring(privateKey.length - 50));

    // Validation finale
    const hasBegin = privateKey.startsWith('-----BEGIN PRIVATE KEY-----');
    const hasEnd = privateKey.endsWith('-----END PRIVATE KEY-----');
    console.log(`✅ Validation: BEGIN=${hasBegin}, END=${hasEnd}`);

    firebaseConfig = {
        type: "service_account",
        project_id: process.env.FIREBASE_PROJECT_ID,
        private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
        private_key: privateKey,
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        client_id: process.env.FIREBASE_CLIENT_ID,
        auth_uri: "https://accounts.google.com/o/oauth2/auth",
        token_uri: "https://oauth2.googleapis.com/token",
        auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
        client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
        universe_domain: "googleapis.com"
    };

    console.log('✅ Using Firebase config from environment variables');
} else {
    // Configuration via fichier (Développement local)
    try {
        firebaseConfig = require('./firebase-admin-key.json');
        console.log('✅ Using Firebase config from file');
    } catch (error) {
        console.error('❌ Firebase admin key file not found and no environment variables set!');
        console.error('Please either:');
        console.error('1. Add firebase-admin-key.json file, or');
        console.error('2. Set the required environment variables');
        process.exit(1);
    }
}

// Initialise Firebase Admin (uniquement si pas déjà initialisé)
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(firebaseConfig)
    });
    console.log('✅ Firebase Admin SDK initialisé avec succès');
} else {
    console.log('ℹ️ Firebase Admin SDK déjà initialisé');
}

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

// Utilitaire: obtenir les tokens pour un userId (peut retourner plusieurs appareils)
function getTokensForUser(userId) {
  if (userId === null || userId === undefined || userId === '') return [];
  const uidStr = String(userId);
  return deviceTokens
    .filter(d => d.userId !== undefined && String(d.userId) === uidStr)
    .map(d => d.token);
}

// Stockage de la dernière date de vérification (pour éviter les doublons)
let lastCheckedLeaveDate = null;
let lastCheckedActivityDate = null;
let lastCheckedSecondApprovalDate = null;
let lastCheckedAllocationDate = null;

// Stockage des IDs déjà traités pour éviter les doublons dans la même minute
let processedLeaveIds = new Set();
let processedActivityIds = new Set();
let processedSecondApprovalIds = new Set();
let processedAllocationIds = new Set();

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
  const { token, userId, userRole } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'Token manquant' });
  }

  // Vérifie si le token existe déjà
  const existingIndex = deviceTokens.findIndex(d => d.token === token);

  if (existingIndex === -1) {
    deviceTokens.push({
      token,
      userId,
      userRole: userRole || 'employee', // Rôle par défaut: employee
      registeredAt: new Date(),
    });
    console.log(`✅ Token enregistré pour l'utilisateur ${userId} (rôle: ${userRole || 'employee'})`);
    console.log(`📊 Total d'appareils enregistrés : ${deviceTokens.length}`);
  } else {
    // Mettre à jour le rôle si l'utilisateur existe déjà
    deviceTokens[existingIndex].userRole = userRole || 'employee';
    deviceTokens[existingIndex].userId = userId;
    console.log(`ℹ️ Token mis à jour pour l'utilisateur ${userId} (rôle: ${userRole || 'employee'})`);
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
      userRole: d.userRole,
      registeredAt: d.registeredAt,
      tokenPreview: d.token.substring(0, 20) + '...'
    }))
  });
});

// Endpoint pour récupérer le rôle d'un utilisateur depuis Odoo
app.post('/get_user_role', async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'userId manquant' });
  }

  try {
    // Authentification Odoo
    const uid = await authenticateOdoo();
    if (!uid) {
      return res.status(500).json({ error: 'Échec de l\'authentification Odoo' });
    }

    // Récupérer les informations de l'utilisateur
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
          'res.users',
          'search_read',
          [[['id', '=', parseInt(userId)]]],
          {
            fields: ['id', 'name', 'groups_id']
          }
        ]
      },
      id: 1
    });

    const userData = response.data.result;
    if (userData && userData.length > 0) {
      const user = userData[0];

      // Récupérer les noms des groupes pour déterminer le rôle
      const groupsResponse = await axios.post(`${ODOO_CONFIG.url}/jsonrpc`, {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          service: 'object',
          method: 'execute_kw',
          args: [
            ODOO_CONFIG.db,
            uid,
            ODOO_CONFIG.password,
            'res.groups',
            'search_read',
            [[['id', 'in', user.groups_id]]],
            {
              fields: ['id', 'name', 'category_id']
            }
          ]
        },
        id: 1
      });

      const groups = groupsResponse.data.result || [];
      const groupNames = groups.map(g => g.name.toLowerCase());

      console.log(`📋 Groupes de l'utilisateur ${userId}:`, groupNames);

      // Déterminer le rôle basé sur les groupes
      let role = 'employee';

      if (groupNames.some(name =>
        name.includes('hr manager') ||
        name.includes('gestionnaire rh') ||
        name.includes('administrator') ||
        name.includes('administrateur')
      )) {
        role = 'manager';
      } else if (groupNames.some(name =>
        name.includes('hr officer') ||
        name.includes('responsable rh') ||
        name.includes('time off officer') ||
        name.includes('responsable des congés')
      )) {
        role = 'validator';
      }

      console.log(`✅ Rôle déterminé pour l'utilisateur ${userId}: ${role}`);

      return res.json({
        success: true,
        role: role,
        groups: groupNames
      });
    }

    return res.json({ success: true, role: 'employee' });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération du rôle:', error.message);
    return res.status(500).json({
      error: 'Erreur lors de la récupération du rôle',
      details: error.message
    });
  }
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

// Récupère le rôle d'un utilisateur depuis Odoo
async function getUserRoleFromOdoo(uid, userId) {
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
          'res.users',
          'search_read',
          [[['id', '=', userId]]],
          {
            fields: ['id', 'name', 'groups_id']
          }
        ]
      },
      id: 1
    });

    const userData = response.data.result;
    if (userData && userData.length > 0) {
      const user = userData[0];
      const groupIds = user.groups_id || [];

      // Vérifier les groupes Odoo pour déterminer le rôle
      // IDs typiques (à ajuster selon votre configuration Odoo) :
      // - Gestionnaire RH : group_hr_manager
      // - Responsable : group_hr_user
      // Vous devrez récupérer les IDs exacts depuis votre Odoo

      // Pour l'instant, on retourne 'employee' par défaut
      // En production, vous devriez vérifier les groupes spécifiques
      return 'employee';
    }

    return 'employee';
  } catch (error) {
    console.error('❌ Erreur lors de la récupération du rôle utilisateur:', error.message);
    return 'employee';
  }
}

// Récupère les absences validées ET refusées depuis Odoo
async function checkOdooLeaves(uid) {
  try {
    // Construire le filtre de date
    let domainFilter = [['state', 'in', ['validate', 'refuse']]];

    // Si on a une dernière date de vérification, ne récupérer que les modifications récentes
    if (lastCheckedLeaveDate) {
      domainFilter.push(['write_date', '>', lastCheckedLeaveDate]);
    }

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
          [domainFilter],
          {
            fields: ['id', 'name', 'employee_id', 'date_from', 'date_to', 'holiday_status_id', 'state', 'write_date'],
            limit: 20,
            order: 'write_date DESC'
          }
        ]
      },
      id: 1
    });

    const leaves = response.data.result || [];

    // Filtrer les demandes déjà traitées
    const newLeaves = leaves.filter(leave => !processedLeaveIds.has(leave.id));

    if (newLeaves.length > 0) {
      // Mettre à jour la dernière date de vérification
      const latestWriteDate = newLeaves[0].write_date;
      lastCheckedLeaveDate = latestWriteDate;

      console.log(`📬 ${newLeaves.length} absence(s) modifiée(s) détectée(s)`);

      // Debug: afficher les données récupérées
      newLeaves.forEach(leave => {
        console.log(`   - ID: ${leave.id}, Type: ${leave.holiday_status_id ? leave.holiday_status_id[1] : 'N/A'}, État: ${leave.state}, Modifié: ${leave.write_date}`);
        // Ajouter à la liste des IDs traités
        processedLeaveIds.add(leave.id);
      });

      // Nettoyer les vieux IDs traités (garder seulement les 100 derniers)
      if (processedLeaveIds.size > 100) {
        const idsArray = Array.from(processedLeaveIds);
        processedLeaveIds = new Set(idsArray.slice(-100));
      }
    }

    return newLeaves;
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des absences:', error.message);
    return [];
  }
}

// Récupère les nouvelles demandes de congé en attente d'approbation depuis Odoo
async function checkOdooActivities(uid) {
  try {
    // Construire le filtre de date
    let domainFilter = [['state', '=', 'confirm']];  // État "À approuver"

    // Si on a une dernière date de vérification, ne récupérer que les modifications récentes
    if (lastCheckedActivityDate) {
      domainFilter.push(['write_date', '>', lastCheckedActivityDate]);
    }

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
          [domainFilter],
          {
            fields: ['id', 'name', 'employee_id', 'date_from', 'date_to', 'holiday_status_id', 'state', 'number_of_days', 'notes', 'write_date'],
            limit: 20,
            order: 'write_date DESC'
          }
        ]
      },
      id: 1
    });

    const pendingLeaves = response.data.result || [];

    // Filtrer les demandes déjà traitées
    const newPendingLeaves = pendingLeaves.filter(leave => !processedActivityIds.has(leave.id));

    if (newPendingLeaves.length > 0) {
      // Mettre à jour la dernière date de vérification
      const latestWriteDate = newPendingLeaves[0].write_date;
      lastCheckedActivityDate = latestWriteDate;

      console.log(`📋 ${newPendingLeaves.length} demande(s) de congé à approuver détectée(s)`);

      // Marquer comme traité et loger; la logique d'envoi est gérée dans le polling principal
      newPendingLeaves.forEach(leave => {
        console.log(`   - ID: ${leave.id}, Employé: ${leave.employee_id ? leave.employee_id[1] : 'N/A'}, Type: ${leave.holiday_status_id ? leave.holiday_status_id[1] : 'N/A'}, Modifié: ${leave.write_date}`);
        processedActivityIds.add(leave.id);
      });

      // Nettoyer les vieux IDs traités (garder seulement les 100 derniers)
      if (processedActivityIds.size > 100) {
        const idsArray = Array.from(processedActivityIds);
        processedActivityIds = new Set(idsArray.slice(-100));
      }
    }

    return newPendingLeaves;
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des demandes à approuver:', error.message);
    return [];
  }
}

// Récupère les demandes passées en "Second approval" (état configurable)
async function checkOdooSecondApprovals(uid) {
  try {
    const SECOND_STATE = process.env.SECOND_APPROVAL_STATE || 'validate1';

    let domainFilter = [['state', '=', SECOND_STATE]];

    if (lastCheckedSecondApprovalDate) {
      domainFilter.push(['write_date', '>', lastCheckedSecondApprovalDate]);
    }

    console.log(`🔍 checkOdooSecondApprovals: querying state='${SECOND_STATE}' with lastCheckedSecondApprovalDate=${lastCheckedSecondApprovalDate}`);
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
          [domainFilter],
          {
            fields: ['id', 'name', 'employee_id', 'holiday_status_id', 'state', 'write_date', 'notes'],
            limit: 20,
            order: 'write_date DESC'
          }
        ]
      },
      id: 1
    });

    const rows = response.data.result || [];
    console.log(`🔎 checkOdooSecondApprovals: fetched ${rows.length} rows`);

    // Filtrer les demandes déjà traitées
    const newRows = rows.filter(r => !processedSecondApprovalIds.has(r.id));

    if (newRows.length > 0) {
      lastCheckedSecondApprovalDate = newRows[0].write_date;
      console.log(`🔔 ${newRows.length} demande(s) en Second approval détectée(s)`);

      newRows.forEach(r => {
        console.log(`   - ID: ${r.id}, state=${r.state}, write_date=${r.write_date}, employee=${r.employee_id ? r.employee_id[1] : 'N/A'}, type=${r.holiday_status_id ? r.holiday_status_id[1] : 'N/A'}`);
        processedSecondApprovalIds.add(r.id);
      });

      // Nettoyer anciens
      if (processedSecondApprovalIds.size > 100) {
        const idsArray = Array.from(processedSecondApprovalIds);
        processedSecondApprovalIds = new Set(idsArray.slice(-100));
      }
    }

    return newRows;
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des second approvals:', error.message);
    return [];
  }
}

// Récupère les nouvelles allocations (hr.leave.allocation) en état 'confirm'
async function checkOdooAllocations(uid) {
  try {
    let domainFilter = [['state', '=', 'confirm']];
    if (lastCheckedAllocationDate) {
      domainFilter.push(['write_date', '>', lastCheckedAllocationDate]);
    }

    console.log(`🔍 checkOdooAllocations: querying hr.leave.allocation with lastCheckedAllocationDate=${lastCheckedAllocationDate}`);
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
          'hr.leave.allocation',
          'search_read',
          [domainFilter],
          {
            fields: ['id', 'name', 'employee_id', 'number_of_days', 'state', 'write_date'],
            limit: 20,
            order: 'write_date DESC'
          }
        ]
      },
      id: 1
    });

    const rows = response.data.result || [];
    console.log(`🔎 checkOdooAllocations: fetched ${rows.length} rows`);

    const newRows = rows.filter(r => !processedAllocationIds.has(r.id));
    if (newRows.length > 0) {
      lastCheckedAllocationDate = newRows[0].write_date;
      console.log(`🔔 ${newRows.length} allocation(s) détectée(s)`);
      newRows.forEach(r => {
        console.log(`   - ID: ${r.id}, employee=${r.employee_id ? r.employee_id[1] : 'N/A'}, days=${r.number_of_days || 'N/A'}, write_date=${r.write_date}`);
        processedAllocationIds.add(r.id);
      });

      if (processedAllocationIds.size > 100) {
        const idsArray = Array.from(processedAllocationIds);
        processedAllocationIds = new Set(idsArray.slice(-100));
      }
    }

    return newRows;
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des allocations:', error.message);
    return [];
  }
}

// ========================================
// FONCTION D'ENVOI DE NOTIFICATION
// ========================================

async function sendNotification(token, title, body, data = {}) {
  try {
    console.log(`📤 Tentative d'envoi de notification : ${title}`);

    const message = {
      token: token,
      notification: {
        title: title,
        body: body
      },
      data: data,
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'default'
        }
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1
          }
        }
      }
    };

    const response = await admin.messaging().send(message);
    console.log(`✅ Notification envoyée avec succès : ${title}`);
    console.log(`📬 Message ID : ${response}`);
    return true;
  } catch (error) {
    console.error(`❌ Erreur FCM pour "${title}":`, error.message);
    console.error(`❌ Code d'erreur:`, error.code);

    // Supprime le token s'il est invalide
    if (error.code === 'messaging/invalid-registration-token' ||
        error.code === 'messaging/registration-token-not-registered') {
      deviceTokens = deviceTokens.filter(d => d.token !== token);
      console.log(`🗑️ Token invalide supprimé`);
    }
    return false;
  }
}

// ========================================
// POLLING ODOO
// ========================================

let isPolling = false;
let odooUid = null;

// Initialise les derniers IDs vérifiés au démarrage
async function initializeLastCheckedIds(uid) {
  try {
    console.log('🔧 Initialisation des dernières dates de vérification...');

    // Récupérer la dernière absence validée/refusée (par date de modification)
    const leavesResponse = await axios.post(`${ODOO_CONFIG.url}/jsonrpc`, {
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
          [[['state', 'in', ['validate', 'refuse']]]],
          {
            fields: ['id', 'write_date'],
            limit: 1,
            order: 'write_date DESC'
          }
        ]
      },
      id: 1
    });

    const lastLeave = leavesResponse.data.result || [];
    if (lastLeave.length > 0) {
      lastCheckedLeaveDate = lastLeave[0].write_date;
      console.log(`✅ Dernière date d'absence vérifiée initialisée: ${lastCheckedLeaveDate}`);
    } else {
      console.log(`ℹ️ Aucune absence validée/refusée trouvée, lastCheckedLeaveDate reste à null`);
    }

    // Récupérer la dernière demande en attente (par date de modification)
    const activitiesResponse = await axios.post(`${ODOO_CONFIG.url}/jsonrpc`, {
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
          [[['state', '=', 'confirm']]],
          {
            fields: ['id', 'write_date'],
            limit: 1,
            order: 'write_date DESC'
          }
        ]
      },
      id: 1
    });

    const lastActivity = activitiesResponse.data.result || [];
    if (lastActivity.length > 0) {
      lastCheckedActivityDate = lastActivity[0].write_date;
      console.log(`✅ Dernière date d'activité vérifiée initialisée: ${lastCheckedActivityDate}`);
    } else {
      console.log(`ℹ️ Aucune demande en attente trouvée, lastCheckedActivityDate reste à null`);
    }

    // Récupérer la dernière allocation (requests for allocation) si le modèle existe
    try {
      const allocResp = await axios.post(`${ODOO_CONFIG.url}/jsonrpc`, {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          service: 'object',
          method: 'execute_kw',
          args: [
            ODOO_CONFIG.db,
            uid,
            ODOO_CONFIG.password,
            'hr.leave.allocation',
            'search_read',
            [[['state', '=', 'confirm']]],
            { fields: ['id', 'write_date'], limit: 1, order: 'write_date DESC' }
          ]
        },
        id: 1
      });

      const lastAlloc = allocResp.data.result || [];
      if (lastAlloc.length > 0) {
        lastCheckedAllocationDate = lastAlloc[0].write_date;
        console.log(`✅ Dernière date d'allocation vérifiée initialisée: ${lastCheckedAllocationDate}`);
      } else {
        console.log(`ℹ️ Aucune allocation trouvée, lastCheckedAllocationDate reste à null`);
      }
    } catch (err) {
      console.log(`⚠️ Impossible d'initialiser lastCheckedAllocationDate (model peut ne pas exister): ${err.message}`);
    }

    // Récupérer la dernière demande passée en second approval (si cet état existe)
    try {
      const SECOND_STATE = process.env.SECOND_APPROVAL_STATE || 'validate1';
      const secondResp = await axios.post(`${ODOO_CONFIG.url}/jsonrpc`, {
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
            [[['state', '=', SECOND_STATE]]],
            { fields: ['id', 'write_date'], limit: 1, order: 'write_date DESC' }
          ]
        },
        id: 1
      });

      const lastSecond = secondResp.data.result || [];
      if (lastSecond.length > 0) {
        lastCheckedSecondApprovalDate = lastSecond[0].write_date;
        console.log(`✅ Dernière date de second_approval vérifiée initialisée: ${lastCheckedSecondApprovalDate}`);
      } else {
        console.log(`ℹ️ Aucune demande en second_approval trouvée, lastCheckedSecondApprovalDate reste à null`);
      }
    } catch (err) {
      console.log(`⚠️ Impossible d'initialiser lastCheckedSecondApprovalDate: ${err.message}`);
    }

  } catch (error) {
    console.error('❌ Erreur lors de l\'initialisation des dernières dates:', error.message);
    console.log('⚠️ Les dates restent à null, toutes les demandes existantes seront potentiellement re-notifiées');
  }
}

async function startPolling() {
  if (isPolling) return;

  console.log('🔄 Démarrage du polling Odoo...');

  // Authentification initiale
  odooUid = await authenticateOdoo();

  if (!odooUid) {
    console.error('❌ Impossible de démarrer le polling sans authentification');
    return;
  }

  // Initialiser les derniers IDs vérifiés avec les demandes existantes
  // Cela évite de re-notifier pour des demandes déjà traitées
  await initializeLastCheckedIds(odooUid);

  isPolling = true;

  // Polling toutes les 30 secondes
  setInterval(async () => {
    if (deviceTokens.length === 0) {
      console.log('⏸️ Aucun appareil enregistré, skip du polling');
      return;
    }

    console.log('🔍 Vérification des nouvelles absences et activités Odoo...');

    // Vérification des absences validées ET refusées
    const newLeaves = await checkOdooLeaves(odooUid);

    if (newLeaves.length > 0) {
      for (const leave of newLeaves) {
        const leaveType = leave.holiday_status_id ? leave.holiday_status_id[1] : 'Absence';
        const isRefused = leave.state === 'refuse';

        // Titre uniquement selon le statut - les détails sont dans le dialog
        const title = isRefused
          ? '❌ Leave request refused'
          : '✅ Leave request approved';

        const body = '';

        const data = {
          type: 'leave_validated',
          route: '/home',  // Route de navigation Flutter
          action: 'view_calendar',  // Action spécifique dans l'app
          leaveId: String(leave.id || ''),
          employeeId: String(leave.employee_id ? leave.employee_id[0] : ''),
          dateFrom: String(leave.date_from || ''),
          dateTo: String(leave.date_to || ''),
          leaveName: String(leaveType),
          status: String(leave.state || 'validate'),
          clickAction: 'FLUTTER_NOTIFICATION_CLICK'  // Pour Android
        };

        // Envoie la notification à tous les appareils enregistrés
        //        for (const device of deviceTokens) {
        //          await sendNotification(device.token, title, body, data);
        //        }
        // leave.employee_id peut être un hr.employee id. Il faut mapper vers res.users.user_id
        const hrEmployeeId = leave.employee_id ? String(leave.employee_id[0]) : '';
        let userIdForTokens = null;
        if (hrEmployeeId) {
          userIdForTokens = await getUserIdForEmployee(odooUid, hrEmployeeId);
        }

        // Fallback: si aucun userId trouvé, essayer directement avec l'ID d'employee (au cas où le client enregistre ainsi)
        let targetTokens = [];
        if (userIdForTokens) {
          targetTokens = getTokensForUser(userIdForTokens);
        }
        if (!userIdForTokens || targetTokens.length === 0) {
          // Tentative fallback
          targetTokens = getTokensForUser(hrEmployeeId);
        }

        if ((!userIdForTokens && !hrEmployeeId) || targetTokens.length === 0) {
          console.log(`⏸️ Aucun token trouvé pour l'utilisateur (employeeId=${hrEmployeeId}, userId=${userIdForTokens}) — notification ignorée`);
        } else {
          const targetIdLog = userIdForTokens || hrEmployeeId;
          console.log(`📤 Envoi de la notification au(x) ${targetTokens.length} appareil(s) de l'utilisateur ${targetIdLog}`);
          for (const token of targetTokens) {
            await sendNotification(token, title, body, data);
          }
        }
      }
    }

    // Vérification des nouvelles demandes de congé à approuver
    const pendingLeaves = await checkOdooActivities(odooUid);

    if (pendingLeaves.length > 0) {
      for (const leave of pendingLeaves) {
        const leaveType = leave.holiday_status_id ? leave.holiday_status_id[1] : 'Congé';
        const employeeName = leave.employee_id ? leave.employee_id[1] : 'Un employé';
        const numberOfDays = leave.number_of_days || 'N/A';

        const title = '📋 New leave request to approve/refuse';
        const body = `${employeeName} is requesting ${leaveType} (${numberOfDays} day${numberOfDays > 1 ? 's' : ''})`;

        const data = {
          type: 'leave_approval_request',
          route: '/home',  // Route de navigation Flutter
          action: 'approve_leave',  // Action spécifique dans l'app
          leaveId: String(leave.id || ''),
          leaveName: String(leaveType),
          employeeId: String(leave.employee_id ? leave.employee_id[0] : ''),
          employeeName: String(employeeName),
          dateFrom: String(leave.date_from || ''),
          dateTo: String(leave.date_to || ''),
          numberOfDays: String(numberOfDays),
          notes: String(leave.notes || ''),
          status: 'confirm',
          clickAction: 'FLUTTER_NOTIFICATION_CLICK'  // Pour Android
        };

        // Récupérer l'ID hr.employee et vérifier
        const hrEmployeeId = leave.employee_id ? String(leave.employee_id[0]) : '';
        if (!hrEmployeeId) {
          console.log(`⏸️ Pas d'employé associé à la demande ${leave.id}, notification ignorée`);
          continue;
        }

        // Récupérer le type de congé pour décider du routage
        let leaveTypeInfo = null;
        try {
          if (leave.holiday_status_id && leave.holiday_status_id.length > 0) {
            leaveTypeInfo = await getLeaveType(odooUid, leave.holiday_status_id[0]);
          }
        } catch (err) {
          console.error('❌ Erreur lors de la récupération du type de congé:', err.message);
        }

        const vt = (leaveTypeInfo && leaveTypeInfo.leave_validation_type) ? String(leaveTypeInfo.leave_validation_type).toLowerCase() : '';
        const vname = (leaveTypeInfo && leaveTypeInfo.name) ? String(leaveTypeInfo.name).toLowerCase() : '';

        const containsAny = (str, tokens) => tokens.some(t => str.includes(t));

        const employeeTokens = ['employee', "employee's", 'employe', 'approver', 'approbateur'];
        const timeTokens = ['time off', 'time_off', 'timeoff', 'time', 'officer', 'responsable', 'responsable des congés', 'responsable des conges', 'responsable congé'];
        const bothTokens = ['and', '&', 'et', 'both', 'double'];

        const isEmployeeApprover = containsAny(vt, employeeTokens) || containsAny(vname, employeeTokens);
        const isTimeOffOfficer = containsAny(vt, timeTokens) || containsAny(vname, timeTokens);
        const isBoth = containsAny(vt, bothTokens) || containsAny(vname, bothTokens) || (isEmployeeApprover && isTimeOffOfficer);

        const timeOffOfficerIds = [6, 12];

        // Si le type indique que ce sont les time off officers qui doivent traiter (et pas la double validation), on envoie directement à eux
        if (isTimeOffOfficer && !isBoth) {
          try {
            const titleTO = title;
            const bodyTO = `Nouvelle demande en attente pour les responsables des congés.`;
            for (const uidOfficer of timeOffOfficerIds) {
              const tokens = getTokensForUser(uidOfficer);
              if (tokens.length === 0) continue;
              console.log(`📤 Envoi de la notification aux time off officers (userId: ${uidOfficer}) - ${tokens.length} appareil(s)`);
              for (const token of tokens) {
                await sendNotification(token, titleTO, bodyTO, data);
              }
            }
          } catch (err) {
            console.error('❌ Erreur lors de l\'envoi aux time off officers:', err.message);
          }
          continue; // Ne pas envoyer aussi au leave_manager
        }

        // Sinon (employee approver ou double validation) on notifie le leave_manager (première validation)
        const leaveManagerUserId = await getLeaveManagerForEmployee(odooUid, hrEmployeeId);

        if (!leaveManagerUserId) {
          console.log(`⚠️ Aucun leave_manager_id trouvé pour l'employé ${hrEmployeeId} - envoi à tous les managers/validateurs`);

          // Fallback: envoyer à tous les gestionnaires/validateurs
          const managersAndValidators = deviceTokens.filter(d =>
            d.userRole === 'manager' || d.userRole === 'validator' || d.userRole === 'admin'
          );

          console.log(`📤 Envoi à ${managersAndValidators.length} gestionnaire(s)/validateur(s) (fallback)`);

          for (const device of managersAndValidators) {
            await sendNotification(device.token, title, body, data);
          }
        } else {
          // Envoyer uniquement au manager responsable
          const managerTokens = getTokensForUser(leaveManagerUserId);

          if (managerTokens.length === 0) {
            console.log(`⏸️ Aucun token trouvé pour le manager ${leaveManagerUserId} — notification ignorée`);
          } else {
            console.log(`📤 Envoi de la notification au manager responsable (userId: ${leaveManagerUserId}) - ${managerTokens.length} appareil(s)`);
            for (const token of managerTokens) {
              await sendNotification(token, title, body, data);
            }
          }
        }
      }
    }

    // Vérification des demandes passées en Second approval
    const secondApprovals = await checkOdooSecondApprovals(odooUid);
    if (secondApprovals.length > 0) {
      // Envoyer aux time off officers (IDs configurés ici)
      const timeOffOfficerIds = [6, 12];
      for (const leave of secondApprovals) {
        const title2 = `🔔 New request waiting for approval`;
        const body2 = `${leave.employee_id ? leave.employee_id[1] : 'An employee'} - ${leave.holiday_status_id ? leave.holiday_status_id[1] : ''}`;
        // récupérer le type et vérifier si c'est vraiment a notifier
        for (const uidOfficer of timeOffOfficerIds) {
          const tokens = getTokensForUser(uidOfficer);
          if (tokens.length === 0) continue;
          console.log(`📤 Envoi de la notification de Second approval à user ${uidOfficer} - ${tokens.length} appareil(s)`);
          for (const token of tokens) {
            await sendNotification(token, title2, body2, { leaveId: String(leave.id), status: 'second_approval' });
          }
        }
      }
    }

    // Vérification des nouvelles allocations (requests for allocation)
    const allocations = await checkOdooAllocations(odooUid);
    if (allocations.length > 0) {
      const timeOffOfficerIds = [6, 12];
      for (const alloc of allocations) {
        const titleAlloc = `📦 New allocation request waiting for approval`;
        const bodyAlloc = `${alloc.employee_id ? alloc.employee_id[1] : 'An employee'} - ${alloc.number_of_days || ''} day(s)`;
        for (const uidOfficer of timeOffOfficerIds) {
          const tokens = getTokensForUser(uidOfficer);
          if (tokens.length === 0) continue;
          console.log(`📤 Envoi de la notification d'allocation à user ${uidOfficer} - ${tokens.length} appareil(s)`);
          for (const token of tokens) {
            await sendNotification(token, titleAlloc, bodyAlloc, { allocationId: String(alloc.id), action: 'view_allocation' });
          }
        }
      }
    }
  }, 30000); // 30 secondes
}

// Récupère le user_id (res.users) lié à un hr.employee (si présent)
async function getUserIdForEmployee(uid, employeeId) {
  try {
    if (!employeeId) return null;
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
          'hr.employee',
          'search_read',
          [[['id', '=', parseInt(employeeId)] ]],
          { fields: ['id', 'user_id'] }
        ]
      },
      id: 1
    });

    const rows = response.data.result || [];
    if (rows.length > 0 && rows[0].user_id && rows[0].user_id.length > 0) {
      return String(rows[0].user_id[0]);
    }

    return null;
  } catch (error) {
    console.error('❌ Erreur lors du mapping employee->user:', error.message);
    return null;
  }
}

// Récupère le leave_manager_id (res.users) d'un hr.employee pour savoir qui doit recevoir les notifications
async function getLeaveManagerForEmployee(uid, employeeId) {
  try {
    if (!employeeId) return null;

    console.log(`🔍 Recherche du leave_manager_id pour l'employé ${employeeId}...`);

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
          'hr.employee',
          'search_read',
          [[['id', '=', parseInt(employeeId)] ]],
          { fields: ['id', 'name', 'leave_manager_id'] }
        ]
      },
      id: 1
    });

    const rows = response.data.result || [];
    if (rows.length > 0) {
      const employee = rows[0];
      console.log(`📋 Employé trouvé: ${employee.name} (ID: ${employee.id})`);

      if (employee.leave_manager_id && employee.leave_manager_id.length > 0) {
        const managerId = String(employee.leave_manager_id[0]);
        const managerName = employee.leave_manager_id[1];
        console.log(`✅ Leave manager trouvé: ${managerName} (ID: ${managerId})`);
        return managerId;
      } else {
        console.log(`⚠️ Aucun leave_manager_id défini pour l'employé ${employee.name}`);
      }
    }

    return null;
  } catch (error) {
    console.error('❌ Erreur lors de la récupération du leave_manager_id:', error.message);
    return null;
  }
}

// Récupère les informations d'un type de congé (hr.leave.type)
async function getLeaveType(uid, leaveTypeId) {
  try {
    if (!leaveTypeId) return null;
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
          'hr.leave.type',
          'search_read',
          [[['id', '=', parseInt(leaveTypeId)]]],
          { fields: ['id', 'name', 'leave_validation_type'] }
        ]
      },
      id: 1
    });

    const rows = response.data.result || [];
    if (rows.length > 0) return rows[0];
    return null;
  } catch (error) {
    console.error('❌ Erreur lors de la récupération du hr.leave.type:', error.message);
    return null;
  }
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
