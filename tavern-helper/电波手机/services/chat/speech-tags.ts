/** Display only: preserve stored text and the original TTS request. */
export const SPEECH_TAG_PATTERN =
  /\((?:laughs|chuckle|snorts|breath|inhale|exhale|pant|gasps|sighs|sniffs|coughs|clear-throat|groans|humming|hissing|emm|sneezes|lip-smacking|burps)\)|(?:<|&lt;)#\d+(?:\.\d+)?#(?:>|&gt;)|(?:<|&lt;)break\s+time=["']\d+(?:\.\d+)?s["']\s*\/(?:>|&gt;)|\[(?:laughs|chuckles|sighs|gasps|whispering|excited|sad|pause|short pause|long pause)\]/g;
export function displaySpeechText(text: string, plainText?: string): string {
  // Accept a clean transcript only if it differs solely by inline performance tags.
  // This keeps arbitrary multilingual Fish directions out of the bubble without rewriting speech.
  if (plainText?.trim()) {
    const normalize = (value: string) => value.replace(/\s+/g, '');
    const untagged = text.replace(/\[[^\]\r\n[]+\]|\((?:happy|sad|angry|excited)\)/g, '');
    if (normalize(untagged) === normalize(plainText)) return plainText.trim();
  }
  return text.replace(SPEECH_TAG_PATTERN, '').trim();
}
