import { useState, useEffect, useRef, useCallback } from "react";
import { useSensors } from "../hooks/useSensors";

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

  const rawElevation = toDeg(Math.atan(x / Math.sqrt(y * y + z * z)));
  const elevation = Math.max(0, rawElevation);

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
  deviceHeading,
}: {
  azimuth: number;
  satelliteName: string;
  coords: { lat: number; lon: number } | null;
  deviceHeading?: number | null;
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
            {/* Map rotates with device heading so "facing direction" is always at top */}
            <g transform={deviceHeading != null
              ? `rotate(${-deviceHeading}, ${cx}, ${cy})`
              : undefined}
              style={{ transition: "transform 0.2s ease" }}>
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

        {/* ── Device heading needle (orange) — shows where phone is pointing ── */}
        {deviceHeading != null && (() => {
          const devRad = ((deviceHeading - 90) * Math.PI) / 180;
          const needleLen = innerR - 14;
          const backLen = 22;
          const nx = cx + needleLen * Math.cos(devRad);
          const ny = cy + needleLen * Math.sin(devRad);
          const bx = cx - backLen * Math.cos(devRad);
          const by = cy - backLen * Math.sin(devRad);
          const angleDiff = ((deviceHeading - azimuth + 540) % 360) - 180;
          const aligned = Math.abs(angleDiff) <= 5;
          const color = aligned ? "#22c55e" : "#f97316";
          return (
            <>
              <line x1={bx} y1={by} x2={nx} y2={ny}
                stroke={color} strokeWidth="3.5" strokeLinecap="round"
                filter="url(#glow)" opacity="0.9" />
              <polygon
                points={`0,-7 5,5 -5,5`}
                transform={`translate(${nx},${ny}) rotate(${deviceHeading})`}
                fill={color} filter="url(#glow)" />
              <text
                x={cx} y={cy + mapR + 16}
                textAnchor="middle" dominantBaseline="central"
                fill={color} fontSize="10" fontWeight="700">
                {aligned
                  ? "✓ محاذى للقمر"
                  : angleDiff > 0
                    ? `↺ دوِّر يساراً ${Math.abs(Math.round(angleDiff))}°`
                    : `↻ دوِّر يميناً ${Math.abs(Math.round(angleDiff))}°`}
              </text>
            </>
          );
        })()}

        <circle cx={cx} cy={cy} r={2} fill="#facc15" />
      </svg>
    </div>
  );
}

