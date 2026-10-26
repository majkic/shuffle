import React, { useState, useEffect } from 'react';
import { Category, ListItem, ShuffleList } from '../types/index.ts';
import { StorageService } from '../services/storage.ts';
import { useAuth } from '../context/AuthContext.tsx';
import {
  X,
  Plus,
  Trash2,
  Star,
  CheckSquare,
  Square,
  AlertCircle,
  FileText,
  Tag,
  Sparkles,
  ArrowUpDown,
  ClipboardPaste,
} from 'lucide-react';

interface ListEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  listToEdit?: ShuffleList | null;
  onSaved: (savedList: ShuffleList) => void;
}

export const ListEditorModal: React.FC<ListEditorModalProps> = ({
  isOpen,
  onClose,
  listToEdit,
  onSaved,
}) => {
  const { currentUser, canCreateList, canEditList } = useAuth();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Work & Projects');
  const [description, setDescription] = useState('');
  const [items, setItems] = useState<ListItem[]>([]);
  const [newItemText, setNewItemText] = useState('');
  const [bulkText, setBulkText] = useState('');
  const [showBulkInput, setShowBulkInput] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [showNewCatInput, setShowNewCatInput] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setCategories(StorageService.getCategories());
      if (listToEdit) {
        setName(listToEdit.name);
        setCategory(listToEdit.category);
        setDescription(listToEdit.description || '');
        setItems([...listToEdit.items]);
      } else {
        setName('');
        setCategory('Work & Projects');
        setDescription('');
        setItems([]);
      }
      setNewItemText('');
      setBulkText('');
      setShowBulkInput(false);
      setShowNewCatInput(false);
      setError(null);
    }
  }, [isOpen, listToEdit]);

  if (!isOpen) return null;

  const isEditing = !!listToEdit;

  // Add a single item
  const handleAddItem = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = newItemText.trim();
    if (!text) return;

    // Validate distinctness
    const isDuplicate = items.some((it) => it.text.trim().toLowerCase() === text.toLowerCase());
    if (isDuplicate) {
      setError(`"${text}" is already in this list. All items must be distinct.`);
      return;
    }

    const newItem: ListItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      text,
      selected: true, // all elements are selected by default
      prioritized: false,
      createdAt: Date.now(),
    };

    setItems([...items, newItem]);
    setNewItemText('');
    setError(null);
  };

  // Bulk add lines
  const handleBulkAdd = () => {
    if (!bulkText.trim()) return;
    const lines = bulkText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const existingSet = new Set(items.map((i) => i.text.trim().toLowerCase()));
    const addedItems: ListItem[] = [];
    let duplicatesSkipped = 0;

    lines.forEach((line) => {
      const lower = line.toLowerCase();
      if (!existingSet.has(lower)) {
        existingSet.add(lower);
        addedItems.push({
          id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          text: line,
          selected: true, // selected by default
          prioritized: false,
          createdAt: Date.now(),
        });
      } else {
        duplicatesSkipped++;
      }
    });

    if (addedItems.length > 0) {
      setItems([...items, ...addedItems]);
      setBulkText('');
      setShowBulkInput(false);
      if (duplicatesSkipped > 0) {
        setError(`Added ${addedItems.length} distinct items (${duplicatesSkipped} duplicate items were skipped).`);
      } else {
        setError(null);
      }
    } else {
      setError('No new distinct items found to add.');
    }
  };

  // Toggle selection
  const toggleItemSelection = (id: string) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, selected: !it.selected } : it))
    );
  };

  // Toggle prioritization
  const toggleItemPriority = (id: string) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, prioritized: !it.prioritized } : it))
    );
  };

  // Remove item
  const handleRemoveItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  // Bulk selection actions
  const selectAll = () => {
    setItems((prev) => prev.map((it) => ({ ...it, selected: true })));
  };

  const deselectAll = () => {
    setItems((prev) => prev.map((it) => ({ ...it, selected: false })));
  };

  // Add custom category
  const handleAddCategory = () => {
    if (!newCategoryName.trim()) return;
    fetch('/api/admin/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newCategoryName }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(await response.text());
        return response.json() as Promise<Category>;
      })
      .then((cat) => {
        const updated = [...categories.filter((category) => category.id !== cat.id), cat];
        setCategories(updated);
        StorageService.saveCategories(updated);
        setCategory(cat.name);
        setNewCategoryName('');
        setShowNewCatInput(false);
        setError(null);
      })
      .catch((error: unknown) => {
        setError(error instanceof Error ? error.message : 'Unable to create category.');
      });
  };

  const handleSave = async () => {
    if (!currentUser) {
      setError('You must be logged in to create or edit lists.');
      return;
    }

    if (!canCreateList && !isEditing) {
      setError('Viewer accounts cannot create lists. Please switch to an Admin or Superadmin role.');
      return;
    }

    if (isEditing && !canEditList(listToEdit!.creatorEmail)) {
      setError('You do not have permission to edit this list.');
      return;
    }

    if (!name.trim()) {
      setError('Please provide a distinct name for this list.');
      return;
    }

    if (items.length === 0) {
      setError('Please add at least one distinct item to the list.');
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(
        isEditing && listToEdit ? `/api/lists/${encodeURIComponent(listToEdit.id)}` : '/api/lists',
        {
          method: isEditing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            category,
            description: description.trim(),
            items,
          }),
        },
      );
      if (!response.ok) throw new Error(await response.text());
      onSaved(await response.json() as ShuffleList);
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save list.');
    } finally {
      setIsSaving(false);
    }
  };

  const selectedCount = items.filter((i) => i.selected).length;
  const prioritizedCount = items.filter((i) => i.prioritized).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl max-h-[92vh] flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
              {isEditing ? 'Edit Shuffle List' : 'Create New List'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Each list and all its text elements must be distinct. Items are selected by default.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs sm:text-sm flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
              <span>{error}</span>
            </div>
          )}

          {/* List Name Input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
              List Name <span className="text-rose-500">* (Distinct)</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Sprint Retrospective Topics, Dinner Ideas, Team Icebreakers"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-medium transition-all"
            />
          </div>

          {/* Category Selection & Custom Category */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                Category
              </label>
              {!showNewCatInput && (
                <button
                  type="button"
                  onClick={() => setShowNewCatInput(true)}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-semibold"
                >
                  + Add Custom Category
                </button>
              )}
            </div>

            {showNewCatInput ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="New category name..."
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
                <button
                  type="button"
                  onClick={handleAddCategory}
                  className="px-3 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-xl hover:bg-indigo-700"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewCatInput(false)}
                  className="px-3 py-2 border border-slate-200 dark:border-slate-700 text-xs font-semibold rounded-xl"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-medium transition-all"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Description Input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
              Description / Notes (Optional)
            </label>
            <input
              type="text"
              placeholder="Brief context or instructions for this list..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Items Section */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Distinct List Elements ({items.length})
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {selectedCount} selected • {prioritizedCount} prioritized (kept at top when shuffled)
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400"
                >
                  Select All
                </button>
                <span className="text-slate-300 dark:text-slate-700">•</span>
                <button
                  type="button"
                  onClick={deselectAll}
                  className="text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400"
                >
                  Deselect All
                </button>
                <span className="text-slate-300 dark:text-slate-700">•</span>
                <button
                  type="button"
                  onClick={() => setShowBulkInput(!showBulkInput)}
                  className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1 hover:underline"
                >
                  <ClipboardPaste className="w-3.5 h-3.5" />
                  {showBulkInput ? 'Single Item' : 'Bulk Paste'}
                </button>
              </div>
            </div>

            {/* Single Add Input */}
            {!showBulkInput ? (
              <form onSubmit={handleAddItem} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Type an element and press Enter..."
                  value={newItemText}
                  onChange={(e) => {
                    setNewItemText(e.target.value);
                    if (error) setError(null);
                  }}
                  className="flex-1 px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  type="submit"
                  disabled={!newItemText.trim()}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold flex items-center gap-1.5 shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Add
                </button>
              </form>
            ) : (
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                <textarea
                  rows={4}
                  placeholder="Paste multiple items here (one element per line). Duplicate items are automatically deduplicated..."
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  className="w-full p-2.5 text-xs sm:text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowBulkInput(false)}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleBulkAdd}
                    disabled={!bulkText.trim()}
                    className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    Add Distinct Items
                  </button>
                </div>
              </div>
            )}

            {/* List of items */}
            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {items.length === 0 ? (
                <div className="text-center py-6 text-xs text-slate-400 dark:text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                  No elements added yet. Add distinct elements above.
                </div>
              ) : (
                items.map((item, index) => (
                  <div
                    key={item.id}
                    className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition-all ${
                      item.prioritized
                        ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800'
                        : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700/70'
                    }`}
                  >
                    {/* Select Checkbox (Selected by default) */}
                    <button
                      type="button"
                      onClick={() => toggleItemSelection(item.id)}
                      className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors shrink-0"
                      title={item.selected ? 'Deselect item' : 'Select item'}
                    >
                      {item.selected ? (
                        <CheckSquare className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-400" />
                      )}
                    </button>

                    {/* Priority Star Toggle */}
                    <button
                      type="button"
                      onClick={() => toggleItemPriority(item.id)}
                      className={`shrink-0 transition-colors ${
                        item.prioritized
                          ? 'text-amber-500 hover:text-amber-600'
                          : 'text-slate-300 dark:text-slate-600 hover:text-amber-400'
                      }`}
                      title={item.prioritized ? 'Prioritized (will shuffle at top)' : 'Mark as priority'}
                    >
                      <Star className={`w-4 h-4 ${item.prioritized ? 'fill-amber-400' : ''}`} />
                    </button>

                    {/* Text */}
                    <span
                      className={`flex-1 text-xs sm:text-sm font-medium break-words ${
                        item.selected
                          ? 'text-slate-900 dark:text-slate-100'
                          : 'text-slate-400 dark:text-slate-500 line-through'
                      }`}
                    >
                      {item.text}
                    </span>

                    {/* Remove button */}
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(item.id)}
                      className="text-slate-300 hover:text-rose-500 dark:text-slate-600 dark:hover:text-rose-400 p-1 rounded-md transition-colors"
                      title="Remove item"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/90 flex items-center justify-between">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {canCreateList ? (
              <span>Saving as <strong className="text-slate-700 dark:text-slate-200">{currentUser?.name}</strong> ({currentUser?.role})</span>
            ) : (
              <span className="text-rose-500 font-semibold">Viewer mode: Admin login required to save</span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!canCreateList || isSaving}
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-semibold shadow-xs disabled:opacity-50 cursor-pointer"
            >
              {isSaving ? 'Saving...' : isEditing ? 'Save Changes' : 'Create List'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
