// Script de test rapide pour vérifier les états de congés dans Odoo
const axios = require('axios');

const ODOO_CONFIG = {
  url: 'https://ipl-pfe-2025-groupe05-main-26038931.dev.odoo.com',
  db: 'ipl-pfe-2025-groupe05-main-26038931',
  username: 'c.relais@atl.be',
  password: 'StumbleDev123!',
};

async function testRefusedLeaves() {
  console.log('🚀 Test de détection des congés refusés\n');

  // 1. Authentification
  console.log('1️⃣ Authentification...');
  const authResponse = await axios.post(`${ODOO_CONFIG.url}/jsonrpc`, {
    jsonrpc: '2.0',
    method: 'call',
    params: {
      service: 'common',
      method: 'authenticate',
      args: [ODOO_CONFIG.db, ODOO_CONFIG.username, ODOO_CONFIG.password, {}]
    },
    id: 1
  });

  const uid = authResponse.data.result;
  console.log(`✅ Authentifié (UID: ${uid})\n`);

  // 2. Récupérer TOUS les congés récents
  console.log('2️⃣ Récupération des 20 derniers congés...');
  const allLeavesResponse = await axios.post(`${ODOO_CONFIG.url}/jsonrpc`, {
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
        [[]],
        {
          fields: ['id', 'name', 'state', 'employee_id'],
          limit: 20,
          order: 'id DESC'
        }
      ]
    },
    id: 1
  });

  const allLeaves = allLeavesResponse.data.result || [];
  console.log(`📊 ${allLeaves.length} congés trouvés\n`);

  // 3. Grouper par état
  const byState = {};
  allLeaves.forEach(leave => {
    const state = leave.state || 'unknown';
    if (!byState[state]) byState[state] = [];
    byState[state].push(leave);
  });

  console.log('📋 États trouvés:');
  Object.keys(byState).sort().forEach(state => {
    const count = byState[state].length;
    const emoji = state === 'validate' ? '✅' :
                  state === 'refuse' ? '❌' :
                  state === 'refused' ? '❌' :
                  state === 'draft' ? '📝' :
                  state === 'confirm' ? '⏳' : '❓';
    console.log(`   ${emoji} "${state}": ${count} congé(s)`);

    // Afficher les 3 premiers de chaque état
    byState[state].slice(0, 3).forEach(leave => {
      console.log(`      - ID ${leave.id}: ${leave.name || 'Sans nom'}`);
    });
  });

  // 4. Test spécifique pour 'refuse'
  console.log('\n3️⃣ Test spécifique: state = "refuse"');
  const refuseResponse = await axios.post(`${ODOO_CONFIG.url}/jsonrpc`, {
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
        [[['state', '=', 'refuse']]],
        {
          fields: ['id', 'name', 'state'],
          limit: 5
        }
      ]
    },
    id: 1
  });

  const refuseLeaves = refuseResponse.data.result || [];
  console.log(`   Résultat: ${refuseLeaves.length} congé(s) avec state="refuse"`);

  // 5. Test spécifique pour 'refused'
  console.log('\n4️⃣ Test spécifique: state = "refused"');
  const refusedResponse = await axios.post(`${ODOO_CONFIG.url}/jsonrpc`, {
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
        [[['state', '=', 'refused']]],
        {
          fields: ['id', 'name', 'state'],
          limit: 5
        }
      ]
    },
    id: 1
  });

  const refusedLeaves = refusedResponse.data.result || [];
  console.log(`   Résultat: ${refusedLeaves.length} congé(s) avec state="refused"`);

  // 6. Conclusion
  console.log('\n' + '='.repeat(50));
  console.log('✅ CONCLUSION:');

  const refusedStates = Object.keys(byState).filter(s =>
    s.includes('refuse') || s.includes('reject') || s.includes('denied')
  );

  if (refusedStates.length > 0) {
    console.log(`   État(s) de refus trouvé(s): ${refusedStates.join(', ')}`);
    console.log(`   ➡️  Utilisez: state in [${refusedStates.map(s => `'${s}'`).join(', ')}]`);

    // Afficher l'ID max des refusés
    const allRefused = refusedStates.flatMap(state => byState[state]);
    if (allRefused.length > 0) {
      const maxId = Math.max(...allRefused.map(l => l.id));
      console.log(`\n   📌 ID maximum des congés refusés: ${maxId}`);
      console.log(`   ➡️  Le serveur doit avoir lastCheckedRefusedLeaveId < ${maxId} pour les détecter`);
      console.log(`   ➡️  Actuellement le serveur a: lastCheckedRefusedLeaveId = 0`);
      console.log(`\n   ⚠️  PROBLÈME: Les congés refusés existants ont été créés AVANT le démarrage du serveur`);
      console.log(`   ✅  SOLUTION: Refusez une NOUVELLE demande dans Odoo (ID > ${maxId})`);
    }
  } else {
    console.log('   ⚠️  AUCUN état de refus trouvé dans les 20 derniers congés');
    console.log('   ➡️  Refusez d\'abord une demande dans Odoo, puis relancez ce test');
  }
  console.log('='.repeat(50));
}

testRefusedLeaves().catch(error => {
  console.error('❌ Erreur:', error.message);
  process.exit(1);
});

