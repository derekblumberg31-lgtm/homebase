/** Shrinks a photo to at most `max` px on its longest side and returns a JPEG data URL. */
export async function compressPhoto(file: File, max = 1024, quality = 0.8): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const SHRINKABLE = /^image\/(jpeg|png|webp|heic|heif)$/i;
export const SHRINK_ABOVE = 1.5 * 1024 * 1024;

/** Big camera photos are made smaller before they are stored; PDFs and small images are left alone. */
export function shouldShrink(file: { size: number; type: string }): boolean {
  return SHRINKABLE.test(file.type) && file.size > SHRINK_ABOVE;
}

/** True when any pixel of RGBA data is not fully opaque. JPEG has no alpha, so such an image can't be saved as one. */
export function hasTransparency(rgba: ArrayLike<number>): boolean {
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] < 255) return true;
  return false;
}

/** Same approach as compressPhoto, but returns a blob for the files store: a JPEG, or a PNG when the picture has transparency. Rejects if the image can't be decoded. */
export async function shrinkPhotoBlob(file: Blob, max = 2000, quality = 0.85): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    // Transparent pixels would turn black as a JPEG, so a picture with any stays a PNG.
    const type = /^image\/(png|webp)$/i.test(file.type) && hasTransparency(ctx.getImageData(0, 0, canvas.width, canvas.height).data) ? 'image/png' : 'image/jpeg';
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
    if (!blob) throw new Error('Could not encode the photo');
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * The file to store for a picked file: a smaller JPEG (or PNG, when the picture has transparency) named `<original base>.jpg` or `.png` when it is a large photo,
 * otherwise the original. If the photo can't be decoded (HEIC outside Safari) or the result isn't smaller, the original is kept.
 */
export async function photoForStorage(file: File): Promise<File> {
  if (!shouldShrink(file)) return file;
  try {
    const blob = await shrinkPhotoBlob(file);
    if (blob.size >= file.size) return file;
    const base = file.name.replace(/\.[^./\\]+$/, '') || 'photo';
    const png = blob.type === 'image/png';
    return new File([blob], `${base}${png ? '.png' : '.jpg'}`, { type: png ? 'image/png' : 'image/jpeg', lastModified: file.lastModified });
  } catch {
    return file;
  }
}
