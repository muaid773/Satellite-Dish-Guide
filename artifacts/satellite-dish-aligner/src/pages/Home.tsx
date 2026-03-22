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
    <div className="relative" style={{ width: size + 60, height: size + 60 }}>
      <svg
        width={size + 60}
        height={size + 60}
        viewBox={`${-30} ${-30} ${size + 60} ${size + 60}`}
        style={{ overflow: "visible" }}
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
  const w = 320;
  const h = 200;
  const cx = w / 2;
  const cy = h / 2 + 20;

  const elRad = ((90 - elevation) * Math.PI) / 180;
  const dishLen = 60;
  const dishTipX = cx + dishLen * Math.cos(elRad - Math.PI / 2) * -1;
  const dishTipY = cy - dishLen * Math.sin(elRad);

  const groundY = cy + 40;

  const compassDirs = [
    { label: "N", deg: 0 },
    { label: "NE", deg: 45 },
    { label: "E", deg: 90 },
    { label: "SE", deg: 135 },
    { label: "S", deg: 180 },
    { label: "SW", deg: 225 },
    { label: "W", deg: 270 },
    { label: "NW", deg: 315 },
  ];

  const azNorm = ((azimuth % 360) + 360) % 360;
  const closestDir = compassDirs.reduce((prev, curr) =>
    Math.abs(curr.deg - azNorm) < Math.abs(prev.deg - azNorm) ? curr : prev
  );
  const isWest = azNorm > 180;

  const dishMirrorX = isWest ? -1 : 1;

  return (
    <div
      className="rounded-xl border border-blue-900/40 bg-slate-900/60 p-4"
      style={{ backdropFilter: "blur(12px)" }}
    >
      <div className="text-xs text-blue-400 mb-2 font-semibold tracking-wider uppercase">
        Dish Diagram — رسم الطبق 2D
      </div>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <defs>
          <marker
            id="arrowhead"
            markerWidth="8"
            markerHeight="6"
            refX="8"
            refY="3"
            orient="auto"
          >
            <polygon points="0 0, 8 3, 0 6" fill="#60a5fa" />
          </marker>
          <marker
            id="arrowYellow"
            markerWidth="8"
            markerHeight="6"
            refX="8"
            refY="3"
            orient="auto"
          >
            <polygon points="0 0, 8 3, 0 6" fill="#facc15" />
          </marker>
        </defs>

        <line x1={0} y1={groundY} x2={w} y2={groundY} stroke="#1e3a5f" strokeWidth="1.5" />
        <text x={4} y={groundY - 4} fill="#334155" fontSize="9">
          الأرض
        </text>

        <line
          x1={cx}
          y1={groundY}
          x2={cx}
          y2={20}
          stroke="#1e3a5f"
          strokeWidth="1"
          strokeDasharray="4 3"
        />

        <line
          x1={30}
          y1={groundY}
          x2={cx - 4}
          y2={groundY}
          stroke="#3b82f6"
          strokeWidth="1.5"
          strokeDasharray="5 3"
          markerEnd="url(#arrowhead)"
        />
        <text x={32} y={groundY - 5} fill="#60a5fa" fontSize="9">
          الأفق 0°
        </text>

        <line
          x1={cx}
          y1={groundY - 10}
          x2={dishTipX}
          y2={dishTipY}
          stroke="#facc15"
          strokeWidth="2.5"
          markerEnd="url(#arrowYellow)"
          opacity="0.9"
        />

        <text
          x={cx + (dishTipX - cx) / 2 + 12 * dishMirrorX}
          y={(groundY + dishTipY) / 2}
          fill="#fde047"
          fontSize="10"
          fontWeight="700"
        >
          El {elevation}°
        </text>

        <g transform={`translate(${cx}, ${groundY - 10})`}>
          <g
            transform={`rotate(${-(90 - elevation)}) scale(${dishMirrorX}, 1)`}
          >
            <path
              d="M 0 0 Q -30 -15 -45 0 Q -30 15 0 0"
              fill="none"
              stroke="#60a5fa"
              strokeWidth="2.5"
            />
            <path
              d="M 0 0 Q -30 -15 -45 0"
              fill="rgba(96,165,250,0.08)"
            />
            <line x1={0} y1={0} x2={-52} y2={0} stroke="#334155" strokeWidth="1" />
            <line x1={-45} y1={-3} x2={-45} y2={-22} stroke="#475569" strokeWidth="1.5" />

            <g transform={`rotate(${skew})`}>
              <ellipse
                cx={-45}
                cy={-15}
                rx={4}
                ry={8}
                fill="none"
                stroke="#a78bfa"
                strokeWidth="1.5"
              />
              <text
                x={-45}
                y={-15}
                textAnchor="middle"
                dominantBaseline="central"
                fill="#a78bfa"
                fontSize="7"
              >
                LNB
              </text>
            </g>
          </g>
        </g>

        <text x={cx + 4} y={groundY - 40} fill="#475569" fontSize="9">
          {closestDir.label} ({azimuth}°)
        </text>
        <line
          x1={cx}
          y1={groundY - 10}
          x2={cx}
          y2={groundY - 55}
          stroke="#334155"
          strokeWidth="1"
          strokeDasharray="3 2"
        />
        <polygon
          points={`${cx},${groundY - 60} ${cx - 4},${groundY - 50} ${cx + 4},${groundY - 50}`}
          fill="#475569"
        />

        <text x={w - 10} y={h - 10} textAnchor="end" fill="#334155" fontSize="9">
          Skew: {skew}°
        </text>
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

          <div className="min-w-[220px] flex flex-col gap-1.5">
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
          <div className="flex flex-wrap gap-4">
            <div
              className="rounded-2xl border border-blue-900/40 p-5 flex flex-col items-center"
              style={{ background: "rgba(10, 22, 40, 0.7)", backdropFilter: "blur(16px)" }}
            >
              <div className="text-xs text-blue-400 mb-3 font-semibold tracking-wider uppercase text-center">
                البوصلة والاتجاه — Compass
              </div>
              <CompassDial
                azimuth={angles.azimuth}
                satelliteName={selectedSat.name}
                coords={coords}
              />
              <svg width="340" height="68" viewBox="0 0 340 68" style={{ marginTop: 12 }} direction="ltr">
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
                    <rect x="2" y="2" width="106" height="64" rx="10" ry="10"
                      fill="none" stroke={item.color} strokeWidth="0.4" strokeOpacity="0.15" />
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

            <div
              className="rounded-2xl border border-blue-900/40 p-5 flex-1 min-w-[300px] flex items-center justify-center"
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
