import { ListItem, ShuffledItem, ShuffledResult, ShuffleList } from '../types/index.ts';

/**
 * Modern Fisher-Yates (Knuth) in-place array shuffle
 */
export function fisherYatesShuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Shuffles a list according to business rules:
 * 1. Only include items with `selected === true`
 * 2. Prioritized items are randomized amongst themselves and kept at the top
 * 3. Unprioritized items are randomized amongst themselves and follow
 * 4. Each item receives a sequential 1-based rank
 */
export function executeShuffle(list: ShuffleList): ShuffledResult {
  // Only selected items are considered
  const selectedItems = list.items.filter((item) => item.selected);

  const prioritizedItems = selectedItems.filter((item) => item.prioritized);
  const unprioritizedItems = selectedItems.filter((item) => !item.prioritized);

  // Shuffle both cohorts separately with Fisher-Yates
  const shuffledPrioritized = fisherYatesShuffle(prioritizedItems);
  const shuffledUnprioritized = fisherYatesShuffle(unprioritizedItems);

  // Combine: prioritized always at the top
  const combined = [...shuffledPrioritized, ...shuffledUnprioritized];

  const rankedItems: ShuffledItem[] = combined.map((item, index) => {
    const originalIndex = list.items.findIndex((orig) => orig.id === item.id);
    return {
      id: item.id,
      text: item.text,
      prioritized: item.prioritized,
      originalIndex: originalIndex >= 0 ? originalIndex : index,
      rank: index + 1,
    };
  });

  return {
    id: `shuffle-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    listId: list.id,
    listName: list.name,
    category: list.category,
    creatorName: list.creatorName,
    creatorEmail: list.creatorEmail,
    items: rankedItems,
    prioritizedCount: shuffledPrioritized.length,
    unprioritizedCount: shuffledUnprioritized.length,
    shuffledAt: new Date().toISOString(),
  };
}
