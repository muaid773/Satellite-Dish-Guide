import { useState, useEffect, useCallback, useRef } from "react";

export interface SensorState {
  compassHeading: number | null;
  tiltBeta: number | null;
  tiltGamma: number | null;
  isCompassAvailable: boolean;
  isTiltAvailable: boolean;
  hasPermission: boolean;
  needsPermission: boolean;
  requestPermission: () => Promise<void>;
}

export function useSensors(): SensorState {
  const [compassHeading, setCompassHeading] = useState<number | null>(null);
  const [tiltBeta, setTiltBeta] = useState<number | null>(null);
  const [tiltGamma, setTiltGamma] = useState<number | null>(null);
  const [isCompassAvailable, setIsCompassAvailable] = useState(false);
  const [isTiltAvailable, setIsTiltAvailable] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const [needsPermission, setNeedsPermission] = useState(false);
  const listeningRef = useRef(false);

  const handleOrientation = useCallback((e: DeviceOrientationEvent) => {
    if (e.beta !== null || e.gamma !== null) {
      setIsTiltAvailable(true);
      if (e.beta !== null) setTiltBeta(Math.round(e.beta * 10) / 10);
      if (e.gamma !== null) setTiltGamma(Math.round(e.gamma * 10) / 10);
    }

    // iOS uses webkitCompassHeading (direct heading from North, clockwise)
    const iosHeading = (e as unknown as { webkitCompassHeading?: number }).webkitCompassHeading;
    if (iosHeading !== undefined && iosHeading !== null) {
      setIsCompassAvailable(true);
      setCompassHeading(Math.round(iosHeading * 10) / 10);
      return;
    }

    // Android: alpha = rotation around Z axis (degrees from North, CCW)
    // Convert to clockwise heading: heading = (360 - alpha) % 360
    if (e.alpha !== null) {
      setIsCompassAvailable(true);
      setCompassHeading(Math.round(((360 - e.alpha) % 360) * 10) / 10);
    }
  }, []);

  const startListening = useCallback(() => {
    if (listeningRef.current) return;
    listeningRef.current = true;
    setHasPermission(true);
    // "deviceorientationabsolute" gives world-referenced angles (Android Chrome)
    // Fall back to "deviceorientation" for iOS / older browsers
    if ("ondeviceorientationabsolute" in window) {
      window.addEventListener("deviceorientationabsolute", handleOrientation as EventListener, true);
    }
    window.addEventListener("deviceorientation", handleOrientation as EventListener, true);
  }, [handleOrientation]);

  const requestPermission = useCallback(async () => {
    // iOS 13+ requires explicit permission request
    const DOE = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    if (typeof DOE.requestPermission === "function") {
      try {
        const result = await DOE.requestPermission();
        if (result === "granted") startListening();
      } catch (err) {
        console.warn("Sensor permission denied:", err);
      }
    } else {
      startListening();
    }
  }, [startListening]);

  useEffect(() => {
    // Check if permission API exists (iOS 13+)
    const DOE = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };
    if (typeof DOE.requestPermission === "function") {
      // iOS — must wait for user gesture
      setNeedsPermission(true);
    } else if (typeof window !== "undefined" && "DeviceOrientationEvent" in window) {
      // Android / desktop — start automatically
      startListening();
    }

    return () => {
      window.removeEventListener("deviceorientationabsolute", handleOrientation as EventListener, true);
      window.removeEventListener("deviceorientation", handleOrientation as EventListener, true);
    };
  }, [startListening, handleOrientation]);

  return {
    compassHeading,
    tiltBeta,
    tiltGamma,
    isCompassAvailable,
    isTiltAvailable,
    hasPermission,
    needsPermission,
    requestPermission,
  };
}
