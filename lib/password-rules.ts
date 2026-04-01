export interface PasswordValidation {
  valid: boolean;
  errors: string[];
}

export const PASSWORD_REQUIREMENTS = [
  { label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { label: 'One uppercase letter (A–Z)', test: (p: string) => /[A-Z]/.test(p) },
  { label: 'One lowercase letter (a–z)', test: (p: string) => /[a-z]/.test(p) },
  { label: 'One number (0–9)', test: (p: string) => /[0-9]/.test(p) },
  { label: 'One special character (!@#$%^&*)', test: (p: string) => /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(p) },
];

export function validatePassword(password: string): PasswordValidation {
  const errors = PASSWORD_REQUIREMENTS
    .filter(r => !r.test(password))
    .map(r => r.label);
  return { valid: errors.length === 0, errors };
}
