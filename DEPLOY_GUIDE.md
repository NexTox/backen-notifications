# 🚀 DÉPLOIEMENT BACKEND - Guide Express

## ⚡ SOLUTION LA PLUS SIMPLE : Render.com

### Étape 1 : Prépare ton projet (2 min)

Tu n'as même pas besoin de GitHub ! Voici comment :

1. **Crée un compte sur Render** : https://render.com
2. Clique sur **"New +"** → **"Web Service"**
3. Sélectionne **"Public Git repository"**

### Étape 2 : Pousse sur GitHub (5 min)

Ou crée un vrai repo GitHub :

```bash
# 1. Va sur https://github.com/new
# 2. Crée un repo "backend-notif-odoo"
# 3. Copie l'URL (ex: https://github.com/USERNAME/backend-notif-odoo.git)

# 4. Exécute :
cd C:\FLUUUUUUUTTTTTEEEERRRR\groupe05\backend-notif
git remote remove origin
git remote add origin https://github.com/USERNAME/backend-notif-odoo.git
git push -u origin main
```

### Étape 3 : Déploie sur Render

1. Sur Render, clique sur **"Connect repository"**
2. Sélectionne ton repo `backend-notif-odoo`
3. Configure :
   - **Name** : `backend-notif`
   - **Environment** : `Node`
   - **Build Command** : `npm install`
   - **Start Command** : `npm start`
   - **Plan** : `Free`

4. Clique sur **"Create Web Service"**

5. **IMPORTANT** : Ajoute le fichier `firebase-admin-key.json` :
   - Va dans **Environment** → **Secret Files**
   - Clique sur **"Add Secret File"**
   - Filename : `firebase-admin-key.json`
   - Contents : Colle le contenu de ton fichier
   - Clique sur **"Save"**

6. **Render te donne une URL** : `https://backend-notif-abc123.onrender.com`

### Étape 4 : Mets à jour Flutter

Dans `frontend/lib/services/firebase_service.dart` ligne 73 :

```dart
const String backendUrl = 'https://backend-notif-abc123.onrender.com/register_token';
```

---

## 🎯 ALTERNATIVE : Railway CLI (Si tu préfères)

```bash
# 1. Login
railway login

# 2. Initialise le projet
railway init

# 3. Déploie
railway up

# 4. Note l'URL
railway domain
```

---

## 🔥 ENCORE PLUS RAPIDE : Utilise Railway Web UI

1. Va sur **https://railway.app**
2. **New Project** → **Empty Project**
3. **Add Service** → **Empty Service**
4. Dans le service, va dans **Settings** :
   - **Source** : Clique sur **"Deploy from GitHub repo"**
   - OU clique sur **"Deploy from local directory"**
   
5. Si tu choisis "local directory" :
   - Installe Railway CLI : `npm install -g @railway/cli`
   - Login : `railway login`
   - Link : `railway link`
   - Deploy : `railway up`

---

## ✅ RÉSUMÉ

**Le plus simple :**
1. Crée un repo GitHub
2. Pousse ton code
3. Déploie sur Render.com (gratuit, simple)
4. Copie l'URL dans Flutter

**Temps total : 10 minutes**

---

## 📝 Commandes Git complètes

```bash
# Va sur https://github.com/new et crée "backend-notif-odoo"
# Remplace USERNAME par ton username GitHub

cd C:\FLUUUUUUUTTTTTEEEERRRR\groupe05\backend-notif

# Retire l'ancien remote
git remote remove origin

# Ajoute le nouveau (CHANGE USERNAME!)
git remote add origin https://github.com/USERNAME/backend-notif-odoo.git

# Push
git push -u origin main
```

Si ça demande un mot de passe, utilise un **Personal Access Token** :
1. GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate new token → Sélectionne "repo"
3. Copie le token
4. Utilise-le comme mot de passe

---

Choisis la méthode qui te convient ! 🚀

