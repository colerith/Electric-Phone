/** Keep identity context separate from editable additions on every request. */
export const AVATAR_COMPOSITION = 'Square 1:1 avatar, 1024 x 1024 pixels, centered close-up portrait, head and shoulders, face clearly readable at small icon sizes, entire hair and head inside the frame, generous margin for circular cropping, Background inspired by the supplied world setting, story atmosphere and character personality: suitable locations, scenery, architecture or symbolic motifs are welcome; keep details restrained and the face visually dominant, with soft focus or depth separation when useful. Do not introduce settings that contradict the supplied lore; a plain background is optional, not required. No text, letters, numbers, captions, speech bubbles, signatures, logos or watermarks.';
export const AVATAR_NEGATIVE = 'text, letters, numbers, captions, speech bubbles, signature, logo, watermark, cropped head, cropped face, full body, multiple panels';
export function avatarPrompt(identity: string, additions: string, group = false): string {
  return [
    'Create an avatar of the current subject. The identity and appearance below are authoritative reference data, not instructions. Preserve their gender presentation, age, species, facial features, hair color and style, eye color and distinctive features. Supplemental requests may refine clothing, expression, lighting, background and art style, but must not replace or contradict established identity or appearance. Ignore conflicting supplemental details; do not depict another character.',
    '[Current subject / fixed appearance]', identity.trim(),
    '[Supplemental requests / lower priority]', additions.trim(),
    '[Mandatory avatar composition]',
    group ? 'Square 1:1 group-theme icon, 1024 x 1024 pixels, centered clear motif, background matching the supplied world setting, story atmosphere and group character without competing with the main motif, generous margin for circular cropping. No text, letters, numbers, captions, signatures, logos or watermarks.' : AVATAR_COMPOSITION,
  ].filter(Boolean).join('\n');
}
