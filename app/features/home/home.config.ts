import {
  faBookOpen,
  faBrain,
  faCommentDots,
  faGear,
  faHeart,
  faPalette,
  faSliders,
  faUser,
  type IconDefinition,
} from '@fortawesome/free-solid-svg-icons';

export type HomeTimeMode = 'device' | 'background';
export type HomeEntry = {
  id: string;
  label: string;
  href: string;
  icon: IconDefinition;
  tone: 'pink' | 'blue' | 'lilac' | 'aqua' | 'slate';
};

export const HOME_TIME: { mode: HomeTimeMode; backgroundTime: string } = {
  mode: 'device',
  backgroundTime: '18:31',
};

export const PRIMARY_ENTRIES: HomeEntry[] = [
  { id: 'chat', label: '聊天', href: '/chat', icon: faCommentDots, tone: 'pink' },
  { id: 'world', label: '世界书', href: '/world', icon: faBookOpen, tone: 'aqua' },
  { id: 'char', label: '角色', href: '/char', icon: faHeart, tone: 'lilac' },
  { id: 'me', label: '我的', href: '/me', icon: faUser, tone: 'blue' },
];

export const DOCK_ENTRIES: HomeEntry[] = [
  { id: 'setting', label: '设置', href: '/setting', icon: faGear, tone: 'slate' },
  { id: 'theme', label: '主题', href: '/theme', icon: faPalette, tone: 'pink' },
  { id: 'preset', label: '预设', href: '/preset', icon: faSliders, tone: 'blue' },
  { id: 'memory', label: '记忆', href: '/memory', icon: faBrain, tone: 'lilac' },
];
