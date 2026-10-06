/** Repair only unambiguous JSON presentation mistakes, never invent missing fields. */
export function parseJsonResponse(source: string): unknown {
  try {
    return JSON.parse(source);
  } catch (original) {
    let result = '',
      inString = false,
      escaped = false;
    for (let i = 0; i < source.length; i++) {
      const char = source[i];
      if (inString) {
        if (escaped) {
          result += char;
          escaped = false;
          continue;
        }
        if (char === '\\') {
          result += char;
          escaped = true;
          continue;
        }
        if (char === '"') inString = false;
        if (char.charCodeAt(0) < 32) {
          result += JSON.stringify(char).slice(1, -1);
          continue;
        }
      } else {
        if (char === '"') inString = true;
        if (char === ',' && /^[\s]*[}\]]/.test(source.slice(i + 1))) continue;
        // A single stray CJK character between completed containers cannot be
        // a JSON key/value. Never touch prose inside strings or fill truncation.
        if (/\p{Script=Han}/u.test(char) && /[}\]]\s*$/.test(result) && /^\s*[}\]]/.test(source.slice(i + 1))) continue;
      }
      result += char;
    }
    // Do not complete truncated strings/objects or guess which quotes belong to prose.
    if (inString || result === source) throw original;
    try {
      return JSON.parse(result);
    } catch {
      throw original;
    }
  }
}
