import { useState, useEffect, useRef, useCallback } from "react";

interface Satellite {
  name: string;
  longitude: number;
}

const SATELLITES: Satellite[] = [
  { name: "Nilesat 7W", longitude: -7 },
  { name: "Arabsat 26E", longitude: 26 },
  { name: "Hotbird 13E", longitude: 13 },
  { name: "Astra 19.2E", longitude: 19.2 },
  { name: "Eutelsat 8W", longitude: -8 },
  { name: "Badr 26E", longitude: 26 },
  { name: "Turksat 42E", longitude: 42 },
  { name: "Intelsat 20 68.5E", longitude: 68.5 },
];

function parseCoordinates(input: string): { lat: number; lon: number } | null {
  const dmsRegex =
    /(\d+)[°\s]+(\d+)['\s]+(\d+\.?\d*)["″\s]*([NS])\s+(\d+)[°\s]+(\d+)['\s]+(\d+\.?\d*)["″\s]*([EW])/i;
  const decimalRegex = /(-?\d+\.?\d*)\s*[,\s]\s*(-?\d+\.?\d*)/;

  const dmsMatch = input.match(dmsRegex);
  if (dmsMatch) {
    const latDeg = parseFloat(dmsMatch[1]);
    const latMin = parseFloat(dmsMatch[2]);
    const latSec = parseFloat(dmsMatch[3]);
    const latDir = dmsMatch[4].toUpperCase();
    const lonDeg = parseFloat(dmsMatch[5]);
    const lonMin = parseFloat(dmsMatch[6]);
    const lonSec = parseFloat(dmsMatch[7]);
    const lonDir = dmsMatch[8].toUpperCase();

    let lat = latDeg + latMin / 60 + latSec / 3600;
    let lon = lonDeg + lonMin / 60 + lonSec / 3600;
    if (latDir === "S") lat = -lat;
    if (lonDir === "W") lon = -lon;
    return { lat, lon };
  }

  const decMatch = input.match(decimalRegex);
  if (decMatch) {
    return { lat: parseFloat(decMatch[1]), lon: parseFloat(decMatch[2]) };
  }

  return null;
}

function calcSatelliteAngles(
  lat: number,
  lon: number,
  satLon: number
): { azimuth: number; elevation: number; skew: number } {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;

  const EARTH_RADIUS = 6378.137;
  const SAT_RADIUS = 42164.2;

  const lat_r = toRad(lat);
  const lonDiff = toRad(satLon - lon);

  const x = Math.cos(lat_r) * Math.cos(lonDiff) - EARTH_RADIUS / SAT_RADIUS;
  const y = Math.cos(lat_r) * Math.sin(lonDiff);
  const z = Math.sin(lat_r);

  const elevation = toDeg(Math.atan(x / Math.sqrt(y * y + z * z)));

  // Azimuth from true North (clockwise): use ENU east/north components
  // E = sin(lonDiff), N = -sin(lat)*cos(lonDiff)
  const azRad = Math.atan2(
    Math.sin(lonDiff),
    -Math.sin(lat_r) * Math.cos(lonDiff)
  );
  let azimuth = toDeg(azRad);
  if (azimuth < 0) azimuth += 360;

  const skew = toDeg(Math.atan2(Math.sin(lonDiff), Math.tan(lat_r)));

  return {
    azimuth: Math.round(azimuth * 10) / 10,
    elevation: Math.round(elevation * 10) / 10,
    skew: Math.round(skew * 10) / 10,
  };
}

const MAP_ZOOM = 18;

function getTileInfo(lat: number, lon: number) {
  const n = Math.pow(2, MAP_ZOOM);
  const xPixel = ((lon + 180) / 360) * n * 256;
  const latRad = (lat * Math.PI) / 180;
  const yPixel =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
    n *
    256;
  const tileX = Math.floor(xPixel / 256);
  const tileY = Math.floor(yPixel / 256);
  const offsetX = xPixel - tileX * 256;
  const offsetY = yPixel - tileY * 256;
  return { tileX, tileY, offsetX, offsetY };
}

function getSatTileUrl(tx: number, ty: number) {
  return `https://mt0.google.com/vt/lyrs=s&x=${tx}&y=${ty}&z=${MAP_ZOOM}`;
}

function CompassDial({
  azimuth,
  satelliteName,
  coords,
}: {
  azimuth: number;
  satelliteName: string;
  coords: { lat: number; lon: number } | null;
}) {
  const size = 340;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 4;
  const innerR = outerR - 30;
  const mapR = innerR - 8;
  const satIconR = outerR + 22;

  const tileInfo = coords ? getTileInfo(coords.lat, coords.lon) : null;
  const tiles = tileInfo
    ? [-1, 0, 1].flatMap((dy) =>
        [-1, 0, 1].map((dx) => {
          const tx = tileInfo.tileX + dx;
          const ty = tileInfo.tileY + dy;
          return {
            url: getSatTileUrl(tx, ty),
            svgX: cx + dx * 256 - tileInfo.offsetX,
            svgY: cy + dy * 256 - tileInfo.offsetY,
          };
        })
      )
    : [];

  const azRad = ((azimuth - 90) * Math.PI) / 180;
  const satX = cx + satIconR * Math.cos(azRad);
  const satY = cy + satIconR * Math.sin(azRad);

  const lineEndX = cx + (innerR - 2) * Math.cos(azRad);
  const lineEndY = cy + (innerR - 2) * Math.sin(azRad);

  const ticks = [];
  for (let i = 0; i < 360; i += 5) {
    const rad = ((i - 90) * Math.PI) / 180;
    const isMajor = i % 30 === 0;
    const isMid = i % 10 === 0;
    const tickStart = outerR - (isMajor ? 18 : isMid ? 12 : 7);
    const tickEnd = outerR;
    ticks.push({
      x1: cx + tickStart * Math.cos(rad),
      y1: cy + tickStart * Math.sin(rad),
      x2: cx + tickEnd * Math.cos(rad),
      y2: cy + tickEnd * Math.sin(rad),
      isMajor,
      isMid,
      deg: i,
    });
  }

  const cardinals = [
    { label: "N", deg: 0, color: "#ef4444" },
    { label: "E", deg: 90, color: "#60a5fa" },
    { label: "S", deg: 180, color: "#a3a3a3" },
    { label: "W", deg: 270, color: "#60a5fa" },
  ];

  return (
    <div className="relative w-full">
      <svg
        width="100%"
        viewBox={`${-30} ${-30} ${size + 60} ${size + 60}`}
        style={{ display: "block" }}
      >
        <defs>
          <clipPath id="mapClip">
            <circle cx={cx} cy={cy} r={mapR} />
          </clipPath>
          <radialGradient id="compassGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#1e40af" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#0f172a" stopOpacity="0.8" />
          </radialGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="softGlow">
            <feGaussianBlur stdDeviation="1.5" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <circle
          cx={cx}
          cy={cy}
          r={outerR + 30}
          fill="none"
          stroke="#1e3a5f"
          strokeWidth="1"
          opacity="0.4"
          strokeDasharray="4 4"
        />

        <circle cx={cx} cy={cy} r={outerR} fill="url(#compassGlow)" stroke="#1e40af" strokeWidth="1.5" />

        <circle cx={cx} cy={cy} r={innerR} fill="#0a0f1e" stroke="#1e3a5f" strokeWidth="1" />

        {tiles.length > 0 ? (
          <g clipPath="url(#mapClip)" style={{ opacity: 0.9 }}>
            {tiles.map((tile, i) => (
              <image
                key={i}
                href={tile.url}
                x={tile.svgX}
                y={tile.svgY}
                width={256}
                height={256}
              />
            ))}
          </g>
        ) : (
          <>
            <circle cx={cx} cy={cy} r={mapR} fill="#0d1b2a" />
            <text x={cx} y={cy - 10} textAnchor="middle" fill="#334155" fontSize="12">
              أدخل الإحداثيات
            </text>
            <text x={cx} y={cy + 10} textAnchor="middle" fill="#334155" fontSize="11">
              لعرض الخريطة
            </text>
          </>
        )}

        <circle cx={cx} cy={cy} r={mapR} fill="none" stroke="#1e3a5f" strokeWidth="1.5" />

        {ticks.map((t, i) => (
          <line
            key={i}
            x1={t.x1}
            y1={t.y1}
            x2={t.x2}
            y2={t.y2}
            stroke={t.isMajor ? "#60a5fa" : t.isMid ? "#3b82f6" : "#1e3a5f"}
            strokeWidth={t.isMajor ? 2 : t.isMid ? 1.2 : 0.7}
          />
        ))}

        {cardinals.map((c) => {
          const rad = ((c.deg - 90) * Math.PI) / 180;
          const r = outerR - 10;
          return (
            <text
              key={c.label}
              x={cx + r * Math.cos(rad)}
              y={cy + r * Math.sin(rad)}
              textAnchor="middle"
              dominantBaseline="central"
              fill={c.color}
              fontSize="13"
              fontWeight="700"
              fontFamily="monospace"
            >
              {c.label}
            </text>
          );
        })}

        <line
          x1={cx}
          y1={cy}
          x2={lineEndX}
          y2={lineEndY}
          stroke="#facc15"
          strokeWidth="2"
          opacity="0.6"
          strokeDasharray="6 4"
        />

        <circle cx={cx} cy={cy} r={5} fill="#facc15" filter="url(#glow)" />

        <g transform={`translate(${satX}, ${satY})`}>
          <circle r="16" fill="#1e3a5f" stroke="#60a5fa" strokeWidth="1.5" opacity="0.9" />
          <text textAnchor="middle" dominantBaseline="central" fontSize="16" filter="url(#softGlow)">
            📡
          </text>
        </g>

        <text
          x={satX + (satX > cx ? 24 : -24)}
          y={satY + 1}
          textAnchor={satX > cx ? "start" : "end"}
          dominantBaseline="central"
          fill="#93c5fd"
          fontSize="9"
          fontWeight="600"
        >
          {satelliteName}
        </text>

        <text
          x={cx + (outerR - 8) * Math.cos(((azimuth - 90 + 10) * Math.PI) / 180)}
          y={cy + (outerR - 8) * Math.sin(((azimuth - 90 + 10) * Math.PI) / 180)}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#facc15"
          fontSize="9"
          fontWeight="700"
        >
          {azimuth}°
        </text>

        <circle cx={cx} cy={cy} r={2} fill="#facc15" />
      </svg>
    </div>
  );
}

function ElevationBar({ elevation }: { elevation: number }) {
  const width = 320;
  const height = 70;
  const padX = 20;
  const barY = 38;
  const barH = 10;
  const barWidth = width - padX * 2;
  const clampedEl = Math.max(0, Math.min(90, elevation));
  const markerX = padX + (clampedEl / 90) * barWidth;

  const ticks = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90];

  return (
    <div
      className="rounded-xl border border-blue-900/40 bg-slate-900/60 p-4"
      style={{ backdropFilter: "blur(12px)" }}
    >
      <div className="text-xs text-blue-400 mb-2 font-semibold tracking-wider uppercase">
        Elevation — زاوية الارتفاع
      </div>
      <svg width={width} height={height}>
        <defs>
          <linearGradient id="elGrad" x1="0%" x2="100%" y1="0%" y2="0%">
            <stop offset="0%" stopColor="#1e40af" />
            <stop offset="50%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#60a5fa" />
          </linearGradient>
        </defs>

        <rect
          x={padX}
          y={barY}
          width={barWidth}
          height={barH}
          rx={5}
          fill="#1e3a5f"
        />
        <rect
          x={padX}
          y={barY}
          width={(clampedEl / 90) * barWidth}
          height={barH}
          rx={5}
          fill="url(#elGrad)"
        />

        {ticks.map((t) => {
          const tx = padX + (t / 90) * barWidth;
          return (
            <g key={t}>
              <line
                x1={tx}
                y1={barY - 4}
                x2={tx}
                y2={barY + barH + 4}
                stroke="#334155"
                strokeWidth="1"
              />
              <text
                x={tx}
                y={barY + barH + 14}
                textAnchor="middle"
                fill="#475569"
                fontSize="8"
              >
                {t}°
              </text>
            </g>
          );
        })}

        <line
          x1={markerX}
          y1={barY - 8}
          x2={markerX}
          y2={barY + barH + 8}
          stroke="#facc15"
          strokeWidth="2"
        />
        <polygon
          points={`${markerX},${barY - 12} ${markerX - 5},${barY - 20} ${markerX + 5},${barY - 20}`}
          fill="#facc15"
        />
        <text
          x={markerX}
          y={barY - 24}
          textAnchor="middle"
          fill="#facc15"
          fontSize="10"
          fontWeight="700"
        >
          {elevation}°
        </text>

        <text x={padX} y={barY - 10} fill="#475569" fontSize="8">
          0° (أفق)
        </text>
        <text
          x={padX + barWidth}
          y={barY - 10}
          textAnchor="end"
          fill="#475569"
          fontSize="8"
        >
          90° (رأسي)
        </text>
      </svg>
    </div>
  );
}

