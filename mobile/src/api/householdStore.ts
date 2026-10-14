import AsyncStorage from '@react-native-async-storage/async-storage';

/** Currently selected household id (non-sensitive preference → AsyncStorage). */
const KEY = 'wi.household';
let current: number | null = null;
const listeners = new Set<(id: number | null) => void>();

export const householdStore = {
  get: () => current,
  async load() {
    const raw = await AsyncStorage.getItem(KEY);
    current = raw ? Number(raw) : null;
    return current;
  },
  async set(id: number | null) {
    current = id;
    if (id == null) await AsyncStorage.removeItem(KEY);
    else await AsyncStorage.setItem(KEY, String(id));
    listeners.forEach((l) => l(id));
  },
  subscribe(listener: (id: number | null) => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
