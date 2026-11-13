// ═══════════════════════════════════════════════════════════════════
// Shared validation rules for customer forms.
// Imported by the browser (inline field errors) AND the API routes
// (authoritative check), so both sides reject exactly the same input.
// No server-only imports here.
// ═══════════════════════════════════════════════════════════════════

export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Not sure"] as const;
export const ACTIVITIES = ["Riding Lessons", "Trail Ride", "Joy Ride", "Photoshoot"] as const;
export const LEVELS = ["Beginner", "Intermediate", "Advanced"] as const;

export const LIMITS = {
  nameMin: 2,
  nameMax: 80,
  addressMin: 10,
  addressMax: 300,
  ageMin: 4,
  ageMax: 90,
  heightMin: 80,
  heightMax: 220,
  weightMin: 15,
  weightMax: 150,
} as const;

/** Collapse whitespace and trim. */
export const clean = (v: unknown, max = 300) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** Letters (any script), spaces, dot, apostrophe, hyphen. Must start with a letter. */
const NAME_RE = new RegExp("^\\p{L}[\\p{L}\\p{M} .'-]*$", "u");
const HAS_LETTER_RE = new RegExp("\\p{L}", "u");
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

/**
 * Indian mobile → 10 national digits, or "" if not recognisable.
 * Accepts "9820112345", "+91 98201 12345", "09820112345", "919820112345".
 */
export function toNationalMobile(input: unknown): string {
  let d = String(input ?? "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d.length === 10 ? d : "";
}

/** Display helper: "98201 12345". */
export const formatNational = (digits: string) => (digits.length > 5 ? `${digits.slice(0, 5)} ${digits.slice(5)}` : digits);

export function nameError(v: unknown, label = "name"): string | null {
  const s = clean(v, 200);
  if (!s) return `Please fill in the ${label}.`;
  if (s.length < LIMITS.nameMin) return `The ${label} is too short.`;
  if (s.length > LIMITS.nameMax) return `The ${label} is too long (max ${LIMITS.nameMax} characters).`;
  if (!NAME_RE.test(s)) return `Use letters only for the ${label} (no numbers or symbols).`;
  if (/(.)\1{3,}/i.test(s.replace(/\s/g, ""))) return `Please enter a real ${label}.`;
  return null;
}

export function mobileError(v: unknown, label = "mobile number"): string | null {
  const raw = String(v ?? "").replace(/\D/g, "");
  if (!raw) return `Please fill in the ${label}.`;
  const d = toNationalMobile(raw);
  if (!d) return `Enter a 10-digit ${label}.`;
  if (!/^[6-9]/.test(d)) return `Indian mobile numbers start with 6, 7, 8 or 9.`;
  if (/^(\d)\1{9}$/.test(d)) return `Please enter a real ${label}.`;
  return null;
}

export function emailError(v: unknown): string | null {
  const s = clean(v, 200);
  if (!s) return "Please fill in the email address.";
  if (s.length > 100 || !EMAIL_RE.test(s)) return "Enter a valid email, e.g. name@example.com.";
  return null;
}

export function ageOn(isoDate: string, today = new Date()): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const [y, m, d] = isoDate.split("-").map(Number);
  const dob = new Date(Date.UTC(y, m - 1, d));
  // Reject rollovers such as 2023-02-31.
  if (dob.getUTCFullYear() !== y || dob.getUTCMonth() !== m - 1 || dob.getUTCDate() !== d) return null;
  let age = today.getFullYear() - y;
  const md = today.getMonth() + 1 - m;
  if (md < 0 || (md === 0 && today.getDate() < d)) age--;
  return age;
}

export function dobError(v: unknown): string | null {
  const s = String(v ?? "");
  if (!s) return "Please fill in the date of birth.";
  const age = ageOn(s);
  if (age === null) return "Enter a valid date of birth.";
  if (age < 0) return "Date of birth cannot be in the future.";
  if (age < LIMITS.ageMin) return `Riders must be at least ${LIMITS.ageMin} years old.`;
  if (age > LIMITS.ageMax) return "Please check the year of birth.";
  return null;
}

export function intRangeError(v: unknown, lo: number, hi: number, label: string, unit: string): string | null {
  const s = String(v ?? "").trim();
  if (!s) return `Please fill in the ${label}.`;
  if (!/^\d{1,3}$/.test(s)) return `Use whole numbers only for the ${label}.`;
  const n = Number(s);
  if (n < lo || n > hi) return `${label[0].toUpperCase()}${label.slice(1)} must be between ${lo} and ${hi} ${unit}.`;
  return null;
}

export function textError(v: unknown, label: string, min: number, max: number): string | null {
  const s = clean(v, max + 50);
  if (!s) return `Please fill in the ${label}.`;
  if (s.length < min) return `The ${label} is too short.`;
  if (s.length > max) return `The ${label} is too long (max ${max} characters).`;
  if (!HAS_LETTER_RE.test(s)) return `Please enter a real ${label}.`;
  return null;
}

