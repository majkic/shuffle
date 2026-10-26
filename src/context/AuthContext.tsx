import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { User, UserRole } from '../types/index.ts';
import { StorageService } from '../services/storage.ts';
import { SUPERADMIN_EMAIL } from '../data/initialData.ts';

interface AuthContextType {
  currentUser: User | null;
  users: User[];
  isAuthLoading: boolean;
  isApproved: boolean;
  loginWithGoogle: (profile: {
    id: string;
    email: string;
    name: string;
    avatar?: string;
    role: UserRole;
    disabled?: boolean;
    createdAt: string;
  }) => void;
  logout: () => void;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  canCreateList: boolean;
  canEditList: (creatorEmail: string) => boolean;
  canDeleteList: (creatorEmail: string) => boolean;
  updateRole: (targetUserId: string, newRole: UserRole) => Promise<{ success: boolean; error?: string }>;
  setUserDisabled: (targetUserId: string, disabled: boolean) => Promise<{ success: boolean; error?: string }>;
  deleteUser: (targetUserId: string) => Promise<{ success: boolean; error?: string }>;
  refreshUsers: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  const loginWithGoogle = useCallback((profile: {
    id: string;
    email: string;
    name: string;
    avatar?: string;
    role: UserRole;
    disabled?: boolean;
    createdAt: string;
  }) => {
    const trimmedEmail = profile.email.trim().toLowerCase();
    const allUsers = StorageService.getUsers();
    const savedUser = allUsers.find((user) => user.email.toLowerCase() === trimmedEmail);
    const existing: User = {
      id: profile.id,
      email: trimmedEmail,
      name: profile.name.trim() || trimmedEmail.split('@')[0],
      avatar: profile.avatar || savedUser?.avatar,
      role: profile.role,
      disabled: profile.disabled,
      createdAt: savedUser?.createdAt || profile.createdAt || new Date().toISOString(),
    };
    const updatedUsers = savedUser
      ? allUsers.map((user) => user.email.toLowerCase() === trimmedEmail ? existing : user)
      : [...allUsers, existing];
    localStorage.setItem('shuffle_users_v1', JSON.stringify(updatedUsers));
    setUsers(updatedUsers);
    setCurrentUser(existing);
  }, []);

  const refreshUsers = useCallback(async () => {
    if (currentUser?.role === 'superadmin' || currentUser?.email.toLowerCase() === SUPERADMIN_EMAIL.toLowerCase()) {
      const response = await fetch('/api/admin/users');
      if (!response.ok) {
        throw new Error(`Unable to load users (${response.status}): ${await response.text()}`);
      }
      setUsers(await response.json() as User[]);
      return;
    }

    setUsers(StorageService.getUsers());
  }, [currentUser]);

  useEffect(() => {
    setUsers(StorageService.getUsers());
    localStorage.removeItem('shuffle_current_user_id_v1');

    fetch('/api/auth/session')
      .then(async (response) => {
        if (!response.ok) throw new Error(`Session check failed (${response.status}): ${await response.text()}`);
        return response.json();
      })
      .then(({ user }: { user: Parameters<typeof loginWithGoogle>[0] | null }) => {
        if (user) loginWithGoogle(user);
      })
      .catch((error: unknown) => {
        console.error('Unable to restore Google sign-in session:', error);
      })
      .finally(() => {
        setIsAuthLoading(false);
      });
  }, [loginWithGoogle]);

  useEffect(() => {
    if (currentUser?.role !== 'superadmin' && currentUser?.email.toLowerCase() !== SUPERADMIN_EMAIL.toLowerCase()) {
      return;
    }
    refreshUsers().catch((error: unknown) => {
      console.error('Unable to load users for superadmin:', error);
    });
  }, [currentUser?.email, currentUser?.role, refreshUsers]);

  const logout = () => {
    fetch('/api/auth/logout', { method: 'POST' })
      .then((response) => {
        if (!response.ok) throw new Error(`Sign-out failed (${response.status})`);
        setCurrentUser(null);
      })
      .catch((error: unknown) => {
        console.error('Unable to sign out:', error);
      });
  };

  const isSuperAdmin = currentUser?.role === 'superadmin' || currentUser?.email.toLowerCase() === SUPERADMIN_EMAIL.toLowerCase();
  const isApproved = currentUser !== null && currentUser.role !== 'pending' && !currentUser.disabled;
  const isAdmin = isSuperAdmin || currentUser?.role === 'admin';
  const canCreateList = isAdmin;

  const canEditList = (creatorEmail: string) => {
    if (!currentUser) return false;
    if (isSuperAdmin) return true;
    return currentUser.role === 'admin' && currentUser.email === creatorEmail;
  };

  const canDeleteList = (creatorEmail: string) => {
    if (!currentUser) return false;
    if (isSuperAdmin) return true;
    return currentUser.role === 'admin' && currentUser.email === creatorEmail;
  };

  const updateRole = async (targetUserId: string, newRole: UserRole) => {
    if (!currentUser) return { success: false, error: 'Not authenticated' };
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(targetUserId)}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      if (!response.ok) {
        return { success: false, error: await response.text() };
      }

      const updatedUser = await response.json() as User;
      setUsers((previousUsers) =>
        previousUsers.map((user) => user.id === updatedUser.id ? updatedUser : user),
      );
      if (currentUser.id === updatedUser.id) setCurrentUser(updatedUser);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unable to update user access.',
      };
    }
  };

  const setUserDisabled = async (targetUserId: string, disabled: boolean) => {
    if (!currentUser) return { success: false, error: 'Not authenticated' };
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(targetUserId)}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disabled }),
      });
      if (!response.ok) return { success: false, error: await response.text() };
      const updatedUser = await response.json() as User;
      setUsers((previousUsers) =>
        previousUsers.map((user) => user.id === updatedUser.id ? updatedUser : user),
      );
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unable to update user status.',
      };
    }
  };

  const deleteUser = async (targetUserId: string) => {
    if (!currentUser) return { success: false, error: 'Not authenticated' };
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(targetUserId)}`, {
        method: 'DELETE',
      });
      if (!response.ok) return { success: false, error: await response.text() };
      setUsers((previousUsers) => previousUsers.filter((user) => user.id !== targetUserId));
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unable to delete user.',
      };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        users,
        isAuthLoading,
        isApproved,
        loginWithGoogle,
        logout,
        isSuperAdmin,
        isAdmin,
        canCreateList,
        canEditList,
        canDeleteList,
        updateRole,
        setUserDisabled,
        deleteUser,
        refreshUsers,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
