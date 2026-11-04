import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { createChunkedStorage, type KeyValueStore } from './chunked-storage';

const options: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

const keychain: KeyValueStore = {
  getItemAsync: (key) => SecureStore.getItemAsync(key, options),
  setItemAsync: (key, value) => SecureStore.setItemAsync(key, value, options),
  deleteItemAsync: (key) => SecureStore.deleteItemAsync(key, options),
};

const browserStorage: KeyValueStore = {
  getItemAsync: async (key) => window.localStorage.getItem(key),
  setItemAsync: async (key, value) => {
    window.localStorage.setItem(key, value);
  },
  deleteItemAsync: async (key) => {
    window.localStorage.removeItem(key);
  },
};

export const deviceStorage = createChunkedStorage(Platform.OS === 'web' ? browserStorage : keychain);
