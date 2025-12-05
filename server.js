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

// Stockage du dernier ID d'absence vérifié (pour éviter les doublons)
let lastCheckedLeaveId = 0;

// Stockage du dernier ID d'activité vérifié (pour éviter les doublons)
let lastCheckedActivityId = 0;

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
          [[['state', 'in', ['validate', 'refuse']], ['id', '>', lastCheckedLeaveId]]],
          {
            fields: ['id', 'name', 'employee_id', 'date_from', 'date_to', 'holiday_status_id', 'state'],
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

      // Debug: afficher les données récupérées
      leaves.forEach(leave => {
        console.log(`   - ID: ${leave.id}, Type: ${leave.holiday_status_id ? leave.holiday_status_id[1] : 'N/A'}, État: ${leave.state}`);
      });
    }

    return leaves;
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des absences:', error.message);
    return [];
  }
}

// Récupère les nouvelles demandes de congé en attente d'approbation depuis Odoo
async function checkOdooActivities(uid) {
  try {
    // Méthode alternative: récupérer directement les demandes de congé en attente
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
          [[
            ['state', '=', 'confirm'],  // État "À approuver"
            ['id', '>', lastCheckedActivityId]
          ]],
          {
            fields: ['id', 'name', 'employee_id', 'date_from', 'date_to', 'holiday_status_id', 'state', 'number_of_days', 'notes'],
            limit: 10,
            order: 'id DESC'
          }
        ]
      },
      id: 1
    });

    const pendingLeaves = response.data.result || [];

    if (pendingLeaves.length > 0) {
      // Met à jour le dernier ID vérifié
      lastCheckedActivityId = Math.max(...pendingLeaves.map(l => l.id));
      console.log(`📋 ${pendingLeaves.length} nouvelle(s) demande(s) de congé à approuver détectée(s)`);

      // Debug: afficher les données récupérées
      pendingLeaves.forEach(leave => {
        console.log(`   - ID: ${leave.id}, Employé: ${leave.employee_id ? leave.employee_id[1] : 'N/A'}, Type: ${leave.holiday_status_id ? leave.holiday_status_id[1] : 'N/A'}`);
      });
    }

    return pendingLeaves;
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des demandes à approuver:', error.message);
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

    console.log('🔍 Vérification des nouvelles absences et activités Odoo...');

    // Vérification des absences validées ET refusées
    const newLeaves = await checkOdooLeaves(odooUid);

    if (newLeaves.length > 0) {
      for (const leave of newLeaves) {
        const leaveType = leave.holiday_status_id ? leave.holiday_status_id[1] : 'Absence';
        const isRefused = leave.state === 'refuse';

        // Titre et corps de la notification selon le statut
        const title = isRefused
          ? '❌ Demande de congé refusée'
          : '🎉 Demande de congé approuvée';

        const body = isRefused
          ? `Votre ${leaveType} a été refusée`
          : `Votre ${leaveType} a été approuvée`;

        const data = {
          type: 'leave_validated',
          route: '/home',  // Route de navigation Flutter
          action: 'view_calendar',  // Action spécifique dans l'app
          leaveId: String(leave.id || ''),
          employeeId: String(leave.employee_id ? leave.employee_id[0] : ''),
          employeeName: String(leave.employee_id ? leave.employee_id[1] : ''),
          dateFrom: String(leave.date_from || ''),
          dateTo: String(leave.date_to || ''),
          leaveName: String(leaveType),
          status: String(leave.state || 'validate'),
          clickAction: 'FLUTTER_NOTIFICATION_CLICK'  // Pour Android
        };

        // Envoie la notification à tous les appareils enregistrés
        for (const device of deviceTokens) {
          await sendNotification(device.token, title, body, data);
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

        const title = '📋 Nouvelle demande de congé à approuver';
        const body = `${employeeName} demande un ${leaveType} (${numberOfDays} jour${numberOfDays > 1 ? 's' : ''})`;

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

        // Filtrer pour envoyer uniquement aux gestionnaires/validateurs
        const managersAndValidators = deviceTokens.filter(d => 
          d.userRole === 'manager' || d.userRole === 'validator' || d.userRole === 'admin'
        );
        
        console.log(`📤 Envoi à ${managersAndValidators.length} gestionnaire(s)/validateur(s)`);
        
        for (const device of managersAndValidators) {
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

