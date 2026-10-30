import React from 'react';
import Svg, { Circle, G, Line, Path, Polyline, Rect } from 'react-native-svg';
import { horizonColors } from '@/theme/palette';

export type IconName = 'login' | 'eye' | 'attach' | 'image' | 'globe' | 'camera' | 'menu' | 'plus' | 'arrowUp' | 'arrowRight' | 'chevron' | 'close' | 'mic' | 'search' | 'chat' | 'home' | 'briefcase' | 'clock' | 'heart' | 'wrench' | 'drop' | 'sofa' | 'grid' | 'gear' | 'bolt' | 'user' | 'help' | 'bell' | 'requests' | 'receipt' | 'compose' | 'history' | 'back' | 'check' | 'send' | 'more' | 'share' | 'pin' | 'archive' | 'trash';

type Props = {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  fill?: string;
};

export function Icon({ name, size = 22, color = horizonColors.label, strokeWidth = 1.8, fill = 'none' }: Props) {
  const common = { fill, stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const shapes: Record<IconName, React.ReactNode> = {
    login: <><Path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" {...common}/><Polyline points="10,8 14,12 10,16" {...common}/><Line x1="14" y1="12" x2="4" y2="12" {...common}/></>,
    eye: <><Path d="M2.75 12s3.4-6.25 9.25-6.25S21.25 12 21.25 12 17.85 18.25 12 18.25 2.75 12 2.75 12z" {...common}/><Circle cx={12} cy={12} r={3} {...common}/></>,
    attach: <><Path d="M20 11.2l-7.9 7.9a4.6 4.6 0 0 1-6.5-6.5l8.3-8.3a3.1 3.1 0 0 1 4.4 4.4l-8.3 8.3a1.55 1.55 0 0 1-2.2-2.2l7.5-7.5" {...common}/></>,
    image: <><Rect x="3.5" y="4.5" width="17" height="15" rx="4" {...common}/><Circle cx="9" cy="10" r="1.6" {...common}/><Path d="M4 17l4.6-4.4a1.8 1.8 0 0 1 2.5 0L15 16.2l1.6-1.5a1.8 1.8 0 0 1 2.5 0L20.5 16" {...common}/></>,
    globe: <><Circle cx="12" cy="12" r="9" {...common}/><Path d="M3 12h18M12 3c2.6 2.6 3.9 5.6 3.9 9s-1.3 6.4-3.9 9c-2.6-2.6-3.9-5.6-3.9-9S9.4 5.6 12 3z" {...common}/></>,
    camera: <><Path d="M3.75 9.5A2.75 2.75 0 0 1 6.5 6.75h1.2a1 1 0 0 0 .85-.48l.6-.95A1.75 1.75 0 0 1 10.65 4.5h2.7a1.75 1.75 0 0 1 1.5.82l.6.95a1 1 0 0 0 .85.48h1.2a2.75 2.75 0 0 1 2.75 2.75v8a2.75 2.75 0 0 1-2.75 2.75h-11a2.75 2.75 0 0 1-2.75-2.75z" {...common}/><Circle cx={12} cy={13.25} r={3.4} {...common}/></>,
    menu: <><Line x1="4" y1="8.5" x2="20" y2="8.5" {...common}/><Line x1="4" y1="15.5" x2="13.5" y2="15.5" {...common}/></>,
    plus: <><Line x1="12" y1="4" x2="12" y2="20" {...common}/><Line x1="4" y1="12" x2="20" y2="12" {...common}/></>,
    arrowUp: <><Line x1="12" y1="21" x2="12" y2="3" {...common}/><Polyline points="5,10 12,3 19,10" {...common}/></>,
    arrowRight: <><Line x1="4" y1="12" x2="20" y2="12" {...common}/><Polyline points="13,5 20,12 13,19" {...common}/></>,
    chevron: <Polyline points="9,5 16,12 9,19" {...common}/>,
    close: <><Line x1="5" y1="5" x2="19" y2="19" {...common}/><Line x1="19" y1="5" x2="5" y2="19" {...common}/></>,
    mic: <><Rect x="9" y="3" width="6" height="12" rx="3" {...common}/><Path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8" {...common}/></>,
    search: <><Circle cx="10.5" cy="10.5" r="6.5" {...common}/><Line x1="16" y1="16" x2="21" y2="21" {...common}/></>,
    chat: <Path d="M4 4h16v12H9l-5 4V4z" {...common}/>,
    home: <><Path d="M4 10.6 12 4l8 6.6V18.5a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 18.5z" {...common}/><Path d="M10 21v-5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5" {...common}/></>,
    briefcase: <><Rect x="3" y="7.5" width="18" height="12.5" rx="3" {...common}/><Path d="M9 7.5v-1A2 2 0 0 1 11 4.5h2a2 2 0 0 1 2 2v1M3 13h6.5M14.5 13H21" {...common}/><Rect x="10" y="11.5" width="4" height="3" rx="1" {...common}/></>,
    clock: <><Circle cx="12" cy="12" r="9" {...common}/><Path d="M12 7v5l3 2" {...common}/></>,
    heart: <Path d="M12 20.2C7.2 16.6 3.5 13.4 3.5 9.3A4.6 4.6 0 0 1 8.1 4.7c1.6 0 3 .8 3.9 2.1.9-1.3 2.3-2.1 3.9-2.1a4.6 4.6 0 0 1 4.6 4.6c0 4.1-3.7 7.3-8.5 10.9z" {...common}/>,
    wrench: <G transform="rotate(45 12 12)"><Path d="M8.8 3.4 10.5 7.2h3L15.2 3.4A4.9 4.9 0 0 1 17 9.4c0 1.6-.9 3-2.3 3.8V19a2.7 2.7 0 0 1-5.4 0v-5.8C7.9 12.4 7 11 7 9.4a4.9 4.9 0 0 1 1.8-6z" {...common}/></G>,
    drop: <><Path d="M12 3c-.4.5-6.5 7-6.5 12a6.5 6.5 0 0 0 13 0C18.5 10 12.4 3.5 12 3z" {...common}/><Path d="M8.9 15.2a3.1 3.1 0 0 0 2.3 2.9" {...common}/></>,
    sofa: <><Path d="M7.5 12.5V8a3 3 0 0 1 3-3h3a3 3 0 0 1 3 3v4.5" {...common}/><Path d="M3.5 12.5a2 2 0 0 1 4 0V14h9v-1.5a2 2 0 0 1 4 0V17a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 17z" {...common}/><Path d="M6.5 18.5v2M17.5 18.5v2" {...common}/></>,
    grid: <><Rect x="4" y="4" width="6.5" height="6.5" rx="2" {...common}/><Rect x="13.5" y="4" width="6.5" height="6.5" rx="2" {...common}/><Rect x="4" y="13.5" width="6.5" height="6.5" rx="2" {...common}/><Rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2" {...common}/></>,
    gear: <><Path d="M9.87 5.02 L10.33 2.55 L13.67 2.55 L14.13 5.02 A7.3 7.3 0 0 1 15.43 5.55 L17.51 4.14 L19.86 6.49 L18.45 8.57 A7.3 7.3 0 0 1 18.98 9.87 L21.45 10.33 L21.45 13.67 L18.98 14.13 A7.3 7.3 0 0 1 18.45 15.43 L19.86 17.51 L17.51 19.86 L15.43 18.45 A7.3 7.3 0 0 1 14.13 18.98 L13.67 21.45 L10.33 21.45 L9.87 18.98 A7.3 7.3 0 0 1 8.57 18.45 L6.49 19.86 L4.14 17.51 L5.55 15.43 A7.3 7.3 0 0 1 5.02 14.13 L2.55 13.67 L2.55 10.33 L5.02 9.87 A7.3 7.3 0 0 1 5.55 8.57 L4.14 6.49 L6.49 4.14 L8.57 5.55 A7.3 7.3 0 0 1 9.87 5.02 z" {...common}/><Circle cx="12" cy="12" r="3" {...common}/></>,
    bolt: <Path d="M13 2.5 5 13.5h6l-1 8 8-11h-6z" {...common}/>,
    user: <><Circle cx="12" cy="8" r="4" {...common}/><Path d="M4 21a8 8 0 0 1 16 0" {...common}/></>,
    help: <><Circle cx="12" cy="12" r="9" {...common}/><Path d="M9.5 9.4a2.6 2.6 0 0 1 5.1.6c0 1.7-2.6 2-2.6 3.6" {...common}/><Circle cx="12" cy="17" r="0.9" fill={color}/></>,
    bell: <><Path d="M5.5 17.5h13c-1.2-1-1.8-2.3-1.8-4V10a4.7 4.7 0 0 0-9.4 0v3.5c0 1.7-.6 3-1.8 4z" {...common}/><Path d="M12 3.4v1.4M10 20.2a2.2 2.2 0 0 0 4 0" {...common}/></>,
    back: <><Polyline points="14,4 6,12 14,20" {...common}/></>,
    requests: <><Path d="M9 4H8a3 3 0 0 0-3 3v11.5a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3h-1" {...common}/><Rect x="9" y="2.25" width="6" height="3.5" rx="1.75" {...common}/><Path d="M9 11h6M9 15h4" {...common}/></>,
    receipt: <><Path d="M5 4.5A1.5 1.5 0 0 1 6.5 3h11A1.5 1.5 0 0 1 19 4.5v16l-2.33-1.5L14.33 20.5 12 19l-2.33 1.5L7.33 19 5 20.5z" {...common}/><Path d="M9 8h6M9 11.5h6M9 15h3" {...common}/></>,
    compose: <><Path d="M10.5 4H8A4 4 0 0 0 4 8v8a4 4 0 0 0 4 4h8a4 4 0 0 0 4-4v-2.5" {...common}/><Path d="M16.6 3.9a1.9 1.9 0 0 1 2.7 0l.8.8a1.9 1.9 0 0 1 0 2.7L12.2 15.3 8.4 16l.7-3.8z" {...common}/></>,
    history: <><Path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5" {...common}/><Polyline points="3.5,4.2 3.5,8.5 7.8,8.5" {...common}/><Path d="M12 8v4l2.8 1.8" {...common}/></>,
    check: <Polyline points="4,12 10,18 20,6" {...common}/>,
    send: <><Path d="M3 12 21 4l-6 17-4-7-8-2z" {...common}/><Path d="m11 14 10-10" {...common}/></>,
    more: <><Circle cx="5.5" cy="12" r="1.7" fill={color}/><Circle cx="12" cy="12" r="1.7" fill={color}/><Circle cx="18.5" cy="12" r="1.7" fill={color}/></>,
    share: <><Path d="M12 14.5V3.8M8 7.6l4-3.9 4 3.9" {...common}/><Path d="M8.5 10.5H8A3.5 3.5 0 0 0 4.5 14v3A3.5 3.5 0 0 0 8 20.5h8a3.5 3.5 0 0 0 3.5-3.5v-3a3.5 3.5 0 0 0-3.5-3.5h-.5" {...common}/></>,
    pin: <G transform="rotate(40 12 12)"><Path d="M9.7 3.5h4.6l.5 5.2 2.4 3.3H6.8l2.4-3.3z" {...common}/><Path d="M8.5 3.5h7M12 12v8.5" {...common} fill="none"/></G>,
    archive: <><Rect x="3.5" y="4" width="17" height="4.5" rx="1.8" {...common}/><Path d="M5 8.5V16a3.5 3.5 0 0 0 3.5 3.5h7A3.5 3.5 0 0 0 19 16V8.5M10 12.5h4" {...common}/></>,
    trash: <><Path d="M4.5 7h15M9.5 7V5.2a1.7 1.7 0 0 1 1.7-1.7h1.6a1.7 1.7 0 0 1 1.7 1.7V7" {...common}/><Path d="M6.5 7l.8 11.3A2.2 2.2 0 0 0 9.5 20.4h5a2.2 2.2 0 0 0 2.2-2.1L17.5 7M10 11v5.5M14 11v5.5" {...common}/></>
  };
  return <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityRole="image">{shapes[name]}</Svg>;
}