function AngleLevel({
  tiltBeta,
  tiltGamma,
  targetElevation,
}: {
  tiltBeta: number | null;
  tiltGamma: number | null;
  targetElevation: number;
}) {
  // When holding phone upright and tilting it at elevation angle:
  // beta ≈ 90 - elevation (phone near-vertical = low elevation, tilted back = high elevation)
  const deviceEl = tiltBeta !== null
    ? Math.max(0, Math.min(90, Math.round((90 - Math.abs(tiltBeta)) * 10) / 10))
    : null;
  const roll = tiltGamma !== null ? Math.round(tiltGamma * 10) / 10 : null;
  const elevDiff = deviceEl !== null
    ? Math.round((deviceEl - targetElevation) * 10) / 10
    : null;
  const elOk = elevDiff !== null && Math.abs(elevDiff) <= 2;
  const rollOk = roll !== null && Math.abs(roll) <= 3;
  const allOk = elOk && rollOk;

  const barW = 220;
  const bubbleX = roll !== null ? Math.max(8, Math.min(barW - 8, barW / 2 + (roll / 90) * (barW / 2))) : barW / 2;

  return (
    <div
      className="rounded-xl border border-blue-900/40 p-4 flex flex-col gap-3"
      style={{ background: "rgba(10,22,40,0.7)", backdropFilter: "blur(16px)" }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs text-blue-400 font-semibold tracking-wider uppercase">
          ⚖️ ميزان الزاوية — Angle Level
        </span>
        {allOk && (
          <span className="text-xs font-bold text-green-400 animate-pulse">✓ محاذاة تامة</span>
        )}
      </div>

      {/* Elevation gauge */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-slate-400 w-20 shrink-0">الارتفاع</span>
        <div className="relative flex-1" style={{ height: 14 }}>
          <div className="absolute inset-0 rounded-full" style={{ background: "#0f172a", border: "1px solid #1e3a5f" }} />
          {/* Target line */}
          <div className="absolute top-0 bottom-0 w-0.5 rounded"
            style={{ left: `${(targetElevation / 90) * 100}%`, background: "#22c55e", opacity: 0.8 }} />
          {/* Current position */}
          {elPct !== null && (
            <div className="absolute rounded" style={{
              left: `${(deviceEl! / 90) * 100}%`, top: -2, bottom: -2, width: 6,
              transform: "translateX(-3px)",
              background: elOk ? "#22c55e" : "#f97316",
              boxShadow: `0 0 10px ${elOk ? "#22c55e" : "#f97316"}`,
            }} />
          )}
        </div>
        <span className="text-xs font-mono w-16 text-right shrink-0"
          style={{ color: elOk ? "#22c55e" : "#f97316" }}>
          {deviceEl !== null ? `${deviceEl}°` : "—"}
          {elevDiff !== null && !elOk && (
            <span className="text-slate-500"> ({elevDiff > 0 ? "+" : ""}{elevDiff}°)</span>
          )}
        </span>
      </div>

      {/* Bubble level (roll / gamma) */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-slate-400 w-20 shrink-0">الميل الجانبي</span>
        <div className="relative flex-1" style={{ height: 14 }}>
          <div className="absolute inset-0 rounded-full" style={{ background: "#0f172a", border: "1px solid #1e3a5f" }} />
          {/* Center mark */}
          <div className="absolute top-0 bottom-0 w-0.5"
            style={{ left: "50%", background: "#22c55e", opacity: 0.6 }} />
          {/* Bubble */}
          {roll !== null && (
            <div className="absolute rounded-full" style={{
              left: `${(bubbleX / barW) * 100}%`, top: 1, bottom: 1, width: 12,
              transform: "translateX(-6px)",
              background: rollOk ? "#22c55e" : "#f97316",
              boxShadow: `0 0 10px ${rollOk ? "#22c55e" : "#f97316"}`,
              transition: "left 0.15s ease",
            }} />
          )}
        </div>
        <span className="text-xs font-mono w-16 text-right shrink-0"
          style={{ color: rollOk ? "#22c55e" : "#f97316" }}>
          {roll !== null ? `${roll > 0 ? "+" : ""}${roll}°` : "—"}
        </span>
      </div>

      <div className="text-xs text-slate-500 text-center">
        هدف الارتفاع: <span className="text-blue-400 font-mono">{targetElevation}°</span>
        {" · "}وجّه الهاتف نحو القمر الصناعي لقياس الزاوية
      </div>
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
  lnbOffset,
}: {
  azimuth: number;
  elevation: number;
  skew: number;
  lnbOffset: number;
}) {
  // ── SVG canvas ─────────────────────────────────────────────────────────────
  const w = 440;
  const h = 340;

  // ── Direction ───────────────────────────────────────────────────────────────
  const azNorm = ((azimuth % 360) + 360) % 360;
  const isWest = azNorm > 180;

  const rotateDeg = (90 - elevation) * (isWest ? -1 : 1);
  const rotateRad = (rotateDeg * Math.PI) / 180;

  // ── Dish geometry (local space, dish faces UP) ─────────────────────────────
  const dishW = 60;
  const dishD = 30;
  const armLen = 44;
  const lnbLen = dishD + armLen; // 74 — total reach from pivot to focal point

  // LNB offset: signed -90 to +90. Rotates LNB on a circle centered at dish vertex.
  const signedOffset = Math.max(-90, Math.min(90, lnbOffset));
  const lnbOffRad = (signedOffset * Math.PI) / 180;
  const hasOffset = signedOffset !== 0;

  // ── Layout ─────────────────────────────────────────────────────────────────
  const poleX   = w / 2;
  const groundY = h - 28;
  const pivotY  = 230;

  // ── Protractor (semicircle) ─────────────────────────────────────────────────
  const arcR = 148;

  // Satellite sticker position (on arc at dish pointing direction)
  const satArcX = poleX + arcR * Math.sin(rotateRad);
  const satArcY = pivotY - arcR * Math.cos(rotateRad);

  // Dish vertex (deepest point = rotation pivot)
  const vertexWorldX = poleX;
  const vertexWorldY = pivotY;

  // LNB direction in world space: dish axis rotated by lnbOffRad
  // outDirX/Y is the unit vector from vertex toward LNB
  const outDirX = Math.sin(lnbOffRad + rotateRad);
  const outDirY = -Math.cos(lnbOffRad + rotateRad);

  // LNB in LOCAL space (on circle of radius lnbLen, centered at vertex)
  const lnbCX = Math.sin(lnbOffRad) * lnbLen;
  const lnbCY = -Math.cos(lnbOffRad) * lnbLen;

  // LNB in WORLD space
  const lnbWorldX = poleX + lnbLen * outDirX;
  const lnbWorldY = pivotY + lnbLen * outDirY;

  // Output ray end (signal exits LNB away from dish)
  const outLen = 60;
  const outEndX = lnbWorldX + outDirX * outLen;
  const outEndY = lnbWorldY + outDirY * outLen;

  // ── Tick marks on the semicircle ────────────────────────────────────────────
  const ticks = [-90, -75, -60, -45, -30, -15, 0, 15, 30, 45, 60, 75, 90];

  return (
    <div
      className="rounded-xl border border-blue-900/40 bg-slate-900/60 p-3 w-full"
      style={{ backdropFilter: "blur(12px)" }}
    >
      <div className="text-xs text-blue-400 mb-1 font-semibold tracking-wider uppercase text-center">
        Dish Diagram — مجسم الطبق
      </div>
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} direction="ltr" style={{ display: "block" }}>
        <defs>
          <linearGradient id="pGr" x1="0%" x2="100%" y1="0%" y2="0%">
            <stop offset="0%"   stopColor="#060e1a" />
            <stop offset="45%"  stopColor="#1e3a5f" />
            <stop offset="55%"  stopColor="#2d5080" />
            <stop offset="100%" stopColor="#060e1a" />
          </linearGradient>
          <filter id="gBm" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="3.5" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="gSat" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* ── GROUND ── */}
        <rect x={0} y={groundY} width={w} height={h - groundY} fill="#040b16" />
        <line x1={0} y1={groundY} x2={w} y2={groundY} stroke="#1e3a5f" strokeWidth="2" />
        {Array.from({ length: 24 }, (_, i) => (
          <line key={i} x1={i*20} y1={groundY} x2={i*20-10} y2={groundY+8}
            stroke="#0a1628" strokeWidth="1.5" />
        ))}

        {/* ── POLE ── */}
        <rect x={poleX-5} y={pivotY+10} width={10} height={groundY-pivotY-10}
          rx={3} fill="url(#pGr)" />
        <rect x={poleX-20} y={groundY-6} width={40} height={10} rx={3} fill="url(#pGr)" />
        <rect x={poleX-24} y={groundY+1} width={48} height={6} rx={3}
          fill="#040b16" stroke="#1e3a5f" strokeWidth="1" />
        {[-13,-4,4,13].map(bx => (
          <circle key={bx} cx={poleX+bx} cy={groundY+4} r={2}
            fill="#1e3a5f" stroke="#334155" strokeWidth="0.8" />
        ))}

        {/* ── PROTRACTOR SEMICIRCLE (180° arc, centered at pivotY) ── */}
        {/* Full semicircle background fill (faint) */}
        <path
          d={`M ${poleX-arcR},${pivotY} A ${arcR},${arcR} 0 0,1 ${poleX+arcR},${pivotY} Z`}
          fill="#060e1a" opacity="0.4"
        />
        {/* Semicircle arc outline */}
        <path
          d={`M ${poleX-arcR},${pivotY} A ${arcR},${arcR} 0 0,1 ${poleX+arcR},${pivotY}`}
          fill="none" stroke="#1e3a5f" strokeWidth="1.5"
        />
        {/* Baseline */}
        <line x1={poleX-arcR} y1={pivotY} x2={poleX+arcR} y2={pivotY}
          stroke="#1e3a5f" strokeWidth="1" strokeDasharray="4 4" opacity="0.6" />

        {/* ── TICK MARKS & LABELS ── */}
        {ticks.map(td => {
          const tr = (td * Math.PI) / 180;
          const tx = poleX + arcR * Math.sin(tr);
          const ty = pivotY - arcR * Math.cos(tr);
          const isMajor = td % 30 === 0;
          const tickLen = isMajor ? 12 : 6;
          const ix = poleX + (arcR - tickLen) * Math.sin(tr);
          const iy = pivotY - (arcR - tickLen) * Math.cos(tr);
          const elLabel = 90 - Math.abs(td);
          const lx = poleX + (arcR + 18) * Math.sin(tr);
          const ly = pivotY - (arcR + 18) * Math.cos(tr);
          return (
            <g key={td}>
              <line x1={tx} y1={ty} x2={ix} y2={iy}
                stroke={isMajor ? "#334155" : "#1e3a5f"}
                strokeWidth={isMajor ? 1.8 : 1} />
              {isMajor && (
                <text x={lx} y={ly} textAnchor="middle" dominantBaseline="central"
                  fill="#334155" fontSize="9" fontWeight="500">{elLabel}°</text>
              )}
            </g>
          );
        })}

        {/* ── DISH ASSEMBLY (rotates around pivotY) ── */}
        <g transform={`translate(${poleX},${pivotY}) rotate(${rotateDeg})`}>
          {/* Dish fill */}
          <path d={`M ${-dishW},${-dishD} Q 0,${dishD} ${dishW},${-dishD} Z`}
            fill="#060f1e" opacity="0.97" />
          {/* Inner arcs */}
          {[0.72, 0.44].map(t => (
            <path key={t}
              d={`M ${-dishW*t},${-dishD*t*t} Q 0,${dishD*t*t} ${dishW*t},${-dishD*t*t}`}
              fill="none" stroke="#1e3a5f" strokeWidth="1" opacity="0.7" />
          ))}
          {/* Dish axis dashed reference */}
          <line x1={0} y1={0} x2={0} y2={-(lnbLen + 14)}
            stroke="#1e3a5f" strokeWidth="0.8" strokeDasharray="4 3" opacity="0.4" />
          {/* Main rim */}
          <path d={`M ${-dishW},${-dishD} Q 0,${dishD} ${dishW},${-dishD}`}
            fill="none" stroke="#2563eb" strokeWidth="3.5" strokeLinecap="round" />
          {/* Aperture edge */}
          <line x1={-dishW} y1={-dishD} x2={dishW} y2={-dishD}
            stroke="#2563eb" strokeWidth="3.5" strokeLinecap="round" />
          {/* Vertex hub */}
          <circle cx={0} cy={0} r={5} fill="#0a1628" stroke="#3b82f6" strokeWidth="1.8" />
          <circle cx={0} cy={0} r={2} fill="#2563eb" />

          {/* ── Main arm: vertex → LNB (single arm, rotates with offset) ── */}
          <line x1={0} y1={0} x2={lnbCX} y2={lnbCY}
            stroke={hasOffset ? "#f97316" : "#475569"} strokeWidth="3" strokeLinecap="round" />

          {/* ── Side braces: dish rim → LNB center ── */}
          <line x1={-dishW*0.6} y1={-dishD} x2={lnbCX} y2={lnbCY}
            stroke="#334155" strokeWidth="1.4" strokeLinecap="round" />
          <line x1={dishW*0.6} y1={-dishD} x2={lnbCX} y2={lnbCY}
            stroke="#334155" strokeWidth="1.4" strokeLinecap="round" />

          {/* ── Rotation angle arc at vertex ── */}
          {hasOffset && (() => {
            const arcR2 = 22;
            const ex = Math.sin(lnbOffRad) * arcR2;
            const ey = -Math.cos(lnbOffRad) * arcR2;
            const sweep = signedOffset > 0 ? 1 : 0;
            const halfRad = lnbOffRad / 2;
            return (
              <>
                <path
                  d={`M 0,${-arcR2} A ${arcR2},${arcR2} 0 0,${sweep} ${ex},${ey}`}
                  fill="none" stroke="#f97316" strokeWidth="1.4" opacity="0.85"
                />
                <text
                  x={Math.sin(halfRad) * 34}
                  y={-Math.cos(halfRad) * 34}
                  textAnchor={signedOffset >= 0 ? "start" : "end"}
                  dominantBaseline="central"
                  fill="#fb923c" fontSize="8" fontWeight="700">
                  {signedOffset > 0 ? "+" : ""}{signedOffset}°
                </text>
              </>
            );
          })()}

          {/* ── LNB head: faces toward dish vertex (downward at 0°, rotates by signedOffset) ── */}
          <g transform={`translate(${lnbCX},${lnbCY}) rotate(${signedOffset})`}>
            <rect x={-7} y={-6} width={14} height={12} rx={2.5}
              fill="#0f172a" stroke={hasOffset ? "#f97316" : "#60a5fa"} strokeWidth="1.8" />
            <rect x={-3.5} y={-3} width={7} height={7} rx={1.5}
              fill={hasOffset ? "#9a3412" : "#1d4ed8"} />
            <line x1={0} y1={6} x2={0} y2={13}
              stroke={hasOffset ? "#f97316" : "#60a5fa"} strokeWidth="1.8" opacity="0.8" />
            <circle cx={0} cy={14} r={1.5}
              fill={hasOffset ? "#f97316" : "#60a5fa"} opacity="0.9" />
          </g>

          {/* ── On-axis reference (focal position at offset=0) ── */}
          <circle cx={0} cy={-lnbLen} r={3.5} fill="none"
            stroke="#22c55e" strokeWidth="1.2" strokeDasharray="3 2"
            opacity={hasOffset ? 0.3 : 0.9} />
          {!hasOffset && (
            <text x={9} y={-lnbLen + 1} dominantBaseline="central"
              fill="#4ade80" fontSize="7" fontWeight="600" opacity="0.85">بؤرة</text>
          )}
        </g>

        {/* ══ BEAM SIMULATION ══════════════════════════════════════════════════ */}

        {/* Segment 1: Satellite → Vertex (INCOMING signal) — GREEN */}
        <line x1={satArcX} y1={satArcY} x2={vertexWorldX} y2={vertexWorldY}
          stroke="#22c55e" strokeWidth="8" opacity="0.08" filter="url(#gBm)" />
        <line x1={satArcX} y1={satArcY} x2={vertexWorldX} y2={vertexWorldY}
          stroke="#22c55e" strokeWidth="1.8" opacity="0.9" />
        <line x1={satArcX} y1={satArcY} x2={vertexWorldX} y2={vertexWorldY}
          stroke="#86efac" strokeWidth="0.8" strokeDasharray="9 6" opacity="0.5" />

        {/* Reflection dot at vertex */}
        <circle cx={vertexWorldX} cy={vertexWorldY} r={6} fill="#22c55e" opacity="0.12" />
        <circle cx={vertexWorldX} cy={vertexWorldY} r={3.5} fill="#22c55e" opacity="0.75" />

        {/* Segment 2: Vertex → LNB (REFLECTED signal — angle of incidence = angle of reflection) — YELLOW */}
        <line x1={vertexWorldX} y1={vertexWorldY} x2={lnbWorldX} y2={lnbWorldY}
          stroke="#facc15" strokeWidth="7" opacity="0.08" filter="url(#gBm)" />
        <line x1={vertexWorldX} y1={vertexWorldY} x2={lnbWorldX} y2={lnbWorldY}
          stroke="#facc15" strokeWidth="1.8" opacity="0.9" />
        <line x1={vertexWorldX} y1={vertexWorldY} x2={lnbWorldX} y2={lnbWorldY}
          stroke="#fef08a" strokeWidth="0.8" strokeDasharray="9 6" opacity="0.5" />

        {/* LNB dot */}
        <circle cx={lnbWorldX} cy={lnbWorldY} r={5} fill="#facc15" opacity="0.2" />
        <circle cx={lnbWorldX} cy={lnbWorldY} r={3} fill="#facc15" />
        <circle cx={lnbWorldX} cy={lnbWorldY} r={1.2} fill="#fef9c3" />

        {/* Segment 3: LNB → outward (OUTPUT signal exits toward receiver) — YELLOW */}
        <line x1={lnbWorldX} y1={lnbWorldY} x2={outEndX} y2={outEndY}
          stroke="#facc15" strokeWidth="7" opacity="0.1" filter="url(#gBm)" />
        <line x1={lnbWorldX} y1={lnbWorldY} x2={outEndX} y2={outEndY}
          stroke="#facc15" strokeWidth="1.8" opacity="0.9" />
        <line x1={lnbWorldX} y1={lnbWorldY} x2={outEndX} y2={outEndY}
          stroke="#fef08a" strokeWidth="0.8" strokeDasharray="7 5" opacity="0.6" />

        {/* ── SATELLITE STICKER on the arc ── */}
        <g transform={`translate(${satArcX},${satArcY})`} filter="url(#gSat)">
          {/* Glow halo */}
          <circle cx={0} cy={0} r={16} fill="#1d4ed8" opacity="0.1" />
          {/* Body */}
          <rect x={-7} y={-5} width={14} height={10} rx={2}
            fill="#1e293b" stroke="#3b82f6" strokeWidth="1.2" />
          {/* Left panel */}
          <rect x={-19} y={-2} width={12} height={4} rx={1}
            fill="#1e40af" stroke="#3b82f6" strokeWidth="0.8" />
          <line x1={-11} y1={-2} x2={-11} y2={2} stroke="#93c5fd" strokeWidth="0.6" />
          <line x1={-14} y1={-2} x2={-14} y2={2} stroke="#93c5fd" strokeWidth="0.6" />
          {/* Right panel */}
          <rect x={7} y={-2} width={12} height={4} rx={1}
            fill="#1e40af" stroke="#3b82f6" strokeWidth="0.8" />
          <line x1={11} y1={-2} x2={11} y2={2} stroke="#93c5fd" strokeWidth="0.6" />
          <line x1={14} y1={-2} x2={14} y2={2} stroke="#93c5fd" strokeWidth="0.6" />
          {/* LED */}
          <circle cx={3} cy={0} r={1.5} fill="#22c55e" />
        </g>

        {/* ── INFO LABELS ── */}
        {/* Elevation badge near the arc */}
        <rect x={poleX-38} y={9} width={76} height={24} rx={5}
          fill="#060e1a" stroke="#1e3a5f" strokeWidth="1" opacity="0.9" />
        <text x={poleX} y={21} textAnchor="middle" dominantBaseline="central"
          fill="#facc15" fontSize="11" fontWeight="800">
          {`El ${elevation}°  Az ${azimuth}°`}
        </text>

        {/* Skew label bottom-right */}
        <text x={w-8} y={h-10} textAnchor="end" fill="#a78bfa" fontSize="9" fontWeight="600">
          Skew: {skew}°
        </text>

        {/* Side labels: W/E */}
        <text x={poleX - arcR - 8} y={pivotY} textAnchor="end" dominantBaseline="central"
          fill="#60a5fa" fontSize="10" fontWeight="700">W</text>
        <text x={poleX + arcR + 8} y={pivotY} textAnchor="start" dominantBaseline="central"
          fill="#60a5fa" fontSize="10" fontWeight="700">E</text>
      </svg>
    </div>
  );
}

export default function Home() {
  const [coordInput, setCoordInput] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [selectedSat, setSelectedSat] = useState(SATELLITES[0]);
  const [satLonInput, setSatLonInput] = useState(String(SATELLITES[0].longitude));
  const [angles, setAngles] = useState({ azimuth: 0, elevation: 0, skew: 0 });
  const [parseError, setParseError] = useState(false);
  const [lnbOffset, setLnbOffset] = useState(0);
  const [lnbOffsetInput, setLnbOffsetInput] = useState("0");
  const sensors = useSensors();

  const applyCoords = useCallback((input: string) => {
    if (!input.trim()) {
      setCoords(null);
      setParseError(false);
      return;
    }
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

  const handleLnbOffsetChange = useCallback((val: string) => {
    setLnbOffsetInput(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num >= -90 && num <= 90) {
      setLnbOffset(num);
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

  const adjustedElevation = Math.max(0, Math.min(90, Math.round((angles.elevation - lnbOffset) * 10) / 10));

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
              placeholder={"مثال: 34°03'07.2\"N 12°20'42.0\"E"}
              className="w-full rounded-lg px-3 py-2.5 text-sm font-mono bg-slate-800/80 border text-white placeholder-slate-500 outline-none transition-colors"
              style={{
                borderColor: parseError ? "#ef4444" : "#1e3a5f",
                direction: "ltr",
              }}
              dir="ltr"
            />
            {parseError && (
              <p className="text-xs text-red-400 mt-1">
                صيغة غير صحيحة — استخدم: 34°03'07.2"N 12°20'42.0"E
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

          <div className="w-full sm:min-w-[200px] sm:w-auto flex flex-col gap-1.5">
            <label className="block text-xs text-purple-400 font-semibold tracking-wider">
              زاوية انحراف العدسة (LNB Offset)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.5"
                min="-90"
                max="90"
                value={lnbOffsetInput}
                onChange={(e) => handleLnbOffsetChange(e.target.value)}
                className="flex-1 rounded-lg px-3 py-2 text-sm font-mono bg-slate-800/80 border border-purple-900/50 text-white placeholder-slate-500 outline-none"
                dir="ltr"
              />
              <span className="text-xs text-slate-400">°</span>
            </div>
            <p className="text-xs text-slate-500">
              {lnbOffset === 0
                ? "العدسة في البؤرة (مثالي)"
                : lnbOffset > 0
                ? `+${lnbOffset}° → العدسة تميل نحو القمر`
                : `${lnbOffset}° → العدسة تميل بعيداً عن القمر`}
            </p>
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
          <>
          <div className="flex flex-col lg:flex-row gap-4 items-stretch">
            {/* ── Compass panel ── */}
            <div
              className="rounded-2xl border border-blue-900/40 p-4 flex flex-col items-center w-full lg:w-auto"
              style={{ background: "rgba(10, 22, 40, 0.7)", backdropFilter: "blur(16px)" }}
            >
              <div className="text-xs text-blue-400 mb-3 font-semibold tracking-wider uppercase text-center flex items-center justify-center gap-2">
                البوصلة والاتجاه — Compass
                {sensors.isCompassAvailable && (
                  <span className="inline-flex items-center gap-1 bg-green-900/30 border border-green-700/40 rounded-full px-2 py-0.5 text-green-400 text-xs font-normal">
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
                    مباشر
                  </span>
                )}
              </div>

              {/* iOS compass permission button */}
              {sensors.needsPermission && !sensors.hasPermission && (
                <button
                  onClick={sensors.requestPermission}
                  className="mb-3 w-full text-xs rounded-xl px-4 py-2.5 font-semibold"
                  style={{
                    background: "linear-gradient(135deg, #f97316, #ea580c)",
                    color: "white",
                    border: "1px solid #fb923c",
                    letterSpacing: "0.03em",
                  }}
                >
                  🧭 تفعيل البوصلة والمستشعرات
                </button>
              )}

              <div style={{ width: "100%", maxWidth: 400 }}>
                <CompassDial
                  azimuth={angles.azimuth}
                  satelliteName={selectedSat.name}
                  coords={coords}
                  deviceHeading={sensors.compassHeading}
                />
              </div>

              {/* Compass legend */}
              {sensors.isCompassAvailable && (
                <div className="flex gap-4 text-xs mt-2 justify-center" style={{ direction: "ltr" }}>
                  <span className="flex items-center gap-1">
                    <span style={{ width: 20, height: 3, background: "#facc15", borderRadius: 2, display: "inline-block" }} />
                    <span className="text-slate-400">Satellite</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span style={{ width: 20, height: 3, background: "#f97316", borderRadius: 2, display: "inline-block" }} />
                    <span className="text-slate-400">You →</span>
                  </span>
                </div>
              )}
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
                  { label: "الارتفاع", sub: lnbOffset > 0 ? `مُعدَّل (−${lnbOffset}°)` : "Elevation", value: `${adjustedElevation}°`, color: "#60a5fa", x: 110 },
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
                lnbOffset={lnbOffset}
              />
            </div>
          </div>

          {/* ── Sensor live panel (angle level + compass heading readout) ── */}
          {sensors.isTiltAvailable && (
            <AngleLevel
              tiltBeta={sensors.tiltBeta}
              tiltGamma={sensors.tiltGamma}
              targetElevation={adjustedElevation}
            />
          )}

          {/* Compass heading readout row */}
          {sensors.isCompassAvailable && (
            <div
              className="rounded-xl border border-blue-900/40 px-5 py-3 flex flex-wrap items-center gap-4"
              style={{ background: "rgba(10,22,40,0.7)", backdropFilter: "blur(16px)", direction: "ltr" }}
            >
              <span className="text-xs text-blue-400 font-semibold tracking-wider" style={{ direction: "rtl" }}>
                🧭 البوصلة المباشرة
              </span>
              <span className="font-mono text-white text-lg font-bold">
                {sensors.compassHeading?.toFixed(1)}°
              </span>
              <span className="text-xs text-slate-500">
                {(() => {
                  const h = sensors.compassHeading ?? 0;
                  if (h >= 337.5 || h < 22.5) return "شمال N";
                  if (h < 67.5)  return "شمال-شرق NE";
                  if (h < 112.5) return "شرق E";
                  if (h < 157.5) return "جنوب-شرق SE";
                  if (h < 202.5) return "جنوب S";
                  if (h < 247.5) return "جنوب-غرب SW";
                  if (h < 292.5) return "غرب W";
                  return "شمال-غرب NW";
                })()}
              </span>
              <span className="mr-auto text-xs text-slate-500" style={{ direction: "rtl" }}>
                هدف القمر الصناعي: <span className="text-yellow-400 font-mono font-bold">{angles.azimuth}°</span>
                &nbsp;·&nbsp;
                الفرق: <span
                  className="font-mono font-bold"
                  style={{ color: Math.abs(((sensors.compassHeading ?? 0) - angles.azimuth + 540) % 360 - 180) <= 5 ? "#22c55e" : "#f97316" }}>
                  {Math.round((((sensors.compassHeading ?? 0) - angles.azimuth + 540) % 360) - 180)}°
                </span>
              </span>
            </div>
          )}
          </>
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
