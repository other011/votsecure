# ⬡ VotSecure — Sistem Electoral Criptografic

> Prototip funcțional de vot electronic securizat cu PostgreSQL, AES-256-GCM,
> blockchain Ethereum (Hardhat) și arhitectură modulară separată pe componente.

---

## Cuprins

1. [Arhitectură](#arhitectură)
2. [Cerințe sistem](#cerințe-sistem)
3. [Instalare rapidă](#instalare-rapidă)
4. [Configurare](#configurare)
5. [Rulare](#rulare)
6. [Testare](#testare)
7. [Securitate](#securitate)
8. [Structura proiectului](#structura-proiectului)

---

## Arhitectură

```
[Frontend React] ←HTTPS→ [Backend Express] ←pg→ [PostgreSQL]
                                    ↕
                              [ethers.js]
                                    ↕
                          [Ethereum / Hardhat]
                          [VotSecure.sol]
```

**Separare off-chain / on-chain:**

| Date | Stocare |
|------|---------|
| Utilizatori, CNP, parole hash | PostgreSQL |
| Voturi criptate (AES-256-GCM) | PostgreSQL |
| Sesiuni electorale | PostgreSQL |
| Jurnal audit imutabil | PostgreSQL |
| Hash-uri voturi (integritate) | Ethereum on-chain |
| Token anti-replay (voterToken) | Ethereum on-chain |

---

## Cerințe sistem

- **Node.js** ≥ 18.0
- **PostgreSQL** ≥ 14
- **npm** ≥ 9

---

## Instalare rapidă

### 1. Clonare și instalare dependențe

```bash
git clone https://github.com/your-org/votsecure.git
cd votsecure

# Backend
cd backend && npm install

# Blockchain
cd ../blockchain && npm install
```

### 2. Configurare bază de date

```bash
# Creare BD
psql -U postgres -c "CREATE DATABASE votsecure;"
psql -U postgres -c "CREATE USER votsecure_user WITH PASSWORD 'parola_ta';"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE votsecure TO votsecure_user;"

# Aplicare schema
psql -U votsecure_user -d votsecure -f config/schema.sql
```

### 3. Configurare variabile de mediu

```bash
cp config/.env.example config/.env
# Editați config/.env cu valorile reale
```

**Câmpuri obligatorii în `.env`:**

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=votsecure
DB_USER=votsecure_user
DB_PASSWORD=parola_ta

JWT_SECRET=<min 64 caractere random>
PASSWORD_PEPPER=<min 32 caractere random>
VOTER_TOKEN_PEPPER=<min 32 caractere random>
```

### 4. Deploy smart contract (opțional)

```bash
cd blockchain

# Pornire nod local Hardhat
npx hardhat node

# Deploy contract (terminal separat)
npx hardhat run scripts/deploy.js --network localhost
# → Salvează adresa în config/contract-address.json
```

---

## Rulare

```bash
# Backend (development)
cd backend
npm run dev
# → http://localhost:4000

# Frontend (development)
cd frontend
npm run dev
# → http://localhost:3000
```

### Health check

```bash
curl http://localhost:4000/health
```

---

## Testare

### Teste unitare (backend)

```bash
cd backend
npm test
# → Rulează cnpValidator.test.js + cryptoService.test.js
```

### Teste integrare (backend)

```bash
cd backend
npm test -- --testPathPattern=integration
```

### Teste smart contract (Hardhat)

```bash
cd blockchain
npx hardhat test
# → Rulează VotSecure.test.js
```

---

## Securitate

### Algoritmi criptografici

| Operație | Algoritm | Note |
|----------|----------|------|
| Hash parole | SHA-256 + Pepper | `timingSafeEqual` pentru comparare |
| Criptare vot | AES-256-GCM | Autentificat, nonce 96-bit CSPRNG |
| Token alegător | SHA-256 + Pepper | Anonim, ireversibil |
| Cod verificare | HMAC-SHA256 | 16 char uppercase hex |
| JWT | HS256 | Expiră în 8h |
| Transport | HTTPS (TLS 1.3) | — |

### Mecanisme anti-atac

| Atac | Mecanism |
|------|----------|
| Vot multiplu | UNIQUE(voter_token, election_id) în BD + smart contract |
| Replay attack | Nonce CSPRNG per vot + timestamp |
| Brute force | Blocare cont după 5 tentative, 15 min |
| User enumeration | Mesaj de eroare generic |
| Timing attack | `crypto.timingSafeEqual` |
| SQL injection | Query parametrizate (pg) |
| Modificare vot | Hash chaining blockchain |
| DoS | Rate limiting global + per-rută |

### Validare CNP

Validare în **două straturi**:

1. **Frontend** (`cnpValidator.js`) — feedback imediat
2. **Backend** (`cnpValidator.js` + middleware Express) — validare autoritativă

Reguli:
- 13 cifre exacte
- Prima cifră: 1, 2, 5 sau 6
- Cifrele 2-3 (an): NU între 08 și 26
- Cifrele 4-5 (lună): 01–12
- Cifrele 6-7 (zi): 01–31
- Cifrele 8-9 (județ): 01–52

---

## API Reference

### Autentificare

```
POST /api/auth/register
Body: { name, email, cnp, password }
→ 201: { user, token }

POST /api/auth/login
Body: { email, password }
→ 200: { user, token }

GET /api/auth/me
Auth: Bearer <token>
→ 200: { user }
```

### Votare

```
GET  /api/vote/elections
POST /api/vote/cast
     Body: { electionId, candidateId }
     → 201: { receiptCode, voteHash, blockchainTx }

GET  /api/vote/elections/:id/results
POST /api/vote/verify
     Body: { receiptCode, electionId }
```

### Admin

```
POST  /api/admin/elections
PATCH /api/admin/elections/:id/close
GET   /api/admin/users
GET   /api/admin/audit
GET   /api/admin/stats
```

---

## Structura proiectului

```
votsecure/
├── blockchain/          ← Hardhat + Solidity
├── backend/             ← Express API
│   ├── src/
│   │   ├── auth/        ← authService.js
│   │   ├── vote/        ← voteService.js
│   │   ├── crypto/      ← cryptoService.js
│   │   ├── validation/  ← cnpValidator.js
│   │   ├── blockchain/  ← blockchainService.js
│   │   ├── db/          ← pool.js
│   │   ├── middleware/  ← authMiddleware.js
│   │   └── audit/       ← logger.js, auditService.js
│   ├── routes/
│   ├── tests/
│   └── server.js
├── frontend/            ← React
│   └── src/
│       ├── components/
│       └── utils/
├── docs/                ← Diagrame arhitectură & UML
└── config/              ← .env.example, schema.sql
```

---

## Licență

MIT — VotSecure Team 2024