function DishDiagram({
  azimuth,
  elevation,
  skew,
}: {
  azimuth: number;
  elevation: number;
  skew: number;
}) {
  const w = 420;
  const h = 310;
  const azNorm = ((azimuth % 360) + 360) % 360;
  const isWest = azNorm > 180;

  // ── CORRECT ROTATION MATH ──────────────────────────────────────────────────
  // Dish drawn in LOCAL SPACE facing UP (aperture at y=-dishD, vertex at y=0).
  // Rotation formula (SVG: positive = clockwise):
  //   East satellite → rotate +(90-elevation): at El=0 → +90° = faces right ✓
  //   West satellite → rotate -(90-elevation): at El=0 → -90° = faces left  ✓
  //   Both at El=90°: rotate 0° = faces straight up ✓
  const rotateDeg = (90 - elevation) * (isWest ? -1 : 1);
  const rotateRad = (rotateDeg * Math.PI) / 180;

  // Dish dimensions (local space)
  const dishW = 72;    // half-width of aperture opening
  const dishD = 38;    // depth from aperture plane (y=-dishD) to vertex (y=0)
  const armLen = 56;   // LNB arm: from vertex to LNB tip (toward aperture & beyond)
  const lnbLen = dishD + armLen; // total reach from vertex to LNB

  // Pole and mount
  const poleX = w / 2;
  const groundY = h - 30;
  const poleTopY = groundY - 62;

  // ── LNB WORLD POSITION ────────────────────────────────────────────────────
  // Local LNB point is (0, -lnbLen).
  // After SVG rotate(rotateDeg) applied at (poleX, poleTopY):
  //   world_x = poleX + (-(-lnbLen)) * sin(rotateRad) = poleX + lnbLen*sin
  //   world_y = poleTopY + (-lnbLen) * cos(rotateRad) = poleTopY - lnbLen*cos
  const lnbWorldX = poleX + lnbLen * Math.sin(rotateRad);
  const lnbWorldY = poleTopY - lnbLen * Math.cos(rotateRad);

  // Satellite icon: on the same side the dish faces
  const satX = isWest ? 76 : w - 76;
  const satY = 46;
  const beamStartX = satX + (isWest ? 36 : -36);
  const beamStartY = satY + 4;

  return (
    <div
      className="rounded-xl border border-blue-900/40 bg-slate-900/60 p-3 w-full"
      style={{ backdropFilter: "blur(12px)" }}
    >
      <div className="text-xs text-blue-400 mb-1 font-semibold tracking-wider uppercase text-center">
        Dish Diagram — مجسم الطبق
      </div>
      <svg
        width="100%"
        viewBox={`0 0 ${w} ${h}`}
        direction="ltr"
        style={{ display: "block" }}
      >
        <defs>
          <linearGradient id="dshFill" x1="0%" x2="100%" y1="0%" y2="100%">
            <stop offset="0%"   stopColor="#0d1b2e" />
            <stop offset="40%"  stopColor="#1e3a5f" />
            <stop offset="70%"  stopColor="#2563eb" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#0d1b2e" />
          </linearGradient>
          <linearGradient id="poleGr" x1="0%" x2="100%" y1="0%" y2="0%">
            <stop offset="0%"   stopColor="#060e1a" />
            <stop offset="40%"  stopColor="#1e3a5f" />
            <stop offset="60%"  stopColor="#2d5080" />
            <stop offset="100%" stopColor="#060e1a" />
          </linearGradient>
          <linearGradient id="armGr" x1="0%" x2="100%" y1="0%" y2="0%">
            <stop offset="0%"   stopColor="#0d1b2e" />
            <stop offset="50%"  stopColor="#475569" />
            <stop offset="100%" stopColor="#0d1b2e" />
          </linearGradient>
          <filter id="bFx" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="sFx" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* ── GROUND ── */}
        <rect x={0} y={groundY} width={w} height={h - groundY} fill="#040b16" />
        <line x1={0} y1={groundY} x2={w} y2={groundY} stroke="#1e3a5f" strokeWidth="2" />
        {Array.from({ length: 22 }, (_, i) => (
          <line key={i}
            x1={i * 20} y1={groundY}
            x2={i * 20 - 10} y2={groundY + 9}
            stroke="#0d1b2e" strokeWidth="1.5" />
        ))}
        <text x={w / 2} y={h - 7} textAnchor="middle" fill="#1e3a5f" fontSize="8.5">
          ── الأرض ──
        </text>

        {/* ── SATELLITE (in the sky on the dish-facing side) ── */}
        <g transform={`translate(${satX},${satY})`} filter="url(#sFx)">
          <ellipse cx={0} cy={0} rx={58} ry={20} fill="#1d4ed8" opacity="0.05" />
          <rect x={-16} y={-11} width={32} height={22} rx={4}
            fill="#1e293b" stroke="#475569" strokeWidth="1.5" />
          <rect x={-15} y={-10} width={30} height={7} rx={2} fill="#283852" />
          <rect x={-23} y={-3} width={7} height={5} rx={1} fill="#1e293b" />
          <rect x={16} y={-3} width={7} height={5} rx={1} fill="#1e293b" />
          <rect x={-57} y={-8} width={34} height={16} rx={3}
            fill="#1e40af" stroke="#3b82f6" strokeWidth="1.2" />
          {[-51, -44, -37, -31].map(px => (
            <line key={px} x1={px} y1={-8} x2={px} y2={8}
              stroke="#93c5fd" strokeWidth="0.7" opacity="0.8" />
          ))}
          <rect x={23} y={-8} width={34} height={16} rx={3}
            fill="#1e40af" stroke="#3b82f6" strokeWidth="1.2" />
          {[27, 34, 41, 47].map(px => (
            <line key={px} x1={px} y1={-8} x2={px} y2={8}
              stroke="#93c5fd" strokeWidth="0.7" opacity="0.8" />
          ))}
          <path d="M -6,-11 Q 0,-23 6,-11" fill="none" stroke="#94a3b8" strokeWidth="1.8" strokeLinecap="round" />
          <line x1={0} y1={-23} x2={0} y2={-11} stroke="#94a3b8" strokeWidth="1.2" />
          <circle cx={0} cy={-23} r={2} fill="#60a5fa" opacity="0.85" />
          <circle cx={-4} cy={1} r={5.5} fill="#0f172a" stroke="#2563eb" strokeWidth="1.2" />
          <circle cx={-4} cy={1} r={3} fill="#1d4ed8" opacity="0.9" />
          <circle cx={10} cy={-3} r={2.5} fill="#22c55e" />
          <circle cx={10} cy={-3} r={1.2} fill="#bbf7d0" opacity="0.9" />
        </g>

        {/* ── BEAM from satellite → LNB ── */}
        <line x1={beamStartX} y1={beamStartY} x2={lnbWorldX} y2={lnbWorldY}
          stroke="#22c55e" strokeWidth="9" opacity="0.1" filter="url(#bFx)" />
        <line x1={beamStartX} y1={beamStartY} x2={lnbWorldX} y2={lnbWorldY}
          stroke="#22c55e" strokeWidth="1.8" opacity="0.92" />
        <line x1={beamStartX} y1={beamStartY} x2={lnbWorldX} y2={lnbWorldY}
          stroke="#86efac" strokeWidth="1" strokeDasharray="11 10" opacity="0.55" />
        <circle cx={lnbWorldX} cy={lnbWorldY} r={5} fill="#22c55e" opacity="0.25" />
        <circle cx={lnbWorldX} cy={lnbWorldY} r={3} fill="#22c55e" opacity="0.8" />
        <circle cx={lnbWorldX} cy={lnbWorldY} r={1.5} fill="#bbf7d0" />

        {/* ── POLE ── */}
        <rect x={poleX - 6} y={poleTopY + 12} width={12} height={groundY - poleTopY - 12}
          rx={4} fill="url(#poleGr)" />
        <rect x={poleX - 22} y={groundY - 7} width={44} height={11} rx={3} fill="url(#poleGr)" />
        <rect x={poleX - 26} y={groundY + 1} width={52} height={7} rx={3}
          fill="#050c1a" stroke="#1e3a5f" strokeWidth="1" />
        {[-14, -5, 5, 14].map(bx => (
          <circle key={bx} cx={poleX + bx} cy={groundY + 4} r={2.2}
            fill="#1e3a5f" stroke="#334155" strokeWidth="0.8" />
        ))}

        {/* ── DISH ASSEMBLY — rotated around pole-top pivot ── */}
        {/*   LOCAL SPACE: dish faces UP, vertex at (0,0), aperture at y=-dishD */}
        <g transform={`translate(${poleX},${poleTopY}) rotate(${rotateDeg})`}>

          {/*
            ── CORRECT BEZIER MATH ──
            Vertex at (0,0), aperture at y=-dishD.
            For the curve to pass through vertex (0,0) at t=0.5:
              control point = (0, +dishD)   ← below vertex in local space
            Path: M -dishW,-dishD  Q 0,+dishD  dishW,-dishD

            Inner arcs at scale t (x ∈ [-dishW·t, +dishW·t]):
              endpoints on parabola: y = -dishD·t²
              control: (0, +dishD·t²)
          */}

          {/* Dish surface fill */}
          <path
            d={`M ${-dishW},${-dishD} Q 0,${dishD} ${dishW},${-dishD} Z`}
            fill="#06101e" opacity="0.95"
          />

          {/* Inner reference arcs (correctly computed) */}
          {[0.75, 0.48].map((t) => (
            <path key={t}
              d={`M ${-dishW * t},${-dishD * t * t} Q 0,${dishD * t * t} ${dishW * t},${-dishD * t * t}`}
              fill="none" stroke="#1e3a5f" strokeWidth="1" opacity="0.75"
            />
          ))}

          {/* Center symmetry axis */}
          <line x1={0} y1={0} x2={0} y2={-dishD}
            stroke="#1e3a5f" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.6" />

          {/* Main parabolic rim */}
          <path
            d={`M ${-dishW},${-dishD} Q 0,${dishD} ${dishW},${-dishD}`}
            fill="none" stroke="#2563eb" strokeWidth="3.5" strokeLinecap="round"
          />

          {/* Aperture opening edge */}
          <line x1={-dishW} y1={-dishD} x2={dishW} y2={-dishD}
            stroke="#2563eb" strokeWidth="3.5" strokeLinecap="round" />

          {/* Vertex hub */}
          <circle cx={0} cy={0} r={6} fill="#0a1628" stroke="#3b82f6" strokeWidth="2" />
          <circle cx={0} cy={0} r={2.5} fill="#2563eb" />

          {/* LNB side braces: aperture rim corners → LNB tip */}
          <line x1={-dishW * 0.58} y1={-dishD} x2={0} y2={-lnbLen}
            stroke="#334155" strokeWidth="1.5" strokeLinecap="round" />
          <line x1={dishW * 0.58} y1={-dishD} x2={0} y2={-lnbLen}
            stroke="#334155" strokeWidth="1.5" strokeLinecap="round" />

          {/* Main arm rod: vertex → LNB */}
          <line x1={0} y1={0} x2={0} y2={-lnbLen}
            stroke="#475569" strokeWidth="3.5" strokeLinecap="round" />

          {/* LNB head */}
          <rect x={-8} y={-lnbLen - 8} width={16} height={14} rx={3}
            fill="#0f172a" stroke="#60a5fa" strokeWidth="2" />
          <rect x={-4} y={-lnbLen - 5} width={8} height={8} rx={1.5}
            fill="#1d4ed8" />
          <text x={14} y={-lnbLen} dominantBaseline="central"
            fill="#a78bfa" fontSize="9" fontWeight="700">LNB</text>
        </g>

        {/* ── ELEVATION ARC (drawn in world space, not inside rotated group) ── */}
        {(() => {
          const arcR = 52;
          const startAngle = -Math.PI / 2; // straight up
          const endAngle = startAngle + rotateRad;
          const largeArc = Math.abs(rotateDeg) > 180 ? 1 : 0;
          const sweep = rotateDeg >= 0 ? 1 : 0;
          const ax = poleX + arcR * Math.cos(startAngle);
          const ay = poleTopY + arcR * Math.sin(startAngle);
          const bx = poleX + arcR * Math.cos(endAngle);
          const by = poleTopY + arcR * Math.sin(endAngle);
          const midAngle = (startAngle + endAngle) / 2;
          const lx = poleX + (arcR + 16) * Math.cos(midAngle);
          const ly = poleTopY + (arcR + 16) * Math.sin(midAngle);
          return (
            <>
              <path
                d={`M ${ax},${ay} A ${arcR},${arcR} 0 ${largeArc},${sweep} ${bx},${by}`}
                fill="none" stroke="#facc15" strokeWidth="1.5" strokeDasharray="5 4" opacity="0.6"
              />
              <text x={lx} y={ly} textAnchor="middle" dominantBaseline="central"
                fill="#facc15" fontSize="11" fontWeight="800">{elevation}°</text>
            </>
          );
        })()}

        {/* ── INFO PANEL (top corner opposite to satellite) ── */}
        {(() => {
          const px = isWest ? w - 100 : 8;
          return (
            <>
              <rect x={px} y={8} width={92} height={62} rx={7}
                fill="#060e1a" stroke="#1e3a5f" strokeWidth="1" opacity="0.9" />
              <text x={px + 46} y={24} textAnchor="middle" fill="#facc15"
                fontSize="10" fontWeight="700">El: {elevation}°</text>
              <text x={px + 46} y={40} textAnchor="middle" fill="#60a5fa"
                fontSize="9">Az: {azimuth}°</text>
              <text x={px + 46} y={56} textAnchor="middle" fill="#a78bfa"
                fontSize="9">Skew: {skew}°</text>
            </>
          );
        })()}
      </svg>
    </div>
  );
}

