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

/** A separate menu entry, independent of quick-reply visibility. */
export function syncPhoneMenu(visible: boolean, open: () => void): void {
  const doc = window.parent.document;
  let entry = doc.getElementById('wave-phone-extension-menu');
  if (!visible) {
    entry?.remove();
    return;
  }
  if (entry) return;
  const menu = doc.getElementById('extensionsMenu');
  if (!menu) return;
  entry = doc.createElement('div');
  entry.id = 'wave-phone-extension-menu';
  entry.className = 'list-group-item flex-container flexGap5';
  entry.tabIndex = 0;
  entry.setAttribute('role', 'button');
  const icon = doc.createElement('i');
  icon.className = 'fa-solid fa-mobile-screen-button extensionsMenuExtensionButton';
  const label = doc.createElement('span');
  label.textContent = '电波手机';
  entry.append(icon, label);
  entry.onclick = open;
  entry.onkeydown = event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      open();
    }
  };
  menu.append(entry);
}
