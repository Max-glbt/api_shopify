# API Shopify Loyalty

API Node.js/TypeScript pour gérer un système de points de fidélité via les webhooks Shopify.

## Résumé

Cette API reçoit des webhooks Shopify lors de la création de commandes et ajoute des points de fidélité aux clients (1€ = 1 point). Le système gère la déduplication des webhooks et les race conditions avec 50+ requêtes simultanées.

## Architecture

```
api_shopify/
├── src/
│   ├── config/
│   │   ├── database.ts      # PostgreSQL pool & schema
│   │   └── redis.ts         # Redis queue & deduplication
│   ├── security/
│   │   └── hmacVerification.ts  # HMAC SHA256 validation
│   ├── services/
│   │   ├── loyaltyService.ts    # Points management
│   │   └── webhookWorker.ts     # Background worker
│   └── index.ts             # Express server
├── scripts/
│   └── test.js              # Test suite
├── Dockerfile
├── docker-compose.yml
├── package.json
└── tsconfig.json
```

## Prérequis

- Docker Desktop
- Node.js 18+ (pour les tests)

## Installation

```bash
# Cloner le projet
git clone <repo-url>
cd api_shopify

# Installer les dépendances
npm install
```

## Démarrage

```bash
# Lancer les 3 services (postgres, redis, api)
docker-compose up

# Ou en arrière-plan
docker-compose up -d

# Vérifier les logs
docker-compose logs -f api
```

L'API démarre sur `http://localhost:3000`

## Endpoints

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/webhooks/orders/create` | Recevoir un webhook Shopify |
| GET | `/customers/:email/balance` | Consulter le solde d'un client |
| GET | `/customers` | Lister tous les clients |
| GET | `/health` | Health check |

## Tests

```bash
# Lancer la suite de tests (6 scénarios)
npm test
```

**Scénarios testés** :
- Webhook simple (10€ → 10 points)
- Cumul de points (commandes multiples)
- Déduplication (webhook dupliqué ignoré)
- Validation devise (USD rejeté)
- Race condition 50 webhooks simultanés
- Race condition 200 webhooks simultanés

## Technologies

- **Node.js 18** + TypeScript
- **PostgreSQL 15** (stockage clients/transactions)
- **Redis 7** (queue + déduplication)
- **Express 4** (API REST)
- **Docker Compose** (orchestration)

## Sécurité

- Vérification HMAC SHA256 des webhooks Shopify
- Isolation SERIALIZABLE PostgreSQL (race conditions)
- Déduplication Redis (TTL 24h)

## Arrêt

```bash
# Arrêter tous les services
docker-compose down

# Supprimer aussi les volumes
docker-compose down -v
```
# Test project --No real utility. Maxence Guilbot -PreMsc Epitech

# Lien vers la video explicative : https://www.loom.com/share/08843dac097148819b701ac65abd5c76
