const PROFILE_KEY = 'fashion_ai_profile';

// The photo is sent as reference to the image model; 1024px is plenty and keeps
// localStorage and request sizes small
const MAX_PHOTO_SIDE = 1024;
const PHOTO_QUALITY = 0.85;

export const EMPTY_PROFILE = { mode: 'none', image: null, height: '', weight: '', gender: '' };

export function loadProfile() {
  try {
    return { ...EMPTY_PROFILE, ...JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}') };
  } catch {
    return { ...EMPTY_PROFILE };
  }
}

/**
 * Persist the profile. Returns false when the browser refuses (e.g. storage quota),
 * in which case the profile still works for this session.
 */
export function saveProfile(profile) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    return true;
  } catch {
    return false;
  }
}

export function clearProfile() {
  try {
    localStorage.removeItem(PROFILE_KEY);
  } catch { /* ignore */ }
}

/**
 * True when the profile carries anything the backend can use
 */
export function hasProfile(profile) {
  if (!profile) return false;
  return (profile.mode !== 'none' && !!profile.image) || !!profile.height || !!profile.weight || !!profile.gender;
}

/**
 * Shape the profile for the API: drop the photo unless a photo mode is selected
 */
export function toApiProfile(profile) {
  if (!hasProfile(profile)) return null;
  const usePhoto = profile.mode !== 'none' && !!profile.image;
  return {
    mode: usePhoto ? profile.mode : 'none',
    image: usePhoto ? profile.image : null,
    height: profile.height ? Number(profile.height) : null,
    weight: profile.weight ? Number(profile.weight) : null,
    gender: profile.gender || null,
  };
}

/**
 * Downscale an image file to a JPEG data URL (max MAX_PHOTO_SIDE px on the long side)
 * @param {File} file
 * @returns {Promise<string>}
 */
export function resizeImageToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_PHOTO_SIDE / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      // JPEG has no alpha: paint white under transparent PNGs
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', PHOTO_QUALITY));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Không đọc được ảnh'));
    };
    img.src = url;
  });
}
