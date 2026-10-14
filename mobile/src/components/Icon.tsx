import { MaterialCommunityIcons } from '@expo/vector-icons';
import type React from 'react';
import type { ComponentType } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Apple from 'lucide-react-native/icons/apple';
import Archive from 'lucide-react-native/icons/archive';
import Bell from 'lucide-react-native/icons/bell';
import BellDot from 'lucide-react-native/icons/bell-dot';
import BellOff from 'lucide-react-native/icons/bell-off';
import BellRing from 'lucide-react-native/icons/bell-ring';
import CalendarClock from 'lucide-react-native/icons/calendar-clock';
import CalendarDays from 'lucide-react-native/icons/calendar-days';
import CalendarSearch from 'lucide-react-native/icons/calendar-search';
import Camera from 'lucide-react-native/icons/camera';
import CameraOff from 'lucide-react-native/icons/camera-off';
import ChartColumnBig from 'lucide-react-native/icons/chart-column-big';
import Check from 'lucide-react-native/icons/check';
import CheckCheck from 'lucide-react-native/icons/check-check';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import ChevronUp from 'lucide-react-native/icons/chevron-up';
import ChevronsLeft from 'lucide-react-native/icons/chevrons-left';
import ChevronsRight from 'lucide-react-native/icons/chevrons-right';
import Circle from 'lucide-react-native/icons/circle';
import CircleAlert from 'lucide-react-native/icons/circle-alert';
import CircleCheck from 'lucide-react-native/icons/circle-check';
import CircleCheckBig from 'lucide-react-native/icons/circle-check-big';
import CirclePlus from 'lucide-react-native/icons/circle-plus';
import CircleUserRound from 'lucide-react-native/icons/circle-user-round';
import CircleX from 'lucide-react-native/icons/circle-x';
import ClipboardPen from 'lucide-react-native/icons/clipboard-pen';
import Clock from 'lucide-react-native/icons/clock';
import ClockAlert from 'lucide-react-native/icons/clock-alert';
import CloudOff from 'lucide-react-native/icons/cloud-off';
import Cookie from 'lucide-react-native/icons/cookie';
import CopyPlus from 'lucide-react-native/icons/copy-plus';
import Croissant from 'lucide-react-native/icons/croissant';
import Crop from 'lucide-react-native/icons/crop';
import CupSoda from 'lucide-react-native/icons/cup-soda';
import Droplet from 'lucide-react-native/icons/droplet';
import FileX from 'lucide-react-native/icons/file-x';
import Fish from 'lucide-react-native/icons/fish';
import FlaskConical from 'lucide-react-native/icons/flask-conical';
import House from 'lucide-react-native/icons/house';
import HousePlus from 'lucide-react-native/icons/house-plus';
import Image from 'lucide-react-native/icons/image';
import Info from 'lucide-react-native/icons/info';
import Keyboard from 'lucide-react-native/icons/keyboard';
import LayoutGrid from 'lucide-react-native/icons/layout-grid';
import Leaf from 'lucide-react-native/icons/leaf';
import List from 'lucide-react-native/icons/list';
import LogOut from 'lucide-react-native/icons/log-out';
import Milk from 'lucide-react-native/icons/milk';
import Minus from 'lucide-react-native/icons/minus';
import OctagonAlert from 'lucide-react-native/icons/octagon-alert';
import Package from 'lucide-react-native/icons/package';
import Pencil from 'lucide-react-native/icons/pencil';
import Pill from 'lucide-react-native/icons/pill';
import Plus from 'lucide-react-native/icons/plus';
import RefreshCw from 'lucide-react-native/icons/refresh-cw';
import Refrigerator from 'lucide-react-native/icons/refrigerator';
import Save from 'lucide-react-native/icons/save';
import ScanBarcode from 'lucide-react-native/icons/scan-barcode';
import ScanText from 'lucide-react-native/icons/scan-text';
import Search from 'lucide-react-native/icons/search';
import Settings from 'lucide-react-native/icons/settings';
import Share2 from 'lucide-react-native/icons/share-2';
import ShieldCheck from 'lucide-react-native/icons/shield-check';
import ShoppingBasket from 'lucide-react-native/icons/shopping-basket';
import ShoppingCart from 'lucide-react-native/icons/shopping-cart';
import Snowflake from 'lucide-react-native/icons/snowflake';
import Soup from 'lucide-react-native/icons/soup';
import SprayCan from 'lucide-react-native/icons/spray-can';
import TextSearch from 'lucide-react-native/icons/text-search';
import Trash from 'lucide-react-native/icons/trash';
import TriangleAlert from 'lucide-react-native/icons/triangle-alert';
import UserRoundPlus from 'lucide-react-native/icons/user-round-plus';
import UserRoundX from 'lucide-react-native/icons/user-round-x';
import UsersRound from 'lucide-react-native/icons/users-round';
import Utensils from 'lucide-react-native/icons/utensils';
import Wheat from 'lucide-react-native/icons/wheat';
import X from 'lucide-react-native/icons/x';
import ZapOff from 'lucide-react-native/icons/zap-off';

