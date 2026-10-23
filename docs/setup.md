# TrafficSense: Complete Setup & Deployment Guide

This guide walks through everything required to install, run the app locally with Docker, and expose it to the internet using a free Cloudflare Tunnel so anyone can access it on mobile or remotely.

---

## 1. What to Install (Host Prerequisites)

TrafficSense is fully containerized. **You do NOT need to install Node.js, pnpm, Python, or PostgreSQL on your host computer.**

The only software you need on your machine is:

| Software | Version | Purpose | Installation Link / Command |
|---|---|---|---|
| **Git** | Any modern version | Clone the repository | `sudo apt install git` (Ubuntu/Debian) or `brew install git` (Mac) |
| **Docker Engine & Docker Compose** | Docker 24+ & Compose v2+ | Runs Next.js app, PostgreSQL/PostGIS, Supabase backend | [Get Docker](https://docs.docker.com/engine/install/) |
| **Just** *(Optional shortcut runner)* | Any version | Convenient one-word commands (`just up`, `just tunnel`) | `sudo apt install just` or `cargo install just` or `brew install just` |

> [!NOTE]
> All build dependencies (`Node.js 24`, `pnpm 11.11.0`, `PostgreSQL 17 + PostGIS`, and `MapLibre GL worker`) run **inside the Docker containers**. Your workstation host remains clean.

---

## 2. Quick Start (Running the App Locally)

### Step 2.1: Clone and Enter the Repository
```bash
git clone <repository-url>
cd hackathon
```

### Step 2.2: Verify Environment File
A default local development environment file is already present at `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<bundled-local-key>
```
*(No modifications are needed for local development).*

### Step 2.3: Start the Backend & Development Server

#### Option A: Using `just` (Recommended)
```bash
just up
```
This single command automatically:
1. Starts the local Supabase containers (PostgreSQL 17, PostGIS, PostgREST, GoTrue Auth, Kong Gateway).
2. Applies all database migrations (including PostGIS spatial clustering and L1–L6 verification functions).
3. Seeds synthetic testing accounts.
4. Builds and starts the Next.js development server on `http://localhost:3000`.

#### Option B: Using Manual Commands
```bash
# 1. Start local Supabase and run SQL migrations
bash scripts/local-supabase.sh start

# 2. Seed synthetic test accounts
bash scripts/local-supabase.sh seed

# 3. Build and launch the Next.js application container
docker compose up --build -d app

# 4. View live application logs
docker compose logs -f app
```

### Step 2.4: Open the App
Visit **`http://localhost:3000`** in your browser:
- 🗺️ **Route Planner & Live GPS Reporting:** `http://localhost:3000/planner`
- 📊 **Traffic Explorer & Speed Cohorts:** `http://localhost:3000/traffic`
- 🏛️ **Authority Dashboard & Recurrence Heatmap:** `http://localhost:3000/authority`
- 📖 **Data Provenance & Source Proof:** `http://localhost:3000/about`

---

## 3. How to Create and Run a Cloudflare Tunnel ("Chanel")

A Cloudflare Tunnel connects your local Docker container (`http://localhost:3000`) directly to the Cloudflare network. It gives you a **free, public, SSL-encrypted URL (`https://<random-name>.trycloudflare.com`)** that works on any smartphone or remote computer without port forwarding or public IP requirements.

### Method 1: Run via Docker (Zero host installation!)

You don't even need to install `cloudflared` on your machine — run it inside Docker:

```bash
# Launch the tunnel in the background
docker run -d --name trafficsense-nk-tunnel --network host cloudflare/cloudflared:latest tunnel --no-autoupdate --url http://localhost:3000
```

#### Get Your Public URL:
Inspect the tunnel container logs:
```bash
docker logs trafficsense-nk-tunnel 2>&1 | grep -o 'https://.*\.trycloudflare\.com' | head -n 1
```
*Output example:*
```
https://volunteer-deviant-customers-dramatically.trycloudflare.com
```
Copy and paste this URL into your phone or any external browser.

#### Using `just` shortcut:
If you have `just` installed:
```bash
just tunnel       # Starts the tunnel and prints the public HTTPS URL
just tunnel-stop  # Terminates the tunnel
```

---

### Method 2: Run via Host Binary (Alternative)

If you prefer installing `cloudflared` directly on your host machine:

1. **Install cloudflared:**
   - **Linux (Debian/Ubuntu):**
     ```bash
     curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
     sudo dpkg -i cloudflared.deb
     ```
   - **macOS:**
     ```bash
     brew install cloudflared
     ```
2. **Start the tunnel:**
   ```bash
   cloudflared tunnel --url http://localhost:3000
   ```
   The terminal will print your temporary `https://*.trycloudflare.com` URL.

---

## 4. Managing and Stopping the Services

### Managing the Cloudflare Tunnel:
| Action | Docker Command | Just Command |
|---|---|---|
| View Tunnel Logs & URL | `docker logs trafficsense-nk-tunnel` | `just tunnel` |
| Stop Tunnel | `docker stop trafficsense-nk-tunnel` | `just tunnel-stop` |
| Restart Tunnel | `docker restart trafficsense-nk-tunnel` | — |
| Delete Tunnel Container | `docker rm -f trafficsense-nk-tunnel` | `just tunnel-stop` |

### Managing Application Containers:
| Action | Docker Command | Just Command |
|---|---|---|
| View running containers | `docker ps` | `just status` |
| Stop Dev App (keep DB state) | `docker compose down` | `just down` |
| Stop Dev App & Database | `docker compose down && bash scripts/local-supabase.sh stop` | `just stop-all` |
| Run Test Suite | `docker compose exec app pnpm test` | `just test` |
| Run Linter | `docker compose exec app pnpm lint` | `just lint` |
| Run Full Checks (test + lint + build) | `docker compose run --rm checks` | `just check` |

---

## 5. Troubleshooting & FAQ

### Q1: The map displays a blank area or "Worker failed to load"
- **Cause:** MapLibre GL requires its Web Worker script to parse geometries.
- **Fix:** Ensure `public/maplibre-gl-worker.mjs` is present in your repository. The app is pre-configured to load this static worker from `/maplibre-gl-worker.mjs`.

### Q2: Port 3000 is already in use by another service
- You can override the port when launching:
  ```bash
  APP_PORT=3002 docker compose up -d app
  ```
  Then point the Cloudflare tunnel to the new port:
  ```bash
  docker run -d --name trafficsense-nk-tunnel --network host cloudflare/cloudflared:latest tunnel --no-autoupdate --url http://localhost:3002
  ```

### Q3: How do I test the mobile GPS reporting via Cloudflare Tunnel?
- Open the `https://*.trycloudflare.com/planner` URL on your phone browser.
- Tap **"Report an Incident"**.
- When prompted, grant browser location permission.
- The W3C Geolocation API will capture your real physical latitude/longitude, and the server's PostGIS function will evaluate the report for L2 location verification ($\le 50\text{m}$ accuracy).
