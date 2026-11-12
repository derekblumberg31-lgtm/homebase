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

/** Same approach as compressPhoto, but returns a JPEG blob for the files store. Rejects if the image can't be decoded. */
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
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) throw new Error('Could not encode the photo');
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * The file to store for a picked file: a smaller JPEG named `<original base>.jpg` when it is a large photo,
 * otherwise the original. If the photo can't be decoded (HEIC outside Safari) or the result isn't smaller, the original is kept.
 */
export async function photoForStorage(file: File): Promise<File> {
  if (!shouldShrink(file)) return file;
  try {
    const blob = await shrinkPhotoBlob(file);
    if (blob.size >= file.size) return file;
    const base = file.name.replace(/\.[^./\\]+$/, '') || 'photo';
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: file.lastModified });
  } catch {
    return file;
  }
}
