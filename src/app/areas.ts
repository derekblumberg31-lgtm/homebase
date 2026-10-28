import type { ComponentType } from 'react';
import { Building, ClipboardCheck, Folder, House, MessageCircle, Settings, type IconProps } from '../ui/Icons';

/**
 * The six main areas, in one place so the sidebar, tab bar, page titles and Home links all agree.
 * A new area or feature is added here and in routes.tsx; nothing else has to know about it.
 */
export interface Area {
  id: 'home' | 'property' | 'tasks' | 'assistant' | 'records' | 'settings';
  label: string;
  path: string;
  icon: ComponentType<IconProps>;
  /** What the area is for, in the homeowner's words. */
  summary: string;
  /** Shown in the phone tab bar. Settings opens from the profile button instead. */
  inTabBar: boolean;
}

export const AREAS: Area[] = [
  { id: 'home', label: 'Home', path: '/home', icon: House, summary: 'What needs you today', inTabBar: true },
  { id: 'property', label: 'Property', path: '/property', icon: Building, summary: 'Rooms, systems, belongings and keys', inTabBar: true },
  { id: 'tasks', label: 'Tasks', path: '/tasks', icon: ClipboardCheck, summary: 'Maintenance, repairs and projects', inTabBar: true },
  { id: 'assistant', label: 'Assistant', path: '/assistant', icon: MessageCircle, summary: 'Help with fixes, planning and questions', inTabBar: true },
  { id: 'records', label: 'Records', path: '/records', icon: Folder, summary: 'Warranties, receipts and service history', inTabBar: true },
  { id: 'settings', label: 'Settings', path: '/settings', icon: Settings, summary: 'Household, notifications and your data', inTabBar: false },
];

export const PRODUCT = {
  name: 'Homebase',
  tagline: 'Your intelligent homeowner assistant',
};
