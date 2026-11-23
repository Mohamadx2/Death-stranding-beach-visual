/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ControlOverlay } from './components/ControlOverlay';
import {
  BeachExperience,
  CameraMode,
  SceneTelemetry,
} from './scene/BeachExperience';
import { AtmospherePresetId } from './scene/materials';

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const experienceRef = useRef<BeachExperience | null>(null);

  const [preset, setPreset] = useState<AtmospherePresetId>('ash');
  const [cameraMode, setCameraMode] = useState<CameraMode>('shoulder');
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [contextLost, setContextLost] = useState(false);
  const [telemetry, setTelemetry] = useState<SceneTelemetry>({
    x: 0,
    z: 18,
    elevation: 0.9,
    headingDeg: 180,
    speed: 0,
    isWading: false,
  });

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const exp = new BeachExperience({
      container,
      onTelemetry: (next) => setTelemetry(next),
      onContextLost: (lost) => setContextLost(lost),
    });
    experienceRef.current = exp;

    return () => {
      exp.dispose();
      experienceRef.current = null;
    };
  }, []);

  const handleSelectPreset = useCallback((next: AtmospherePresetId) => {
    setPreset(next);
    experienceRef.current?.setAtmosphere(next);
  }, []);

  const handleSelectCamera = useCallback((mode: CameraMode) => {
    setCameraMode(mode);
    experienceRef.current?.setCameraMode(mode);
  }, []);

  const handleTriggerScan = useCallback(() => {
    experienceRef.current?.triggerScan();
  }, []);

  const handleToggleAudio = useCallback(() => {
    if (!experienceRef.current) return;
    const enabled = experienceRef.current.toggleAudio();
    setAudioEnabled(enabled);
  }, []);

  const handleTouchMove = useCallback((x: number, y: number) => {
    experienceRef.current?.setTouchJoystick(x, y);
  }, []);

  const handleJump = useCallback(() => {
    experienceRef.current?.triggerJump();
  }, []);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#14181d]">
      <div ref={mountRef} className="fixed inset-0 cursor-grab active:cursor-grabbing" />
      <ControlOverlay
        telemetry={telemetry}
        preset={preset}
        cameraMode={cameraMode}
        audioEnabled={audioEnabled}
        contextLost={contextLost}
        onSelectPreset={handleSelectPreset}
        onSelectCamera={handleSelectCamera}
        onTriggerScan={handleTriggerScan}
        onToggleAudio={handleToggleAudio}
        onTouchMove={handleTouchMove}
        onJump={handleJump}
      />
    </main>
  );
}
