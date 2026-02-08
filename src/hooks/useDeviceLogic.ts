import { useState, useEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

interface DeviceLogicProps {
  isPlaying: boolean;
  isReadingAloud: boolean;
  isSynthesizing: boolean;
}

export function useDeviceLogic({ isPlaying, isReadingAloud, isSynthesizing }: DeviceLogicProps) {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  const [rotationTrigger, setRotationTrigger] = useState(0);
  const lastRotationTimeRef = useRef(0);

  // PWA Background Update
  useEffect(() => {
    if (!needRefresh) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && !isPlaying && !isReadingAloud && !isSynthesizing) {
        console.log('[PWA] Updating in background...');
        updateServiceWorker(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [needRefresh, isPlaying, isReadingAloud, isSynthesizing, updateServiceWorker]);

  // Rotation Tracking
  useEffect(() => {
    const handleRotation = () => {
      lastRotationTimeRef.current = Date.now();
      setRotationTrigger(prev => prev + 1);
    };

    if (screen.orientation) {
      screen.orientation.addEventListener('change', handleRotation);
    }
    window.addEventListener('orientationchange', handleRotation);

    return () => {
      if (screen.orientation) {
        screen.orientation.removeEventListener('change', handleRotation);
      }
      window.removeEventListener('orientationchange', handleRotation);
    };
  }, []);

  return {
    rotationTrigger,
    lastRotationTime: lastRotationTimeRef.current
  };
}
