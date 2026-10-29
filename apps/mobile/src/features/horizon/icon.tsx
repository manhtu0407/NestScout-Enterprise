import React from 'react';
import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';

export type IconName = 'menu' | 'plus' | 'arrowUp' | 'arrowRight' | 'chevron' | 'close' | 'mic' | 'search' | 'chat' | 'home' | 'briefcase' | 'clock' | 'heart' | 'wrench' | 'drop' | 'sofa' | 'grid' | 'gear' | 'bolt' | 'user' | 'help' | 'bell' | 'back' | 'check' | 'send';

type Props = {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
};

export function Icon({ name, size = 22, color = '#F5F7FA', strokeWidth = 1.8 }: Props) {
  const common = { fill: 'none', stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const shapes: Record<IconName, React.ReactNode> = {
    menu: <><Line x1="4" y1="7" x2="20" y2="7" {...common}/><Line x1="4" y1="12" x2="20" y2="12" {...common}/><Line x1="4" y1="17" x2="20" y2="17" {...common}/></>,
    plus: <><Line x1="12" y1="4" x2="12" y2="20" {...common}/><Line x1="4" y1="12" x2="20" y2="12" {...common}/></>,
    arrowUp: <><Line x1="12" y1="21" x2="12" y2="3" {...common}/><Polyline points="5,10 12,3 19,10" {...common}/></>,
    arrowRight: <><Line x1="4" y1="12" x2="20" y2="12" {...common}/><Polyline points="13,5 20,12 13,19" {...common}/></>,
    chevron: <Polyline points="9,5 16,12 9,19" {...common}/>,
    close: <><Line x1="5" y1="5" x2="19" y2="19" {...common}/><Line x1="19" y1="5" x2="5" y2="19" {...common}/></>,
    mic: <><Rect x="9" y="3" width="6" height="12" rx="3" {...common}/><Path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8" {...common}/></>,
    search: <><Circle cx="10.5" cy="10.5" r="6.5" {...common}/><Line x1="16" y1="16" x2="21" y2="21" {...common}/></>,
    chat: <Path d="M4 4h16v12H9l-5 4V4z" {...common}/>,
    home: <><Path d="M3 11.5 12 4l9 7.5V21H3v-9.5" {...common}/><Path d="M9 21v-7h6v7" {...common}/></>,
    briefcase: <><Rect x="3" y="7" width="18" height="14" rx="2" {...common}/><Path d="M9 7V4h6v3M3 12h18M11 12v2h2v-2" {...common}/></>,
    clock: <><Circle cx="12" cy="12" r="9" {...common}/><Polyline points="12,6 12,12 16,14" {...common}/></>,
    heart: <Path d="M20.8 8.8c0 4-8.8 10.7-8.8 10.7S3.2 12.8 3.2 8.8A5 5 0 0 1 12 6.3a5 5 0 0 1 8.8 2.5z" {...common}/>,
    wrench: <><Path d="M21 7a6 6 0 0 1-8 5.6L7.6 18a2.4 2.4 0 0 1-3.4-3.4L9.6 9A6 6 0 0 1 17 3l-4 4 4 4 4-4z" {...common}/></>,
    drop: <Path d="M12 2S5 11.2 5 15a7 7 0 0 0 14 0C19 11.2 12 2 12 2z" {...common}/>,
    sofa: <><Path d="M4 12V9a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v3" {...common}/><Rect x="3" y="11" width="18" height="8" rx="2" {...common}/><Path d="M6 19v2m12-2v2" {...common}/></>,
    grid: <><Rect x="3" y="3" width="7" height="7" rx="1" {...common}/><Rect x="14" y="3" width="7" height="7" rx="1" {...common}/><Rect x="3" y="14" width="7" height="7" rx="1" {...common}/><Rect x="14" y="14" width="7" height="7" rx="1" {...common}/></>,
    gear: <><Circle cx="12" cy="12" r="3" {...common}/><Path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2.2 2.2m9.6 9.6L19 19M19 5l-2.2 2.2m-9.6 9.6L5 19" {...common}/></>,
    bolt: <Path d="M13 2 5 13h6l-1 9 9-13h-6l0-7z" {...common}/>,
    user: <><Circle cx="12" cy="8" r="4" {...common}/><Path d="M4 21a8 8 0 0 1 16 0" {...common}/></>,
    help: <><Circle cx="12" cy="12" r="9" {...common}/><Path d="M9.3 9a3 3 0 0 1 5.4 2c0 2-2.7 2.2-2.7 4" {...common}/><Circle cx="12" cy="18" r=".5" fill={color}/></>,
    bell: <><Path d="M6 16V9a6 6 0 0 1 12 0v7l2 2H4z" {...common}/><Path d="M10 21h4" {...common}/></>,
    back: <><Polyline points="14,4 6,12 14,20" {...common}/></>,
    check: <Polyline points="4,12 10,18 20,6" {...common}/>,
    send: <><Path d="M3 12 21 4l-6 17-4-7-8-2z" {...common}/><Path d="m11 14 10-10" {...common}/></>
  };
  return <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityRole="image">{shapes[name]}</Svg>;
}