export default function Home() {
  const [coordInput, setCoordInput] = useState("15\xB040'01.5\"N 43\xB057'25.8\"E");
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [selectedSat, setSelectedSat] = useState(SATELLITES[0]);
  const [satLonInput, setSatLonInput] = useState(String(SATELLITES[0].longitude));
  const [angles, setAngles] = useState({ azimuth: 0, elevation: 0, skew: 0 });
  const [parseError, setParseError] = useState(false);

  const applyCoords = useCallback((input: string) => {
    const parsed = parseCoordinates(input);
    if (parsed) {
      setCoords(parsed);
      setParseError(false);
    } else {
      setParseError(true);
      setCoords(null);
    }
  }, []);

  const handleSatLonChange = useCallback((val: string) => {
    setSatLonInput(val);
    const num = parseFloat(val);
    if (!isNaN(num)) {
      setSelectedSat({ name: `${num >= 0 ? num + "E" : Math.abs(num) + "W"}`, longitude: num });
    }
  }, []);

  const handleSatSelect = useCallback((name: string) => {
    const sat = SATELLITES.find((s) => s.name === name);
    if (sat) {
      setSelectedSat(sat);
      setSatLonInput(String(sat.longitude));
    }
  }, []);

  useEffect(() => {
    applyCoords(coordInput);
  }, []);

  useEffect(() => {
    if (coords) {
      const a = calcSatelliteAngles(coords.lat, coords.lon, selectedSat.longitude);
      setAngles(a);
    }
  }, [coords, selectedSat]);

  return (
    <div
      className="min-h-screen text-white"
      style={{
        background: "linear-gradient(135deg, #020817 0%, #0a1628 50%, #020817 100%)",
        fontFamily: "'Inter', sans-serif",
        direction: "rtl",
      }}
    >
      <div
        className="border-b border-blue-900/30 px-6 py-4 flex items-center gap-4"
        style={{
          background: "rgba(10, 22, 40, 0.8)",
          backdropFilter: "blur(20px)",
        }}
      >
        <span style={{ fontSize: 28 }}>📡</span>
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            أداة ضبط طبق الأقمار الصناعية
          </h1>
          <p className="text-xs text-blue-400 mt-0.5">Satellite Dish Alignment Tool</p>
        </div>
        {coords && (
          <div className="mr-auto text-xs text-slate-500 font-mono" style={{ direction: "ltr" }}>
            {coords.lat.toFixed(5)}°, {coords.lon.toFixed(5)}°
          </div>
        )}
      </div>

      <div className="max-w-5xl mx-auto p-4 flex flex-col gap-4">
        <div
          className="rounded-2xl border border-blue-900/40 p-5 flex flex-wrap gap-4 items-end"
          style={{ background: "rgba(10, 22, 40, 0.7)", backdropFilter: "blur(16px)" }}
        >
          <div className="flex-1 min-w-[240px]">
            <label className="block text-xs text-blue-400 mb-1.5 font-semibold tracking-wider">
              الإحداثيات (من جوجل ماب)
            </label>
            <input
              type="text"
              value={coordInput}
              onChange={(e) => setCoordInput(e.target.value)}
              onBlur={() => applyCoords(coordInput)}
              onKeyDown={(e) => e.key === "Enter" && applyCoords(coordInput)}
              placeholder={"مثال: 15°40'01.5\"N 43°57'25.8\"E"}
              className="w-full rounded-lg px-3 py-2.5 text-sm font-mono bg-slate-800/80 border text-white placeholder-slate-500 outline-none transition-colors"
              style={{
                borderColor: parseError ? "#ef4444" : "#1e3a5f",
                direction: "ltr",
              }}
              dir="ltr"
            />
            {parseError && (
              <p className="text-xs text-red-400 mt-1">
                صيغة غير صحيحة — استخدم: 15°40'01.5"N 43°57'25.8"E
              </p>
            )}
            {!parseError && coords && (
              <p className="text-xs text-green-500 mt-1" dir="ltr">
                ✓ {coords.lat.toFixed(6)}, {coords.lon.toFixed(6)}
              </p>
            )}
          </div>

          <div className="w-full sm:min-w-[220px] sm:w-auto flex flex-col gap-1.5">
            <label className="block text-xs text-blue-400 font-semibold tracking-wider">
              القمر الصناعي
            </label>
            <select
              value={SATELLITES.find(s => s.longitude === selectedSat.longitude)?.name ?? ""}
              onChange={(e) => handleSatSelect(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm bg-slate-800/80 border border-blue-900/40 text-white outline-none"
            >
              <option value="">— اختر أو أدخل يدويًا —</option>
              {SATELLITES.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 whitespace-nowrap">خط الطول:</span>
              <input
                type="number"
                step="0.1"
                value={satLonInput}
                onChange={(e) => handleSatLonChange(e.target.value)}
                placeholder="مثال: 26 أو -7"
                className="flex-1 rounded-lg px-3 py-2 text-sm font-mono bg-slate-800/80 border border-blue-900/40 text-white placeholder-slate-500 outline-none"
                dir="ltr"
              />
              <span className="text-xs text-slate-400">°</span>
            </div>
          </div>

          <button
            onClick={() => applyCoords(coordInput)}
            className="px-5 py-2.5 rounded-lg text-sm font-semibold transition-all"
            style={{
              background: "linear-gradient(135deg, #1d4ed8, #2563eb)",
              color: "white",
              border: "1px solid #3b82f6",
            }}
          >
            تحديث ⟳
          </button>
        </div>

        {coords && (
          <div className="flex flex-col lg:flex-row gap-4 items-stretch">
            {/* ── Compass panel ── */}
            <div
              className="rounded-2xl border border-blue-900/40 p-4 flex flex-col items-center w-full lg:w-auto"
              style={{ background: "rgba(10, 22, 40, 0.7)", backdropFilter: "blur(16px)" }}
            >
              <div className="text-xs text-blue-400 mb-3 font-semibold tracking-wider uppercase text-center">
                البوصلة والاتجاه — Compass
              </div>
              <div style={{ width: "100%", maxWidth: 400 }}>
                <CompassDial
                  azimuth={angles.azimuth}
                  satelliteName={selectedSat.name}
                  coords={coords}
                />
              </div>
              <svg
                width="100%"
                viewBox="0 0 340 68"
                style={{ marginTop: 12, maxWidth: 400, display: "block" }}
                direction="ltr"
              >
                <defs>
                  <filter id="badgeGlow">
                    <feGaussianBlur stdDeviation="2" result="blur" />
                    <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                </defs>
                {[
                  { label: "الاتجاه", sub: "Azimuth", value: `${angles.azimuth}°`, color: "#facc15", x: 0 },
                  { label: "الارتفاع", sub: "Elevation", value: `${angles.elevation}°`, color: "#60a5fa", x: 110 },
                  { label: "انحراف LNB", sub: "Skew", value: `${angles.skew}°`, color: "#a78bfa", x: 220 },
                ].map((item) => (
                  <g key={item.label} transform={`translate(${item.x}, 0)`}>
                    <rect x="2" y="2" width="106" height="64" rx="10" ry="10"
                      fill="#0a1628" stroke={item.color} strokeWidth="1.2" strokeOpacity="0.35" />
                    <rect x="2" y="2" width="4" height="64" rx="2" ry="2" fill={item.color} opacity="0.7" />
                    <text x="58" y="21" textAnchor="middle" fill={item.color}
                      fontSize="10" fontWeight="700" fontFamily="'Inter', sans-serif" opacity="0.95">
                      {item.label}
                    </text>
                    <text x="58" y="32" textAnchor="middle" fill="#475569"
                      fontSize="7.5" fontFamily="monospace" letterSpacing="0.5">
                      {item.sub}
                    </text>
                    <line x1="14" y1="37" x2="96" y2="37" stroke={item.color} strokeWidth="0.5" strokeOpacity="0.25" />
                    <text x="58" y="56" textAnchor="middle" fill={item.color}
                      fontSize="20" fontWeight="800" fontFamily="monospace" filter="url(#badgeGlow)">
                      {item.value}
                    </text>
                  </g>
                ))}
              </svg>
            </div>

            {/* ── Dish diagram panel ── */}
            <div
              className="rounded-2xl border border-blue-900/40 p-4 flex-1 flex items-center justify-center"
              style={{ background: "rgba(10, 22, 40, 0.7)", backdropFilter: "blur(16px)" }}
            >
              <DishDiagram
                azimuth={angles.azimuth}
                elevation={angles.elevation}
                skew={angles.skew}
              />
            </div>
          </div>
        )}

        {!coords && (
          <div
            className="rounded-2xl border border-blue-900/40 p-12 text-center"
            style={{ background: "rgba(10, 22, 40, 0.5)", backdropFilter: "blur(16px)" }}
          >
            <div style={{ fontSize: 48 }} className="mb-4">
              📡
            </div>
            <p className="text-slate-400 text-sm">
              أدخل الإحداثيات الجغرافية لموقعك من جوجل ماب لحساب اتجاه القمر الصناعي
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