import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import ArrowRight from 'lucide-react-native/icons/arrow-right';
import Eye from 'lucide-react-native/icons/eye';
import EyeOff from 'lucide-react-native/icons/eye-off';
import KeyRound from 'lucide-react-native/icons/key-round';
import Lock from 'lucide-react-native/icons/lock';
import Mail from 'lucide-react-native/icons/mail';
import MessageSquareText from 'lucide-react-native/icons/message-square-text';
import Smartphone from 'lucide-react-native/icons/smartphone';
import UserRound from 'lucide-react-native/icons/user-round';

/**
 * App icon set: Lucide line icons (SVG, ISC licence) with one stroke weight everywhere.
 * Icons are imported one by one so only these end up in the bundle. Older icon names
 * keep working: they map to the matching Lucide icon, and anything unmapped falls back
 * to the previous icon font so nothing ever renders blank.
 */
type LucideProps = { size?: number; color?: string; strokeWidth?: number; style?: StyleProp<ViewStyle> };

const ICONS = {
  'lock-outline': Lock,
  'eye-outline': Eye,
  'eye-off-outline': EyeOff,
  'cellphone': Smartphone,
  'message-text-outline': MessageSquareText,
  'key-outline': KeyRound,
  'account-outline': UserRound,
  'email-outline': Mail,
  'arrow-left': ArrowLeft,
  'arrow-right': ArrowRight,
  'shield-check-outline': ShieldCheck,
  'account-circle-outline': CircleUserRound,
  'account-group-outline': UsersRound,
  'account-multiple-plus-outline': UserRoundPlus,
  'account-remove-outline': UserRoundX,
  'alert-circle-outline': CircleAlert,
  'alert-octagon-outline': OctagonAlert,
  'alert-outline': TriangleAlert,
  'archive-outline': Archive,
  'baguette': Croissant,
  'barcode-scan': ScanBarcode,
  'basket-outline': ShoppingBasket,
  'bell-cog-outline': BellDot,
  'bell-off-outline': BellOff,
  'bell-outline': Bell,
  'bell-ring-outline': BellRing,
  'bottle-soda-outline': CupSoda,
  'bottle-tonic-outline': FlaskConical,
  'calendar-alert': CalendarClock,
  'calendar-month': CalendarDays,
  'calendar-month-outline': CalendarDays,
  'calendar-question': CalendarSearch,
  'camera': Camera,
  'camera-off-outline': CameraOff,
  'camera-retake-outline': Camera,
  'cart-outline': ShoppingCart,
  'chart-box-outline': ChartColumnBig,
  'check': Check,
  'check-all': CheckCheck,
  'check-circle': CircleCheckBig,
  'check-circle-outline': CircleCheck,
  'checkbox-blank-circle-outline': Circle,
  'checkbox-marked-circle': CircleCheckBig,
  'chevron-double-left': ChevronsLeft,
  'chevron-double-right': ChevronsRight,
  'chevron-down': ChevronDown,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  'chevron-up': ChevronUp,
  'circle-outline': Circle,
  'clipboard-edit-outline': ClipboardPen,
  'clock-alert-outline': ClockAlert,
  'close': X,
  'close-circle-outline': CircleX,
  'cloud-off-outline': CloudOff,
  'cog-outline': Settings,
  'content-save-outline': Save,
  'cookie-outline': Cookie,
  'crop': Crop,
  'cup-water': Milk,
  'delete-outline': Trash,
  'dots-grid': LayoutGrid,
  'fish': Fish,
  'flash-off': ZapOff,
  'food-apple-outline': Apple,
  'format-list-bulleted': List,
  'fridge-outline': Refrigerator,
  'grain': Wheat,
  'home-outline': House,
  'home-plus-outline': HousePlus,
  'home-variant': House,
  'home-variant-outline': House,
  'image-outline': Image,
  'information-outline': Info,
  'keyboard-outline': Keyboard,
  'leaf': Leaf,
  'line-scan': ScanText,
  'logout': LogOut,
  'lotion-outline': Droplet,
  'magnify': Search,
  'minus': Minus,
  'package-variant': Package,
  'package-variant-closed': Package,
  'pencil-outline': Pencil,
  'pill': Pill,
  'plus': Plus,
  'plus-box-multiple-outline': CopyPlus,
  'plus-circle-outline': CirclePlus,
  'product-search': TextSearch,
  'progress-clock': Clock,
  'refresh': RefreshCw,
  'shaker-outline': Soup,
  'share-variant': Share2,
  'shield-lock-outline': ShieldCheck,
  'silverware-fork-knife': Utensils,
  'snowflake': Snowflake,
  'spray-bottle': SprayCan,
  'sync-alert': RefreshCw,
  'text-box-remove-outline': FileX,
  'text-recognition': ScanText,
  'trash-can-outline': Trash,
} satisfies Record<string, ComponentType<LucideProps>>;

export type IconName = keyof typeof ICONS | React.ComponentProps<typeof MaterialCommunityIcons>['name'];

export function Icon({ name, size = 24, color = '#14261B', strokeWidth, style }: {
  name: IconName; size?: number; color?: string; strokeWidth?: number; style?: StyleProp<ViewStyle>;
}) {
  const Svg = (ICONS as Record<string, ComponentType<LucideProps>>)[name];
  if (Svg) return <Svg size={size} color={color} strokeWidth={strokeWidth ?? (size <= 18 ? 2.2 : 1.9)} style={style} />;
  return <MaterialCommunityIcons name={name as never} size={size} color={color} style={style as never} />;
}

export const hasSvgIcon = (name: string) => name in ICONS;
