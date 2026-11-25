/**
 * Rekord walki spod 0x51094c (D, asm: konstruktor AI 0x426a29, opcode skryptowy `attack` 0x456c00..0x456dbd,
 * odbior w 0x422340 (+8), 0x4243a8 krok 12 (+0xc), 0x422fdb (+0x10, +0x14, +0x18)). UI przekazuje null.
 * W vanilla +8 i +0x10 zawsze 0 (nikt ich nie ustawia); +0xc, +0x14, +0x18 ustawia tylko skrypt.
 */
export interface AttackRecord {
  /** +0x8: dodawane do AP atakujacego przy starcie tury walki (0x422340). */
  apBonus: number;
  /** +0xc: dodawane do szansy trafienia (krok 12, przed przycieciem do 95). */
  toHitBonus: number;
  /** +0x10: dodawane do sumy obrazen (0x422fdb). */
  damageBonus: number;
  /** +0x14: dolne ograniczenie sumy obrazen. */
  minDamage: number;
  /** +0x18: gorne ograniczenie sumy obrazen (domyslnie INT_MAX); stosowane po dolnym. */
  maxDamage: number;
}

export const ATTACK_RECORD_DEFAULT: Readonly<AttackRecord> = {
  apBonus: 0,
  toHitBonus: 0,
  damageBonus: 0,
  minDamage: 0,
  maxDamage: 0x7fffffff,
};

/** 0x422fdb: suma obrazen po rekordzie: += +0x10; < +0x14 -> +0x14; > +0x18 -> +0x18. null = bez zmian. */
export function applyRecordDamage(total: number, rec: Readonly<AttackRecord> | null): number {
  if (!rec) return total;
  let d = total + rec.damageBonus;
  if (d < rec.minDamage) d = rec.minDamage;
  if (d > rec.maxDamage) d = rec.maxDamage;
  return d;
}
