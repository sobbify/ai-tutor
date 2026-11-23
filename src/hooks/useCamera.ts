import { useCallback, useEffect, useRef, useState } from 'react';

export type CameraStatus = 'off' | 'starting' | 'on' | 'blocked';

/**
 * Her own camera for the picture-in-picture, like a video call. Shown only on her screen: it is
 * never sent anywhere or recorded. Off by default; released when turned off or on leaving.
 */
export function useCamera() {
  const [status, setStatus] = useState<CameraStatus>('off');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const current = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    current.current?.getTracks().forEach((track) => track.stop());
    current.current = null;
    setStream(null);
    setStatus('off');
  }, []);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) return setStatus('blocked');
    setStatus('starting');
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 400 } }, audio: false });
      current.current = media;
      setStream(media);
      setStatus('on');
    } catch {
      setStatus('blocked');
    }
  }, []);

  const toggle = useCallback(() => {
    if (current.current) stop();
    else void start();
  }, [start, stop]);

  useEffect(() => () => current.current?.getTracks().forEach((track) => track.stop()), []);

  return { status, stream, toggle };
}
