/** Pump makers offered before any have been typed: the ones on the selection charts and in past logs. */
export const PUMP_MAKES = ['KSB', 'CRI', 'Kirloskar', 'Bahubali', 'Pluga', 'Varuna', 'Lubi', 'Crompton', 'CG'];

/**
 * Splits "KSB 12C/17" or "12C/17 ksb" into the maker ("KSB") and the model ("12C/17"). The maker is
 * only recognised from `makes`; anything else stays in the model.
 */
export function splitPump(text: string, makes: string[] = PUMP_MAKES): { make: string; model: string } {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const at = words.findIndex(w => makes.some(m => m.toLowerCase() === w.toLowerCase()));
  if (at < 0) return { make: '', model: words.join(' ') };
  const make = makes.find(m => m.toLowerCase() === words[at].toLowerCase())!;
  return { make, model: words.filter((_, i) => i !== at).join(' ') };
}
