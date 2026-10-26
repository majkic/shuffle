import { Category, ShuffleList, User } from '../types/index.ts';
import { DEFAULT_CATEGORIES, DEFAULT_USERS, SUPERADMIN_EMAIL } from '../data/initialData.ts';

const LEGACY_LISTS_KEY = 'shuffle_lists_v1';
const USERS_KEY = 'shuffle_users_v1';
const CATEGORIES_KEY = 'shuffle_categories_v1';

export class StorageService {
  static getLocalListsForImport(): ShuffleList[] {
    try {
      const data = localStorage.getItem(LEGACY_LISTS_KEY);
      if (!data) return [];
      const lists: unknown = JSON.parse(data);
      if (!Array.isArray(lists)) throw new Error('Stored list data is not an array.');
      return lists as ShuffleList[];
    } catch (error) {
      console.error('Error reading legacy lists for import:', error);
      throw new Error('Unable to read existing browser lists for import.');
    }
  }

  static getCategories(): Category[] {
    try {
      const data = localStorage.getItem(CATEGORIES_KEY);
      if (data) return JSON.parse(data) as Category[];
    } catch (error) {
      console.error('Error reading categories from localStorage:', error);
    }
    localStorage.setItem(CATEGORIES_KEY, JSON.stringify(DEFAULT_CATEGORIES));
    return DEFAULT_CATEGORIES;
  }

  static saveCategories(categories: Category[]): void {
    localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories));
  }

  static getUsers(): User[] {
    try {
      const data = localStorage.getItem(USERS_KEY);
      if (data) {
        const users = JSON.parse(data) as User[];
        const superadmin = users.find(
          (user) => user.email.toLowerCase() === SUPERADMIN_EMAIL.toLowerCase(),
        );
        if (superadmin && superadmin.role !== 'superadmin') {
          superadmin.role = 'superadmin';
          localStorage.setItem(USERS_KEY, JSON.stringify(users));
        }
        return users;
      }
    } catch (error) {
      console.error('Error reading users from localStorage:', error);
    }
    localStorage.setItem(USERS_KEY, JSON.stringify(DEFAULT_USERS));
    return DEFAULT_USERS;
  }
}
