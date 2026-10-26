import React, { useState, useEffect, useMemo } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { ThemeProvider } from './context/ThemeContext.tsx';
import { Navbar } from './components/Navbar.tsx';
import { ListCard } from './components/ListCard.tsx';
import { ListEditorModal } from './components/ListEditorModal.tsx';
import { ShuffleModal } from './components/ShuffleModal.tsx';
import { GoogleAuthModal } from './components/GoogleAuthModal.tsx';
import { SuperadminPanel } from './components/SuperadminPanel.tsx';
import { PrintableView } from './components/PrintableView.tsx';
import { StorageService } from './services/storage.ts';
import { Category, ShuffleList, ShuffledResult } from './types/index.ts';
import {
  Search,
  Filter,
  SlidersHorizontal,
  Plus,
  Shuffle,
  Sparkles,
  AlertCircle,
  FolderOpen,
  ArrowUpDown,
  User as UserIcon,
  HelpCircle,
  FileText,
  Star,
  CheckCircle2,
} from 'lucide-react';

function ShuffleAppContent() {
  const { currentUser, isSuperAdmin, canCreateList, isAuthLoading, isApproved, logout } = useAuth();

  // State
  const [lists, setLists] = useState<ShuffleList[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [listLoadError, setListLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedCreator, setSelectedCreator] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'shuffled' | 'items' | 'alpha'>('newest');

  // Modals state
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [listToEdit, setListToEdit] = useState<ShuffleList | null>(null);
  const [isShuffleOpen, setIsShuffleOpen] = useState(false);
  const [listToShuffle, setListToShuffle] = useState<ShuffleList | null>(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isSuperadminOpen, setIsSuperadminOpen] = useState(false);
  const [activePrintResult, setActivePrintResult] = useState<ShuffledResult | null>(null);

  // Load lists & categories on mount
  const refreshData = async () => {
    if (!isApproved) {
      setLists([]);
      setCategories([]);
      setListLoadError(null);
      return;
    }
    setListLoadError(null);
    try {
      if (isSuperAdmin && localStorage.getItem('shuffle_lists_imported_v1') !== 'true') {
        const importResponse = await fetch('/api/admin/lists/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lists: StorageService.getLocalListsForImport() }),
        });
        if (!importResponse.ok) {
          throw new Error(`Unable to import existing lists (${importResponse.status}): ${await importResponse.text()}`);
        }
        localStorage.setItem('shuffle_lists_imported_v1', 'true');
      }

      const [listsResponse, categoriesResponse] = await Promise.all([
        fetch('/api/lists'),
        fetch('/api/admin/categories'),
      ]);
      if (!listsResponse.ok) {
        throw new Error(`Unable to load accessible lists (${listsResponse.status}): ${await listsResponse.text()}`);
      }
      if (!categoriesResponse.ok) {
        throw new Error(`Unable to load categories (${categoriesResponse.status}): ${await categoriesResponse.text()}`);
      }
      const [savedLists, savedCategories] = await Promise.all([
        listsResponse.json() as Promise<ShuffleList[]>,
        categoriesResponse.json() as Promise<Category[]>,
      ]);
      setLists(savedLists);
      StorageService.saveCategories(savedCategories);
      setCategories(savedCategories);
    } catch (error) {
      console.error('Unable to load app data:', error);
      setLists([]);
      setListLoadError(error instanceof Error ? error.message : 'Unable to load app data.');
    }
  };

  useEffect(() => {
    void refreshData();
  }, [isApproved, isSuperAdmin]);

  // Unique creators for filtering
  const creators = useMemo(() => {
    const map = new Map<string, string>();
    lists.forEach((l) => {
      if (!map.has(l.creatorEmail)) {
        map.set(l.creatorEmail, l.creatorName);
      }
    });
    return Array.from(map.entries()).map(([email, name]) => ({ email, name }));
  }, [lists]);

  // Filtered and Sorted lists
  const filteredLists = useMemo(() => {
    let result = [...lists];

    // Search query filter (matches name, description, item text, or creator)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          (l.description && l.description.toLowerCase().includes(q)) ||
          l.creatorName.toLowerCase().includes(q) ||
          l.creatorEmail.toLowerCase().includes(q) ||
          l.items.some((item) => item.text.toLowerCase().includes(q))
      );
    }

    // Category filter
    if (selectedCategory !== 'all') {
      result = result.filter((l) => l.category.toLowerCase() === selectedCategory.toLowerCase());
    }

    // Creator filter
    if (selectedCreator !== 'all') {
      result = result.filter((l) => l.creatorEmail.toLowerCase() === selectedCreator.toLowerCase());
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === 'newest') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (sortBy === 'shuffled') {
        return (b.shuffleCount || 0) - (a.shuffleCount || 0);
      }
      if (sortBy === 'items') {
        return b.items.length - a.items.length;
      }
      if (sortBy === 'alpha') {
        return a.name.localeCompare(b.name);
      }
      return 0;
    });

    return result;
  }, [lists, searchQuery, selectedCategory, selectedCreator, sortBy]);

  // Handlers
  const handleOpenCreate = () => {
    if (!canCreateList) {
      setIsAuthOpen(true);
      return;
    }
    setListToEdit(null);
    setIsEditorOpen(true);
  };

  const handleOpenEdit = (list: ShuffleList) => {
    setListToEdit(list);
    setIsEditorOpen(true);
  };

  const handleOpenShuffle = (list: ShuffleList) => {
    setListToShuffle(list);
    setIsShuffleOpen(true);
  };

  const handleDeleteList = async (id: string) => {
    if (!currentUser) return;
    const target = lists.find((l) => l.id === id);
    if (!target) return;

    if (window.confirm(`Are you sure you want to delete "${target.name}"?`)) {
      try {
        const response = await fetch(`/api/lists/${encodeURIComponent(id)}`, { method: 'DELETE' });
        if (!response.ok) throw new Error(await response.text());
        await refreshData();
      } catch (error) {
        alert(error instanceof Error ? error.message : 'Unable to delete list.');
      }
    }
  };

  const updateListItem = async (listId: string, path: string, body: object) => {
    try {
      const response = await fetch(`/api/lists/${encodeURIComponent(listId)}/items${path}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(await response.text());
      const updated = await response.json() as ShuffleList;
      setLists((previous) => previous.map((list) => list.id === listId ? updated : list));
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Unable to update list.');
    }
  };

  const handleToggleItemSelection = (listId: string, itemId: string) => {
    const item = lists.find((list) => list.id === listId)?.items.find((listItem) => listItem.id === itemId);
    if (item) void updateListItem(listId, `/${encodeURIComponent(itemId)}`, { selected: !item.selected });
  };

  const handleToggleItemPriority = (listId: string, itemId: string) => {
    const item = lists.find((list) => list.id === listId)?.items.find((listItem) => listItem.id === itemId);
    if (item) void updateListItem(listId, `/${encodeURIComponent(itemId)}`, { prioritized: !item.prioritized });
  };

  const handleBulkSelect = (listId: string, selectAll: boolean) => {
    void updateListItem(listId, '', { selected: selectAll });
  };

  if (isAuthLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Checking sign-in...</p>
      </main>
    );
  }

  if (!isApproved) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4 py-12">
        <section className="w-full max-w-xl rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 sm:p-12 text-center shadow-xl shadow-slate-200/50 dark:shadow-black/20">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/20">
            <Shuffle className="h-8 w-8" />
          </div>
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-400">
            Shuffle
          </p>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-900 dark:text-white">
            Make the next choice a good one.
          </h1>
          {currentUser?.disabled ? (
            <>
              <p className="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-300">
                Access for <strong>{currentUser.email}</strong> has been disabled. Contact the superadmin if you think this is a mistake.
              </p>
              <button
                onClick={logout}
                className="mt-7 inline-flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Sign out
              </button>
            </>
          ) : currentUser?.role === 'pending' ? (
            <>
              <p className="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-300">
                Your Google account <strong>{currentUser.email}</strong> is awaiting approval from a superadmin.
                You’ll be able to access Shuffle once your account is approved.
              </p>
              <button
                onClick={logout}
                className="mt-7 inline-flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Sign out
              </button>
              <button
                onClick={() => window.location.reload()}
                className="ml-2 mt-7 inline-flex items-center justify-center rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                Check approval status
              </button>
            </>
          ) : (
            <>
              <p className="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-300">
                Organize choices into lists, shuffle them fairly, and share or print the results. Sign in with Google
                to request access.
              </p>
              <a
                href="/api/auth/google"
                className="mt-7 inline-flex items-center justify-center rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
              >
                Continue with Google
              </a>
            </>
          )}
        </section>
      </main>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50/50 dark:bg-slate-950 transition-colors">
      {/* Navigation */}
      <Navbar
        onCreateClick={handleOpenCreate}
        onAuthClick={() => setIsAuthOpen(true)}
        onSuperadminClick={() => setIsSuperadminOpen(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
      {listLoadError && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          {listLoadError}
        </div>
      )}
        {/* Hero Banner / Instructions Card */}
        <div className="relative overflow-hidden rounded-3xl bg-linear-to-r from-indigo-900 via-indigo-800 to-slate-900 text-white p-6 sm:p-8 shadow-xl">
          <div className="relative z-10 max-w-2xl space-y-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-white/10 backdrop-blur-md text-amber-300 border border-white/10">
              <Sparkles className="w-3.5 h-3.5" />
              Smart Randomizer & PDF Publishing
            </div>
            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight">
              Fair, randomized lists with priority at the top.
            </h1>
            <p className="text-xs sm:text-base text-indigo-100/90 leading-relaxed">
              Create lists with distinct names, toggle elements (all selected by default), prioritize essential items with ⭐, and click <strong className="text-amber-300">Shuffle</strong> to generate a clean, read-only randomized view ready for PDF printing.
            </p>
            <div className="pt-2 flex items-center gap-3 flex-wrap text-xs text-indigo-200">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Distinct Elements
              </span>
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Priority Kept at Top
              </span>
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Vector PDF Print Export
              </span>
            </div>
          </div>
          {/* Subtle Decorative Pattern */}
          <div className="absolute right-0 top-0 bottom-0 w-1/3 opacity-10 pointer-events-none flex items-center justify-center">
            <Shuffle className="w-64 h-64 -rotate-12" />
          </div>
        </div>

        {/* Filter and Search Toolbar */}
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search lists by name, item keyword, or creator..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500 shadow-xs"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Creator Filter & Sort */}
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
              {/* Creator Filter Dropdown */}
              <div className="relative flex-1 sm:flex-initial">
                <select
                  value={selectedCreator}
                  onChange={(e) => setSelectedCreator(e.target.value)}
                  className="w-full sm:w-auto px-3.5 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 text-xs sm:text-sm font-medium focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-xs"
                >
                  <option value="all">All Creators ({creators.length})</option>
                  {creators.map((c) => (
                    <option key={c.email} value={c.email}>
                      Creator: {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Sort Dropdown */}
              <div className="relative flex-1 sm:flex-initial">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="w-full sm:w-auto px-3.5 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 text-xs sm:text-sm font-medium focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-xs"
                >
                  <option value="newest">Sort: Newest</option>
                  <option value="shuffled">Sort: Most Shuffled</option>
                  <option value="items">Sort: Most Items</option>
                  <option value="alpha">Sort: Title (A-Z)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Category Filter Pills (Horizontal scroll on mobile) */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 no-scrollbar">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                selectedCategory === 'all'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              All Categories ({lists.length})
            </button>
            {categories.map((cat) => {
              const count = lists.filter((l) => l.category.toLowerCase() === cat.name.toLowerCase()).length;
              const isSelected = selectedCategory.toLowerCase() === cat.name.toLowerCase();
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.name)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {cat.name} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* Results Counter and Status */}
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>
            Showing <strong>{filteredLists.length}</strong> of {lists.length} lists
          </span>
          {selectedCategory !== 'all' || selectedCreator !== 'all' || searchQuery ? (
            <button
              onClick={() => {
                setSelectedCategory('all');
                setSelectedCreator('all');
                setSearchQuery('');
              }}
              className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline"
            >
              Reset all filters
            </button>
          ) : null}
        </div>

        {/* Lists Grid */}
        {filteredLists.length === 0 ? (
          <div className="text-center py-16 px-4 bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-300 dark:border-slate-800 space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 mx-auto flex items-center justify-center">
              <FolderOpen className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                No lists found
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                {lists.length === 0
                  ? 'No lists have been shared with your account yet. Ask the superadmin to grant access.'
                  : 'No lists match your search criteria or filter. Try adjusting your query or create a new list.'}
              </p>
              {canCreateList && !isSuperAdmin && lists.length === 0 && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Lists you create also need a superadmin grant before they appear in your account.
                </p>
              )}
            </div>
            {canCreateList && (
              <button
                onClick={handleOpenCreate}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs sm:text-sm font-semibold hover:bg-indigo-700 shadow-sm transition-all"
              >
                <Plus className="w-4 h-4" />
                Create a New List
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {filteredLists.map((list) => (
              <ListCard
                key={list.id}
                list={list}
                onShuffle={handleOpenShuffle}
                onEdit={handleOpenEdit}
                onDelete={handleDeleteList}
                onToggleItemSelection={handleToggleItemSelection}
                onToggleItemPriority={handleToggleItemPriority}
                onBulkSelect={handleBulkSelect}
              />
            ))}
          </div>
        )}
      </main>

      {/* Mobile Sticky Floating Action Button */}
      <div className="sm:hidden fixed bottom-5 right-5 z-20">
        <button
          onClick={handleOpenCreate}
          className="w-14 h-14 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-xl flex items-center justify-center active:scale-95 transition-all"
          title="Create New List"
          aria-label="Create New List"
        >
          <Plus className="w-6 h-6" />
        </button>
      </div>

      {/* Modals */}
      <ListEditorModal
        isOpen={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
        listToEdit={listToEdit}
        onSaved={() => {
          refreshData();
        }}
      />

      <ShuffleModal
        isOpen={isShuffleOpen}
        list={listToShuffle}
        onClose={() => setIsShuffleOpen(false)}
        onShuffleCountUpdated={() => {
          refreshData();
        }}
      />

      <GoogleAuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
      />

      <SuperadminPanel
        isOpen={isSuperadminOpen}
        onClose={() => setIsSuperadminOpen(false)}
        lists={lists}
        categories={categories}
        onListsChanged={() => {
          refreshData();
        }}
        onCategoriesChanged={(updatedCategories) => {
          StorageService.saveCategories(updatedCategories);
          setCategories(updatedCategories);
          void refreshData();
        }}
      />

      {/* Printable Paper View for @media print */}
      <PrintableView result={activePrintResult} />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ShuffleAppContent />
      </AuthProvider>
    </ThemeProvider>
  );
}