const sameName = (a: unknown, b: unknown) => clean(a).toLowerCase() === clean(b).toLowerCase();

export type RegistrationInput = {
  activity: string;
  level: string;
  fullName: string;
  address: string;
  mobileNumber: string;
  email: string;
  occupation: string;
  dateOfBirth: string;
  heightCm: string;
  weightKg: string;
  bloodGroup: string;
  emergencyContactPerson: string;
  emergencyContactNumber: string;
  familyPhysician: string;
  guardianName: string;
  medicalFitnessConfirmed: boolean;
  safetyRulesAcknowledged: boolean;
  indemnityAccepted: boolean;
  mediaConsentGranted: boolean;
  digitalSignatureName: string;
};

export type FieldErrors = Partial<Record<keyof RegistrationInput, string>>;

/** Which step of the registration wizard each field lives on. */
export const FIELD_STEP: Record<keyof RegistrationInput, 1 | 2 | 3> = {
  activity: 1,
  level: 1,
  fullName: 1,
  mobileNumber: 1,
  email: 1,
  address: 1,
  occupation: 1,
  dateOfBirth: 1,
  heightCm: 1,
  weightKg: 1,
  bloodGroup: 1,
  emergencyContactPerson: 2,
  emergencyContactNumber: 2,
  familyPhysician: 2,
  guardianName: 2,
  medicalFitnessConfirmed: 3,
  safetyRulesAcknowledged: 3,
  indemnityAccepted: 3,
  mediaConsentGranted: 3,
  digitalSignatureName: 3,
};

/**
 * Validates the whole registration. `phoneVerified` skips the Indian-format check
 * for a number that already matched the WhatsApp booking it belongs to.
 */
export function validateRegistration(d: Partial<RegistrationInput>, opts: { phoneVerified?: boolean } = {}): FieldErrors {
  const e: FieldErrors = {};
  const set = (k: keyof RegistrationInput, msg: string | null) => {
    if (msg) e[k] = msg;
  };

  if (!ACTIVITIES.includes(d.activity as any)) set("activity", "Please choose an activity.");
  if (!LEVELS.includes(d.level as any)) set("level", "Please choose your riding level.");
  set("fullName", nameError(d.fullName, "full name"));
  if (!opts.phoneVerified) set("mobileNumber", mobileError(d.mobileNumber));
  set("email", emailError(d.email));
  set("address", textError(d.address, "residential address", LIMITS.addressMin, LIMITS.addressMax));
  set("occupation", textError(d.occupation, "occupation", 2, 60));
  set("dateOfBirth", dobError(d.dateOfBirth));
  set("heightCm", intRangeError(d.heightCm, LIMITS.heightMin, LIMITS.heightMax, "height", "cm"));
  set("weightKg", intRangeError(d.weightKg, LIMITS.weightMin, LIMITS.weightMax, "weight", "kg"));
  if (!BLOOD_GROUPS.includes(d.bloodGroup as any)) set("bloodGroup", "Please select a blood group.");

  set("emergencyContactPerson", nameError(d.emergencyContactPerson, "emergency contact name"));
  set("emergencyContactNumber", mobileError(d.emergencyContactNumber, "emergency contact number"));
  if (!e.emergencyContactNumber) {
    const rider = toNationalMobile(d.mobileNumber) || String(d.mobileNumber ?? "").replace(/\D/g, "");
    if (rider && rider.endsWith(toNationalMobile(d.emergencyContactNumber)))
      set("emergencyContactNumber", "Use a different number from the rider's own.");
  }
  if (!e.emergencyContactPerson && sameName(d.emergencyContactPerson, d.fullName))
    set("emergencyContactPerson", "The emergency contact must be someone other than the rider.");
  set("familyPhysician", textError(d.familyPhysician, "family doctor's name (write “None” if you have none)", 2, 100));

  const age = ageOn(String(d.dateOfBirth ?? ""));
  const minor = age !== null && age < 18;
  if (minor) {
    set("guardianName", nameError(d.guardianName, "parent / guardian name"));
    if (!e.guardianName && sameName(d.guardianName, d.fullName))
      set("guardianName", "The guardian must be an adult other than the rider.");
  }

  if (d.medicalFitnessConfirmed !== true) set("medicalFitnessConfirmed", "Please confirm the medical fitness declaration.");
  if (d.safetyRulesAcknowledged !== true) set("safetyRulesAcknowledged", "Please accept the safety guidelines.");
  if (d.indemnityAccepted !== true) set("indemnityAccepted", "Please accept the indemnity & waiver.");

  const signer = minor ? d.guardianName : d.fullName;
  const sigErr = nameError(d.digitalSignatureName, "signature");
  if (sigErr) set("digitalSignatureName", sigErr);
  else if (!sameName(d.digitalSignatureName, signer))
    set(
      "digitalSignatureName",
      minor ? "The parent / guardian must sign: type their name exactly as entered." : "Type your full name exactly as entered above."
    );

  return e;
}
