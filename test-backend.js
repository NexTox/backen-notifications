const axios = require('axios');

// Configuration
const BACKEND_URL = 'http://localhost:3000'; // Change si déployé sur Railway

// Couleurs pour la console
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

async function testHealthCheck() {
  console.log(`\n${colors.blue}🔍 Test Health Check...${colors.reset}`);
  try {
    const response = await axios.get(`${BACKEND_URL}/`);
    console.log(`${colors.green}✅ Serveur opérationnel${colors.reset}`);
    console.log(JSON.stringify(response.data, null, 2));
    return true;
  } catch (error) {
    console.log(`${colors.red}❌ Erreur: ${error.message}${colors.reset}`);
    return false;
  }
}

async function testRegisterToken() {
  console.log(`\n${colors.blue}🔍 Test Register Token...${colors.reset}`);
  try {
    const response = await axios.post(`${BACKEND_URL}/register_token`, {
      token: 'test_token_' + Date.now(),
      userId: 'test_user_123'
    });
    console.log(`${colors.green}✅ Token enregistré${colors.reset}`);
    console.log(JSON.stringify(response.data, null, 2));
    return true;
  } catch (error) {
    console.log(`${colors.red}❌ Erreur: ${error.message}${colors.reset}`);
    return false;
  }
}

async function testGetDevices() {
  console.log(`\n${colors.blue}🔍 Test Get Devices...${colors.reset}`);
  try {
    const response = await axios.get(`${BACKEND_URL}/devices`);
    console.log(`${colors.green}✅ Liste des appareils récupérée${colors.reset}`);
    console.log(JSON.stringify(response.data, null, 2));
    return true;
  } catch (error) {
    console.log(`${colors.red}❌ Erreur: ${error.message}${colors.reset}`);
    return false;
  }
}

async function runAllTests() {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`${colors.yellow}🧪 Test du Backend Notifications${colors.reset}`);
  console.log(`${'='.repeat(50)}`);

  const results = {
    healthCheck: await testHealthCheck(),
    registerToken: await testRegisterToken(),
    getDevices: await testGetDevices()
  };

  console.log(`\n${'='.repeat(50)}`);
  console.log(`${colors.yellow}📊 Résumé des tests${colors.reset}`);
  console.log(`${'='.repeat(50)}`);

  Object.entries(results).forEach(([test, passed]) => {
    const status = passed ? `${colors.green}✅ PASS${colors.reset}` : `${colors.red}❌ FAIL${colors.reset}`;
    console.log(`${test.padEnd(20)} : ${status}`);
  });

  const allPassed = Object.values(results).every(r => r === true);
  if (allPassed) {
    console.log(`\n${colors.green}🎉 Tous les tests sont passés !${colors.reset}`);
  } else {
    console.log(`\n${colors.red}❌ Certains tests ont échoué${colors.reset}`);
  }

  console.log(`\n${'='.repeat(50)}\n`);
}

// Exécute les tests
runAllTests().catch(error => {
  console.error(`${colors.red}Erreur fatale:${colors.reset}`, error);
  process.exit(1);
});

