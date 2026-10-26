export type UserRole = 'superadmin' | 'admin' | 'viewer' | 'pending';

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  role: UserRole;
  disabled?: boolean;
  createdAt: string;
}

export interface ListItem {
  id: string;
  text: string;
  selected: boolean;
  prioritized: boolean;
  createdAt: number;
}

export interface ShuffleList {
  id: string;
  name: string;
  category: string;
  description?: string;
  items: ListItem[];
  creatorId: string;
  creatorEmail: string;
  creatorName: string;
  creatorAvatar?: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  shuffleCount: number;
}

export interface ShuffledItem {
  id: string;
  text: string;
  prioritized: boolean;
  originalIndex: number;
  rank: number;
}

export interface ShuffledResult {
  id: string;
  listId: string;
  listName: string;
  category: string;
  creatorName: string;
  creatorEmail: string;
  items: ShuffledItem[];
  prioritizedCount: number;
  unprioritizedCount: number;
  shuffledAt: string;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
}
