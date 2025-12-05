# Backend Notifications Odoo → Flutter

Serveur backend qui interroge l'API Odoo et envoie des notifications push via Firebase Cloud Messaging.

## 📋 Types de notifications

### 1. Absences validées (leave_validated)
Notifie tous les utilisateurs lorsqu'une absence est validée dans Odoo.

### 2. Demandes d'approbation (leave_approval_request)
Notifie les managers/validateurs lorsqu'une nouvelle activité d'approbation de congé est créée dans Odoo.

**Données incluses dans la notification :**
- `activityId` : ID de l'activité Odoo
- `leaveId` : ID de la demande de congé
- `leaveName` : Nom de la demande
- `userId` : ID de l'utilisateur assigné
- `userName` : Nom de l'utilisateur assigné
- `deadline` : Date limite de traitement
- `summary` : Résumé de l'activité
- `note` : Notes additionnelles

## 📋 Configuration

### 1. Installe les dépendances

```bash
cd backend-notif
npm install
```

### 2. Configure Firebase Admin

1. Va sur [Firebase Console](https://console.firebase.google.com)
2. Sélectionne ton projet
3. **Paramètres du projet** → **Comptes de service**
4. Clique sur **"Générer une nouvelle clé privée"**
5. Renomme le fichier en `firebase-admin-key.json`
6. Place-le dans ce dossier (`backend-notif/`)

### 3. Configure Odoo

Dans `server.js`, modifie les lignes 13-18 :

```javascript
const ODOO_CONFIG = {
  url: 'https://ton-odoo.com',      // Ton URL Odoo
  db: 'ta_base_de_donnees',         // Nom de ta DB
  username: 'ton.email@example.com', // Ton email
  password: 'ton_mot_de_passe',      // Ton mot de passe
};
```

### 4. Active Firebase Admin

Dans `server.js`, décommente les lignes 9-13 :

```javascript
const serviceAccount = require('./firebase-admin-key.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
```

### 5. Active le polling

Dans `server.js`, décommente la ligne 290 :

```javascript
startPolling();
```

### 6. Active l'envoi réel des notifications

Dans `server.js`, décommente les lignes 182-206 et commente les lignes 208-209.

## 🚀 Démarrage

### En local (pour tester)

```bash
npm start
```

Le serveur démarre sur `http://localhost:3000`

### En développement (avec auto-reload)

```bash
npm run dev
```

## 🌐 Déploiement sur Railway

1. Crée un compte sur [Railway.app](https://railway.app)
2. Clique sur **"New Project"** → **"Deploy from GitHub repo"**
3. Sélectionne ce dossier (`backend-notif`)
4. Railway détecte automatiquement Node.js
5. Note l'URL donnée (ex: `https://backend-notif-production.up.railway.app`)

### Variables d'environnement Railway

Railway détecte automatiquement `PORT`. Si besoin, ajoute :

- `NODE_ENV=production`

## 📡 Endpoints

### `GET /`
Health check du serveur

Réponse :
```json
{
  "status": "ok",
  "service": "Backend Notifications Odoo",
  "registeredDevices": 2,
  "lastCheck": "2024-12-04T12:00:00.000Z"
}
```

### `POST /register_token`
Enregistre un token FCM

Body :
```json
{
  "token": "fcm_token_ici",
  "userId": "user123"
}
```

### `POST /unregister_token`
Supprime un token FCM

Body :
```json
{
  "token": "fcm_token_ici"
}
```

### `GET /devices`
Liste les appareils enregistrés (debug)

## 🔧 Fonctionnement

1. Le serveur s'authentifie auprès d'Odoo
2. Toutes les 30 secondes, il interroge l'API Odoo pour :
   - Les nouvelles absences validées (`hr.leave` avec `state='validate'`)
   - Les nouvelles activités d'approbation (`mail.activity` liées aux congés)
3. Si de nouvelles absences sont détectées, il envoie une notification à tous les appareils enregistrés
4. Si de nouvelles activités d'approbation sont détectées, il envoie une notification aux managers/validateurs
5. Les IDs déjà traités sont mémorisés pour éviter les doublons
6. Les tokens invalides sont automatiquement supprimés

## 📚 Documentation supplémentaire

- **[ACTIVITIES_GUIDE.md](./ACTIVITIES_GUIDE.md)** : Guide détaillé sur les notifications d'activités d'approbation
- **[DEPLOY_GUIDE.md](./DEPLOY_GUIDE.md)** : Guide de déploiement
- **[flutter_notification_handler_example.dart](./flutter_notification_handler_example.dart)** : Exemple de gestion des notifications dans Flutter

## 📝 TODO après configuration

- [ ] Remplacer les placeholders Odoo (url, db, username, password)
- [ ] Ajouter `firebase-admin-key.json`
- [ ] Décommenter les lignes Firebase Admin
- [ ] Décommenter `startPolling()`
- [ ] Décommenter la fonction `sendNotification` réelle
- [ ] Tester en local
- [ ] Déployer sur Railway
- [ ] Mettre à jour l'URL dans `firebase_service.dart`

## ⚠️ Sécurité

**NE COMMITE JAMAIS** :
- `firebase-admin-key.json`
- Les mots de passe Odoo dans le code

Ajoute au `.gitignore` :
```
firebase-admin-key.json
node_modules/
.env
```

## 🐛 Debug

Vérifie les logs pour :
- ✅ Authentification Odoo réussie
- ✅ Token FCM enregistré
- 📬 Nouvelles absences détectées
- ✅ Notifications envoyées

## 📞 Support

Si tu as des problèmes, vérifie :
1. Les credentials Odoo sont corrects
2. `firebase-admin-key.json` est présent
3. Le port 3000 est disponible
4. Les logs du serveur

