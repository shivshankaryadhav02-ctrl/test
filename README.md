# RemoteLink — Relay Server

A self-hosted relay server for RemoteLink remote control app.  
Built with **Node.js + Express + Socket.io + MongoDB**.

## 🚀 Quick Deploy to Railway

1. Fork/push this repo to your GitHub
2. Go to [railway.com](https://railway.com) → **New Project** → **Deploy from GitHub**
3. Select this repo
4. Add the following **Environment Variables** in Railway dashboard:

| Variable | Value |
|----------|-------|
| `APP_NAME` | Your app name (e.g. `RemoteLink`) |
| `MONGODB_URI` | Your MongoDB Atlas connection string |
| `JWT_SECRET` | A long random secret (64+ chars) |

5. Click **Deploy** — Railway will auto-build and give you a URL like `https://your-app.up.railway.app`

## 📁 Server Structure

```
server/
├── index.js           ← Main Express + Socket.io server
├── models/
│   ├── User.js        ← User accounts (email, password, plan)
│   └── Device.js      ← Device tracking
├── routes/
│   ├── auth.js        ← POST /api/auth/register, /login, GET /api/auth/me
│   └── devices.js     ← POST /api/devices/track-install
├── middleware/
│   └── auth.js        ← JWT verification
├── .env.example       ← Environment variable template
└── package.json
```

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/register` | Create new account |
| `POST` | `/api/auth/login` | Login, returns JWT token |
| `GET`  | `/api/auth/me` | Get current user (requires Bearer token) |
| `POST` | `/api/devices/track-install` | Register a new desktop device |
| `GET`  | `/api/devices/by-token/:token` | Get device by pairing token |
| `GET`  | `/health` | Health check |

## 🔒 Socket.io Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `identify` | Client → Server | Desktop/mobile announces itself with pairingToken |
| `to-mobile` | Desktop → Server | Relay data to mobile (screen frames, etc.) |
| `command:*` | Mobile → Server | Commands relayed to desktop |
| `webrtc:*` | Both | WebRTC signaling relayed |

## 📦 Local Development

```bash
cd server
cp .env.example .env
# Fill in your values in .env
npm install
npm run dev
```