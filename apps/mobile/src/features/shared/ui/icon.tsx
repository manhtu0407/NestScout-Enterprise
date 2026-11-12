import type { LucideIcon } from 'lucide-react-native';
import { Archive, ArrowRight, ArrowUp, Bell, Briefcase, Calendar, Camera, Check, ChevronLeft, ChevronRight, CircleQuestionMark, Clock, ClipboardList, Droplet, Ellipsis, Eye, Globe, History, Heart, House, Image, LayoutGrid, LogIn, Mic, MessageSquare, Paperclip, PaintRoller, Phone, Pin, Plus, Receipt, Search, Send, Settings, Share, Sofa, SquarePen, Star, TextAlignStart, Trash, User, Wallet, Wrench, X, Zap } from 'lucide-react-native';
import { horizonColors } from '@/theme/palette';

export type IconName = 'login' | 'eye' | 'attach' | 'image' | 'globe' | 'camera' | 'menu' | 'plus' | 'arrowUp' | 'arrowRight' | 'chevron' | 'close' | 'mic' | 'search' | 'chat' | 'home' | 'briefcase' | 'clock' | 'heart' | 'wrench' | 'drop' | 'sofa' | 'paint' | 'grid' | 'gear' | 'bolt' | 'user' | 'help' | 'bell' | 'requests' | 'receipt' | 'compose' | 'history' | 'back' | 'check' | 'send' | 'more' | 'share' | 'pin' | 'archive' | 'trash' | 'wallet' | 'star' | 'calendar' | 'phone';

type Props = {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  fill?: string;
};

const glyphs: Record<IconName, LucideIcon> = {
  login: LogIn,
  eye: Eye,
  attach: Paperclip,
  image: Image,
  globe: Globe,
  camera: Camera,
  menu: TextAlignStart,
  plus: Plus,
  arrowUp: ArrowUp,
  arrowRight: ArrowRight,
  chevron: ChevronRight,
  close: X,
  mic: Mic,
  search: Search,
  chat: MessageSquare,
  home: House,
  briefcase: Briefcase,
  clock: Clock,
  heart: Heart,
  wrench: Wrench,
  drop: Droplet,
  sofa: Sofa,
  paint: PaintRoller,
  grid: LayoutGrid,
  gear: Settings,
  bolt: Zap,
  user: User,
  help: CircleQuestionMark,
  bell: Bell,
  requests: ClipboardList,
  receipt: Receipt,
  compose: SquarePen,
  history: History,
  back: ChevronLeft,
  check: Check,
  send: Send,
  more: Ellipsis,
  share: Share,
  pin: Pin,
  archive: Archive,
  trash: Trash,
  wallet: Wallet,
  star: Star,
  calendar: Calendar,
  phone: Phone,
};

export function Icon({ name, size = 22, color = horizonColors.label, strokeWidth = 2, fill = 'none' }: Props) {
  const Glyph = glyphs[name];
  return <Glyph size={size} color={color} strokeWidth={strokeWidth} fill={fill} accessibilityRole="image"/>;
}
