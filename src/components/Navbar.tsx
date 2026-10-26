import React from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { useTheme } from '../context/ThemeContext.tsx';
import { SUPERADMIN_EMAIL } from '../data/initialData.ts';
import {
  Shuffle,
  Plus,
  Sun,
  Moon,
  ShieldCheck,
  User as UserIcon,
  LogIn,
  Sliders,
  Crown,
} from 'lucide-react';

interface NavbarProps {
  onCreateClick: () => void;
  onAuthClick: () => void;
  onSuperadminClick: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onCreateClick,
  onAuthClick,
  onSuperadminClick,
}) => {
  const { currentUser, isSuperAdmin, canCreateList } = useAuth();
  const { isDark, toggleTheme } = useTheme();

  return (
    <header className="sticky top-0 z-30 w-full bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Brand / Logo */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-linear-to-tr from-indigo-600 via-indigo-500 to-amber-500 text-white flex items-center justify-center shadow-md shadow-indigo-500/20">
            <Shuffle className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-black tracking-tight text-slate-900 dark:text-white">
                Shuffle
              </span>
              <span className="hidden sm:inline-block text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
                Randomizer & PDF
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block">
              Prioritized list sorting & print export
            </p>
          </div>
        </div>

        {/* Right Action Tools */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Superadmin Quick Access Button */}
          {isSuperAdmin && (
            <button
              onClick={onSuperadminClick}
              className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-xs font-bold flex items-center gap-1.5 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors cursor-pointer"
              title="Superadmin Command Center"
            >
              <Crown className="w-3.5 h-3.5 text-amber-500 fill-amber-400" />
              <span className="hidden md:inline">Admin Panel</span>
            </button>
          )}

          {/* Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label="Toggle Dark Mode"
          >
            {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
          </button>

          {/* User Account Button */}
          <button
            onClick={onAuthClick}
            className="flex items-center gap-2 p-1.5 sm:pr-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-all cursor-pointer text-left"
            title="Switch User / Google Sign-In"
          >
            {currentUser ? (
              <>
                <img
                  src={currentUser.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${currentUser.name}`}
                  alt={currentUser.name}
                  className="w-7 h-7 rounded-full object-cover border border-slate-200 dark:border-slate-700"
                />
                <div className="hidden sm:block">
                  <div className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1 leading-tight">
                    <span className="max-w-[100px] truncate">{currentUser.name}</span>
                    {currentUser.role === 'superadmin' && (
                      <span className="text-[9px] bg-indigo-600 text-white font-black px-1.5 py-0.2 rounded-sm">
                        SUPER
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400 capitalize">{currentUser.role}</div>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <LogIn className="w-4 h-4 text-indigo-600" />
                <span>Sign In</span>
              </div>
            )}
          </button>

          {/* Create List CTA */}
          <button
            onClick={onCreateClick}
            className="px-3.5 sm:px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs sm:text-sm font-bold shadow-xs hover:shadow transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>New List</span>
          </button>
        </div>
      </div>
    </header>
  );
};
