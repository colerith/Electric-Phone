/** Display only: preserve stored text and the original TTS request. */
export const SPEECH_TAG_PATTERN =
  /\((?:laughs|chuckle|snorts|breath|inhale|exhale|pant|gasps|sighs|sniffs|coughs|clear-throat|groans|humming|hissing|emm|sneezes|lip-smacking|burps)\)|(?:<|&lt;)#\d+(?:\.\d+)?#(?:>|&gt;)|(?:<|&lt;)break\s+time=["']\d+(?:\.\d+)?s["']\s*\/(?:>|&gt;)|\[(?:laughs|chuckles|sighs|gasps|whispering|excited|sad|pause|short pause|long pause)\]/g;
export function displaySpeechText(text: string): string {
  return text.replace(SPEECH_TAG_PATTERN, '').trim();
}
