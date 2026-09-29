import type { Identity } from '../../schemas';

/** All avatar views use the same square image box, then apply this saved crop. */
export function avatarCropStyle(zoom = 1, offsetX = 0, offsetY = 0): Record<string, string> {
  const maximum = Math.max(0, (zoom - 1) * 50);
  const clamp = (value: number) => Math.max(-maximum, Math.min(maximum, value * 0.32));
  return {
    width: '100%',
    height: '100%',
    minWidth: '0',
    minHeight: '0',
    maxWidth: 'none',
    maxHeight: 'none',
    objectFit: 'cover',
    objectPosition: 'center',
    transform: `translate3d(${clamp(offsetX)}%, ${clamp(offsetY)}%, 0) scale(${zoom})`,
    transformOrigin: 'center',
  };
}

export function identityAvatarStyle(identity: Identity | null | undefined): Record<string, string> {
  return avatarCropStyle(identity?.avatarZoom, identity?.avatarOffsetX, identity?.avatarOffsetY);
}
