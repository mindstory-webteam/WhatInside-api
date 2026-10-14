/** Camera permission UI state derived from expo-camera's PermissionResponse (unit-tested). */
export type CameraPermissionUi = 'loading' | 'granted' | 'ask' | 'blocked';

export function cameraPermissionUi(p: { granted: boolean; canAskAgain: boolean } | null | undefined): CameraPermissionUi {
  if (!p) return 'loading';
  if (p.granted) return 'granted';
  return p.canAskAgain ? 'ask' : 'blocked';
}

/** Crop rectangle (in image pixels) matching the on-screen guide frame. */
export function guideCrop(width: number, height: number, frame = { w: 0.86, h: 0.5 }) {
  const cw = Math.round(width * frame.w);
  const ch = Math.round(height * frame.h);
  return { originX: Math.round((width - cw) / 2), originY: Math.round((height - ch) / 2), width: cw, height: ch };
}
