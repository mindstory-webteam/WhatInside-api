import { scanApi } from '@/api/endpoints';
import { recognizeLabel, targetSize } from '@/scan/recognize';

const mockResize = jest.fn();
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: {
    manipulate: () => ({
      resize: (...a: unknown[]) => mockResize(...a),
      renderAsync: async () => ({ saveAsync: async () => ({ uri: 'file:///small.jpg', base64: 'QUJD' }) }),
    }),
  },
}));

describe('server OCR upload', () => {
  it('only downsizes photos larger than the limit, keeping aspect ratio', () => {
    expect(targetSize(1200, 900)).toBeNull();
    expect(targetSize(4000, 3000)).toEqual({ width: 1600, height: null });
    expect(targetSize(3000, 4000)).toEqual({ width: null, height: 1600 });
  });

  it('sends a resized base64 JPEG as JSON when on-device OCR is unavailable (Expo Go)', async () => {
    const spy = jest.spyOn(scanApi, 'ocrImage').mockResolvedValue({ lines: ['x'] } as never);
    await recognizeLabel({ uri: 'file:///big.jpg', width: 4000, height: 3000 }, 'dmy');
    expect(mockResize).toHaveBeenCalledWith({ width: 1600, height: null });
    expect(spy).toHaveBeenCalledWith('QUJD', 'dmy');
  });
});
