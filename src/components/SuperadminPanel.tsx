import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { SUPERADMIN_EMAIL } from '../data/initialData.ts';
import { Category, ShuffleList, User, UserRole } from '../types/index.ts';
import {
  ShieldAlert,
  Users,
  Layers,
  Shuffle,
  Trash2,
  CheckCircle2,
  X,
  Plus,
  Pencil,
  UserCheck,
  UserX,
  ListChecks,
} from 'lucide-react';

interface SuperadminPanelProps {
  isOpen: boolean;
  onClose: () => void;
  lists: ShuffleList[];
  categories: Category[];
  onListsChanged: () => void;
  onCategoriesChanged: (categories: Category[]) => void;
}

export const SuperadminPanel: React.FC<SuperadminPanelProps> = ({
  isOpen,
  onClose,
  lists,
  categories,
  onListsChanged,
  onCategoriesChanged,
}) => {
  const { currentUser, users, updateRole, setUserDisabled, deleteUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'users' | 'categories' | 'lists' | 'stats'>('users');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [accessTarget, setAccessTarget] = useState<User | null>(null);
  const [accessListIds, setAccessListIds] = useState<string[]>([]);
  const [isLoadingAccess, setIsLoadingAccess] = useState(false);
  const [isSavingAccess, setIsSavingAccess] = useState(false);

  if (!isOpen) return null;

  const totalItems = lists.reduce((acc, l) => acc + l.items.length, 0);
  const totalShuffles = lists.reduce((acc, l) => acc + (l.shuffleCount || 0), 0);
  const totalCategories = new Set(lists.map((l) => l.category)).size;

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    const res = await updateRole(userId, newRole);
    if (res.success) {
      setStatusMessage(newRole === 'pending' ? 'User access revoked.' : `User approved with ${newRole} access.`);
      setTimeout(() => setStatusMessage(null), 3000);
    } else {
      setStatusMessage(`Error: ${res.error}`);
    }
  };

  const handleDeleteListSuperadmin = async (listId: string) => {
    if (window.confirm('As Superadmin, are you sure you want to delete this list?')) {
      try {
        const response = await fetch(`/api/lists/${encodeURIComponent(listId)}`, { method: 'DELETE' });
        if (!response.ok) throw new Error(await response.text());
        onListsChanged();
        setStatusMessage('List deleted by Superadmin');
        setTimeout(() => setStatusMessage(null), 3000);
      } catch (error) {
        setStatusMessage(`Error: ${error instanceof Error ? error.message : 'Unable to delete list.'}`);
      }
    }
  };

  const handleManageListAccess = async (user: User) => {
    setIsLoadingAccess(true);
    setStatusMessage(null);
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/list-access`);
      if (!response.ok) throw new Error(await response.text());
      const result = await response.json() as { listIds: string[] };
      setAccessListIds(result.listIds);
      setAccessTarget(user);
    } catch (error) {
      setStatusMessage(`Error: ${error instanceof Error ? error.message : 'Unable to load list access.'}`);
    } finally {
      setIsLoadingAccess(false);
    }
  };

  const handleSaveListAccess = async () => {
    if (!accessTarget) return;
    setIsSavingAccess(true);
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(accessTarget.id)}/list-access`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listIds: accessListIds }),
      });
      if (!response.ok) throw new Error(await response.text());
      setAccessTarget(null);
      setStatusMessage(`List access updated for ${accessTarget.email}.`);
    } catch (error) {
      setStatusMessage(`Error: ${error instanceof Error ? error.message : 'Unable to update list access.'}`);
    } finally {
      setIsSavingAccess(false);
    }
  };

  const handleToggleUserDisabled = async (userId: string, disabled: boolean) => {
    const result = await setUserDisabled(userId, disabled);
    setStatusMessage(result.success
      ? `User ${disabled ? 'disabled' : 'enabled'} successfully.`
      : `Error: ${result.error}`);
  };

  const handleDeleteUser = async (userId: string, email: string) => {
    if (!window.confirm(`Permanently delete ${email}? Their lists will be kept, but will no longer be associated with a user account.`)) {
      return;
    }
    const result = await deleteUser(userId);
    setStatusMessage(result.success ? `Deleted ${email}.` : `Error: ${result.error}`);
  };

  const handleSaveCategory = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = categoryName.trim();
    if (!name) return;
    const isEditing = editingCategoryId !== null;
    try {
      const response = await fetch(
        isEditing
          ? `/api/admin/categories/${encodeURIComponent(editingCategoryId!)}`
          : '/api/admin/categories',
        {
          method: isEditing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        },
      );
      if (!response.ok) throw new Error(await response.text());
      const category = await response.json() as Category;
      const updated = isEditing
        ? categories.map((item) => item.id === category.id ? category : item)
        : [...categories, category].sort((a, b) => a.name.localeCompare(b.name));
      onCategoriesChanged(updated);
      setCategoryName('');
      setEditingCategoryId(null);
      setStatusMessage(`Category ${isEditing ? 'renamed (matching lists updated)' : 'created'} successfully.`);
    } catch (error) {
      setStatusMessage(`Error: ${error instanceof Error ? error.message : 'Unable to save category.'}`);
    }
  };

  const handleDeleteCategory = async (category: Category) => {
    if (!window.confirm(`Delete the "${category.name}" category? Existing lists will keep their category text.`)) {
      return;
    }
    try {
      const response = await fetch(`/api/admin/categories/${encodeURIComponent(category.id)}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error(await response.text());
      onCategoriesChanged(categories.filter((item) => item.id !== category.id));
      setStatusMessage(`Deleted category "${category.name}".`);
    } catch (error) {
      setStatusMessage(`Error: ${error instanceof Error ? error.message : 'Unable to delete category.'}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-indigo-200 dark:border-indigo-950/80 overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-slate-100 dark:border-slate-800 bg-indigo-50/60 dark:bg-indigo-950/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  Superadmin Command Center
                </h2>
                <span className="text-[11px] font-bold uppercase tracking-wider bg-indigo-600 text-white px-2 py-0.5 rounded-full">
                  {currentUser?.email || SUPERADMIN_EMAIL}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                System administration, user role assignments, and all-lists moderation
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex overflow-x-auto border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 px-6">
          <button
            onClick={() => setActiveTab('users')}
            className={`py-3 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
              activeTab === 'users'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            User Access ({users.filter((user) => user.role === 'pending').length} pending)
          </button>
          <button
            onClick={() => setActiveTab('categories')}
            className={`py-3 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
              activeTab === 'categories'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            Categories ({categories.length})
          </button>
          <button
            onClick={() => setActiveTab('lists')}
            className={`py-3 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
              activeTab === 'lists'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            All Lists Moderation ({lists.length})
          </button>
          <button
            onClick={() => setActiveTab('stats')}
            className={`py-3 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
              activeTab === 'stats'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            System Metrics
          </button>
        </div>

        {/* Message Banner */}
        {statusMessage && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-xs text-indigo-800 dark:text-indigo-200 font-medium flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-indigo-500" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {accessTarget ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    List access for {accessTarget.name}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Grants allow viewing and shuffling. Editing remains limited to the list creator and superadmin.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAccessTarget(null)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
                >
                  Back
                </button>
              </div>
              {lists.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">No lists are available to grant.</p>
              ) : (
                <div className="space-y-2">
                  {lists.map((list) => (
                    <label
                      key={list.id}
                      className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-800/60"
                    >
                      <input
                        type="checkbox"
                        checked={accessListIds.includes(list.id)}
                        onChange={(event) => setAccessListIds((previous) =>
                          event.target.checked
                            ? [...previous, list.id]
                            : previous.filter((id) => id !== list.id),
                        )}
                        className="h-4 w-4 accent-indigo-600"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">{list.name}</span>
                        <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                          {list.category} · {list.items.length} items
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAccessTarget(null)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveListAccess()}
                  disabled={isSavingAccess}
                  className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {isSavingAccess ? 'Saving...' : 'Save access'}
                </button>
              </div>
            </div>
          ) : isLoadingAccess ? (
            <p className="py-10 text-center text-sm text-slate-500">Loading list access...</p>
          ) : activeTab === 'users' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-500">
                  Users can only see lists assigned here. Choose Viewer to approve read-only access or Admin to allow list creation.
                </span>
              </div>
              {users.map((user) => (
                <div
                  key={user.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/60 gap-3"
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={user.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${user.name}`}
                      alt={user.name}
                      className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-slate-700"
                    />
                    <div>
                      <div className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        {user.name}
                        {user.email.toLowerCase() === SUPERADMIN_EMAIL.toLowerCase() && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold border border-indigo-200 dark:border-indigo-800">
                            Superadmin
                          </span>
                        )}
                        {user.disabled && (
                          <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300">
                            Disabled
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{user.email}</div>
                    </div>
                  </div>

                  {/* Role Selector */}
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={user.role}
                      disabled={user.email.toLowerCase() === SUPERADMIN_EMAIL.toLowerCase()}
                      onChange={(e) => void handleRoleChange(user.id, e.target.value as UserRole)}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white disabled:opacity-50 cursor-pointer"
                    >
                      <option value="pending">Pending Approval</option>
                      <option value="viewer">Viewer (Read-Only)</option>
                      <option value="admin">Admin (Can Create Lists)</option>
                      <option value="superadmin">Superadmin</option>
                    </select>
                    {user.email.toLowerCase() !== SUPERADMIN_EMAIL.toLowerCase() && (
                      <>
                        <button
                          onClick={() => void handleManageListAccess(user)}
                          className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 dark:border-indigo-900 dark:text-indigo-300 dark:hover:bg-indigo-950/50"
                        >
                          <ListChecks className="h-3.5 w-3.5" />
                          Manage lists
                        </button>
                        <button
                          onClick={() => void handleToggleUserDisabled(user.id, !user.disabled)}
                          className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                            user.disabled
                              ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300'
                              : 'bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/50 dark:text-amber-300'
                          }`}
                        >
                          {user.disabled ? <UserCheck className="h-3.5 w-3.5" /> : <UserX className="h-3.5 w-3.5" />}
                          {user.disabled ? 'Enable' : 'Disable'}
                        </button>
                        <button
                          onClick={() => void handleDeleteUser(user.id, user.email)}
                          className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 dark:bg-rose-950/50 dark:text-rose-300"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'categories' && (
            <div className="space-y-4">
              {!editingCategoryId && (
                <form onSubmit={handleSaveCategory} className="flex flex-col gap-2 sm:flex-row">
                  <input
                    value={categoryName}
                    onChange={(event) => setCategoryName(event.target.value)}
                    maxLength={128}
                    required
                    placeholder="Category name"
                    className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                  >
                    <Plus className="h-4 w-4" />
                    Create category
                  </button>
                </form>
              )}
              <div className="space-y-2">
                {categories.map((category) => (
                  <div
                    key={category.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-800/60"
                  >
                    {editingCategoryId === category.id ? (
                      <form onSubmit={handleSaveCategory} className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row">
                        <input
                          autoFocus
                          aria-label="Category name"
                          value={categoryName}
                          onChange={(event) => setCategoryName(event.target.value)}
                          maxLength={128}
                          required
                          className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                        />
                        <div className="flex shrink-0 gap-2">
                          <button
                            type="submit"
                            className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCategoryId(null);
                              setCategoryName('');
                            }}
                            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">{category.name}</span>
                        <div className="flex shrink-0 gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCategoryId(category.id);
                              setCategoryName(category.name);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteCategory(category)}
                            className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 dark:bg-rose-950/50 dark:text-rose-300"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
                {categories.length === 0 && (
                  <p className="py-6 text-center text-sm text-slate-500">No categories yet.</p>
                )}
              </div>
            </div>
          )}

          {activeTab === 'lists' && (
            <div className="space-y-2">
              {lists.map((l) => (
                <div
                  key={l.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/60"
                >
                  <div>
                    <div className="text-sm font-bold text-slate-900 dark:text-white">{l.name}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Category: {l.category} • Creator: {l.creatorName} ({l.creatorEmail}) • {l.items.length} items
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteListSuperadmin(l.id)}
                    className="p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                    title="Superadmin Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'stats' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/60 text-center">
                  <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400">
                    {lists.length}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Total Lists</div>
                </div>
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/60 text-center">
                  <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                    {totalItems}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Total Elements</div>
                </div>
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/60 text-center">
                  <div className="text-2xl font-black text-purple-600 dark:text-purple-400">
                    {totalShuffles}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Total Shuffles</div>
                </div>
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/60 text-center">
                  <div className="text-2xl font-black text-amber-600 dark:text-amber-400">
                    {totalCategories}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Categories</div>
                </div>
              </div>

            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold hover:opacity-90 cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
