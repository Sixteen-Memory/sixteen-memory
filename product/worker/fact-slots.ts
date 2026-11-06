/** Only reviewed semantic aliases. No fuzzy/substring matching of entity keys. */
export const SLOT_REVISION = "self-facts/1";
export const FACT_SLOTS = [
  { key: "user.home_city", description: "The user's usual residence city, not travel/current physical location.", aliases: ["user.current_residence_city", "user.residence_city"] },
  { key: "user.preferred_language", description: "The user's durable preferred communication language.", aliases: ["user.communication_language", "user.preferred_communication_language"] },
  { key: "user.commute_mode", description: "The user's usual primary commute mode.", aliases: ["user.commuting_mode", "user.primary_commute_mode"] },
  { key: "user.timezone", description: "The user's explicitly stated usual timezone, never inferred from a city.", aliases: ["user.time_zone"] },
] as const;
export function canonicalFactKey(key: string): string {
  const lower = key.toLowerCase();
  return FACT_SLOTS.find(slot => slot.key === lower || (slot.aliases as readonly string[]).includes(lower))?.key ?? lower;
}
export function registeredFactKey(key: string): boolean {
  return FACT_SLOTS.some(slot => slot.key === canonicalFactKey(key));
}
export function factKeyVariants(key: string): string[] {
  const canonical = canonicalFactKey(key);
  const slot = FACT_SLOTS.find(slot => slot.key === canonical);
  return slot ? [slot.key, ...slot.aliases] : [canonical];
}
export const slotPrompt = `Fact slot registry ${SLOT_REVISION}:
${FACT_SLOTS.map(s => `${s.key}: ${s.description}`).join("\n")}
Use these exact keys only for facts about the speaking user. Other people/entities MUST use a distinct entity-qualified key.
Do not use user.current_city for residence: current location and usual residence are different.
For facts outside this registry use a specific scoped key; they require review. Never squeeze a different concept into a registered slot.`;
