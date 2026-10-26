import React, { useState } from 'react';
import { ListItem, ShuffleList } from '../types/index.ts';
import { useAuth } from '../context/AuthContext.tsx';
import {
  Shuffle,
  Star,
  CheckSquare,
  Square,
  MoreVertical,
  Edit2,
  Trash2,
  Copy,
  ChevronDown,
  ChevronUp,
  User as UserIcon,
  Sparkles,
} from 'lucide-react';

interface ListCardProps {
  list: ShuffleList;
  onShuffle: (list: ShuffleList) => void;
  onEdit: (list: ShuffleList) => void;
  onDelete: (id: string) => void;
  onToggleItemSelection: (listId: string, itemId: string) => void;
  onToggleItemPriority: (listId: string, itemId: string) => void;
  onBulkSelect: (listId: string, selectAll: boolean) => void;
}

export const ListCard: React.FC<ListCardProps> = ({
  list,
  onShuffle,
  onEdit,
  onDelete,
  onToggleItemSelection,
  onToggleItemPriority,
  onBulkSelect,
}) => {
  const { canEditList, canDeleteList, isSuperAdmin } = useAuth();
  const [showAllItems, setShowAllItems] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const selectedCount = list.items.filter((i) => i.selected).length;
  const prioritizedCount = list.items.filter((i) => i.prioritized).length;

  const visibleItems = showAllItems ? list.items : list.items.slice(0, 5);
  const hasMore = list.items.length > 5;

  const isEditable = canEditList(list.creatorEmail);
  const isDeletable = canDeleteList(list.creatorEmail);

  return (
    <div className="group relative bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs hover:shadow-md transition-all flex flex-col overflow-hidden">
      {/* Top Banner / Category & Actions */}
      <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800/80 bg-linear-to-r from-slate-50/60 via-white to-slate-50/40 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800/40">
        <div className="flex items-start justify-between gap-3 mb-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200/70 dark:border-indigo-800/70">
              {list.category}
            </span>
            {prioritizedCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                <Star className="w-3 h-3 fill-amber-400 text-amber-500" />
                {prioritizedCount} Priority
              </span>
            )}
          </div>

          {/* Quick Menu */}
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="List options"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {showMenu && (
              <div
                className="absolute right-0 mt-1 w-40 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 py-1 z-20 text-xs font-medium animate-in fade-in"
                onClick={() => setShowMenu(false)}
              >
                {isEditable && (
                  <button
                    onClick={() => onEdit(list)}
                    className="w-full px-3 py-2 text-left text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2 cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-indigo-500" />
                    Edit List Items
                  </button>
                )}
                {isDeletable && (
                  <button
                    onClick={() => onDelete(list.id)}
                    className="w-full px-3 py-2 text-left text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-2 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete List
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Title & Shuffle Button Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight line-clamp-1">
              {list.name}
            </h3>
            {list.description && (
              <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5">
                {list.description}
              </p>
            )}
          </div>

          {/* Shuffle button right next to this list */}
          <button
            onClick={() => onShuffle(list)}
            disabled={selectedCount === 0}
            className="shrink-0 px-4 py-2 sm:py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold text-xs sm:text-sm shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 group/btn"
            title={selectedCount === 0 ? 'Select at least one item to shuffle' : 'Shuffle selected items'}
          >
            <Shuffle className="w-4 h-4 group-hover/btn:rotate-45 transition-transform" />
            <span>Shuffle ({selectedCount})</span>
          </button>
        </div>

        {/* Creator Info row */}
        <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <img
              src={list.creatorAvatar || `https://api.dicebear.com/7.x/initials/svg?seed=${list.creatorName}`}
              alt={list.creatorName}
              className="w-5 h-5 rounded-full object-cover border border-slate-200 dark:border-slate-700"
            />
            <span className="font-medium text-slate-700 dark:text-slate-300">
              {list.creatorName}
            </span>
            <span className="text-slate-400 dark:text-slate-500 hidden sm:inline">
              ({list.creatorEmail})
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400">
              Shuffled {list.shuffleCount || 0} times
            </span>
          </div>
        </div>
      </div>

      {/* Items Section */}
      <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 text-[11px]">
            Items ({selectedCount}/{list.items.length} Selected)
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onBulkSelect(list.id, true)}
              disabled={!isEditable}
              className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
            >
              Select All
            </button>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <button
              type="button"
              onClick={() => onBulkSelect(list.id, false)}
              disabled={!isEditable}
              className="text-[11px] font-semibold text-slate-500 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
            >
              None
            </button>
          </div>
        </div>

        {/* Item Rows */}
        <div className="space-y-1.5 flex-1">
          {visibleItems.map((item) => (
            <div
              key={item.id}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs sm:text-sm border transition-all ${
                item.prioritized
                  ? 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/60'
                  : item.selected
                  ? 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700/60'
                  : 'bg-slate-50/40 dark:bg-slate-900/40 border-slate-200/50 dark:border-slate-800/50 opacity-60'
              }`}
            >
              {/* Checkbox: All elements selected by default, can be deselected */}
              <button
                type="button"
                onClick={() => onToggleItemSelection(list.id, item.id)}
                disabled={!isEditable}
                className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 shrink-0 disabled:cursor-not-allowed"
                title={item.selected ? 'Deselect from shuffle' : 'Include in shuffle'}
              >
                {item.selected ? (
                  <CheckSquare className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                ) : (
                  <Square className="w-4 h-4 text-slate-300 dark:text-slate-600" />
                )}
              </button>

              {/* Priority Toggle: Randomizes while keeping at top of destination list */}
              <button
                type="button"
                onClick={() => onToggleItemPriority(list.id, item.id)}
                disabled={!isEditable}
                className={`shrink-0 transition-colors ${
                  item.prioritized
                    ? 'text-amber-500 hover:text-amber-600'
                    : 'text-slate-300 dark:text-slate-600 hover:text-amber-400'
                } disabled:cursor-not-allowed`}
                title={item.prioritized ? 'Prioritized: Starred to keep at top' : 'Mark as priority'}
              >
                <Star className={`w-3.5 h-3.5 ${item.prioritized ? 'fill-amber-400' : ''}`} />
              </button>

              {/* Text */}
              <span
                className={`flex-1 break-words line-clamp-1 ${
                  item.selected
                    ? 'text-slate-800 dark:text-slate-200 font-medium'
                    : 'text-slate-400 dark:text-slate-500 line-through'
                }`}
              >
                {item.text}
              </span>
            </div>
          ))}
        </div>

        {/* Show More toggle if more than 5 items */}
        {hasMore && (
          <button
            onClick={() => setShowAllItems(!showAllItems)}
            className="w-full py-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center justify-center gap-1 transition-colors"
          >
            {showAllItems ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                Show Fewer Items
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                View All {list.items.length} Items (+{list.items.length - 5} more)
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
};
