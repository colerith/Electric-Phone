export const PHONE_QUICK_REPLY_BUTTON = '📱 电波手机';
/** Only update our entry; retain other buttons added to this script by the user. */
export function syncPhoneQuickReply(visible: boolean): void {
  const buttons = getScriptButtons();
  const own = buttons.find(button => button.name === PHONE_QUICK_REPLY_BUTTON);
  if (own?.visible === visible) return;
  replaceScriptButtons(
    own
      ? buttons.map(button => (button.name === PHONE_QUICK_REPLY_BUTTON ? { ...button, visible } : button))
      : [...buttons, { name: PHONE_QUICK_REPLY_BUTTON, visible }],
  );
}
