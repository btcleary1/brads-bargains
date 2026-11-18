// Passkey wording follows FIDO Alliance / Google guidance: call it a "passkey" and
// tie it to the familiar unlock. This picks the unlock name for the current device.
export function unlockName(ua: string = typeof navigator !== "undefined" ? navigator.userAgent : ""): string {
  if (/iPhone|iPad|iPod/.test(ua)) return "Face ID";
  if (/Macintosh/.test(ua) && typeof navigator !== "undefined" && navigator.maxTouchPoints > 1) return "Face ID";
  if (/Macintosh/.test(ua)) return "Touch ID";
  if (/CrOS|Android/.test(ua)) return "fingerprint or screen lock";
  if (/Windows/.test(ua)) return "Windows Hello";
  return "fingerprint, face, or screen lock";
}
