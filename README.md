# 📡 Satellite Dish Alignment Tool

> A precise, browser-based tool for calculating satellite dish pointing angles based on your geographic location — no app installation required.

[![Build Android APK](https://github.com/YOUR_USERNAME/YOUR_REPO/actions/workflows/android-apk.yml/badge.svg)](https://github.com/YOUR_USERNAME/YOUR_REPO/actions/workflows/android-apk.yml)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Tech](https://img.shields.io/badge/built%20with-React%20%2B%20Vite-61dafb)

---

## 📖 Description

The **Satellite Dish Alignment Tool** is a web application designed to help users accurately point their satellite dish at any geostationary satellite. By entering your GPS coordinates, the tool calculates the three critical angles needed for perfect dish alignment:

- **Azimuth** — the compass direction to point the dish (0°–360°)
- **Elevation** — how high to tilt the dish above the horizon
- **Skew (LNB Rotation)** — the rotational angle of the LNB for proper polarization

The tool also features an interactive SVG dish diagram with animated signal beam simulation, a live compass/map view, and support for LNB offset correction.

---

## ✨ Features

- 🌍 **Flexible coordinate input** — accepts both decimal (`15.667, 43.957`) and DMS format (`15°40'01.5"N 43°57'25.8"E`)
- 📋 **Google Maps paste support** — paste coordinates directly from Google Maps
- 📡 **8 pre-configured satellites** — including Nilesat, Arabsat, Hotbird, Astra, Eutelsat, Turksat, and more
- 📐 **Real-time calculations** — azimuth, elevation, and LNB skew computed instantly
- 🎯 **Interactive dish diagram** — animated SVG visualization showing the signal path from satellite to LNB
- 🧭 **Compass & map view** — live satellite direction overlaid on an aerial map of your location
- 🔧 **LNB offset correction** — adjustable offset (-90° to +90°) for multi-LNB setups
- 📱 **Responsive design** — works on desktop, tablet, and mobile
- 🤖 **Android APK** — automatically built via GitHub Actions using Capacitor

---

## ⚙️ How It Works

The tool uses standard geostationary satellite geometry formulas:

### 1. Elevation Angle
The angle above the horizon at which you tilt the dish:

```
elevation = atan( cos(Δlon) × cos(lat) − R_earth/R_orbit ) / sqrt( 1 − cos²(Δlon) × cos²(lat) )
```

### 2. Azimuth Angle
The compass bearing (clockwise from North) toward the satellite's subsatellite point:

```
azimuth = atan2( sin(Δlon), −sin(lat) × cos(Δlon) )  [converted to 0°–360°]
```

### 3. LNB Skew (Polarization Tilt)
The rotation needed on the LNB to align with the satellite's signal polarization:

```
skew = atan2( sin(Δlon), tan(lat) )
```

Where `Δlon = satellite_longitude − observer_longitude`.

---

## 🚀 Installation

### Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 18 |
| pnpm | ≥ 9 |

### Run locally

```bash
# 1. Clone the repository
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
cd YOUR_REPO

# 2. Install dependencies
pnpm install

# 3. Start the development server
pnpm --filter @workspace/satellite-dish-aligner run dev:local
```

Open your browser at **http://localhost:5173**

---

## 📲 Build Android APK

The project includes a GitHub Actions workflow that automatically builds an Android APK on every push.

**Automatic build (GitHub Actions):**
```bash
git push origin main
# → Go to Actions tab → Download APK from Artifacts
```

**Manual build (Linux):**
```bash
cd artifacts/satellite-dish-aligner
bash build-android.sh
# APK → android/app/build/outputs/apk/debug/app-debug.apk
```

> Requires: Android Studio + JDK 17 + Android SDK 34

---

## 🧭 Usage

1. **Enter your location** — paste Google Maps coordinates or type in decimal/DMS format
2. **Select your satellite** — choose from the dropdown list
3. **Press "تحديث" (Update)** — the tool calculates all angles instantly
4. **Read the results:**
   - 🟡 **Azimuth** — rotate your dish to this compass bearing
   - 📐 **Elevation** — tilt the dish up to this angle above the horizon
   - 🟣 **LNB Skew** — rotate the LNB head by this angle
5. **Adjust LNB offset** — if using an offset LNB, enter the physical offset angle

---

## 📊 Example

**Input:**
| Field | Value |
|-------|-------|
| Location | 34.052°N, 12.345°E |
| Satellite | Hotbird 13E (13°) |

**Output:**
| Parameter | Value | Meaning |
|-----------|-------|---------|
| Azimuth | 172.4° | Point dish South-Southeast |
| Elevation | 41.2° | Tilt dish ~41° above horizon |
| LNB Skew | 8.3° | Rotate LNB clockwise 8° |

---

## 🛠️ Technologies Used

| Category | Technology |
|----------|-----------|
| Framework | [React 18](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) |
| Build Tool | [Vite 7](https://vitejs.dev/) |
| Styling | [Tailwind CSS v4](https://tailwindcss.com/) |
| UI Components | [Radix UI](https://www.radix-ui.com/) |
| Animations | [Framer Motion](https://www.framer-motion.com/) |
| Visualization | SVG (custom animated dish diagram) |
| Package Manager | [pnpm](https://pnpm.io/) (monorepo workspace) |
| Mobile | [Capacitor 6](https://capacitorjs.com/) |
| CI/CD | [GitHub Actions](https://github.com/features/actions) |

---

## 🔮 Future Improvements

- [ ] 🗺️ Interactive map for clicking your location directly
- [ ] 🛰️ Expanded satellite database (100+ satellites worldwide)
- [ ] 📶 Signal strength estimator based on dish size and frequency
- [ ] 🌐 Multi-language support (Arabic, English, French, Turkish)
- [ ] ☁️ Weather/obstruction overlay (trees, buildings)
- [ ] 🔔 Push notifications for satellite outage alerts
- [ ] 📱 Native iOS support via Capacitor
- [ ] 🔖 Save favorite locations and satellites locally

---

## 📁 Project Structure

```
.
├── artifacts/
│   └── satellite-dish-aligner/      # Main web application
│       ├── src/
│       │   ├── pages/Home.tsx        # Core UI + calculation logic
│       │   └── components/           # Shared UI components
│       ├── capacitor.config.ts       # Android/iOS app config
│       ├── vite.config.ts            # Production (Replit) config
│       ├── vite.config.local.ts      # Local development config
│       └── build-android.sh          # Linux APK build script
├── .github/
│   └── workflows/
│       └── android-apk.yml           # GitHub Actions APK workflow
└── README.md
```

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

<div align="center">
  Made with ❤️ for satellite enthusiasts everywhere
</div>
