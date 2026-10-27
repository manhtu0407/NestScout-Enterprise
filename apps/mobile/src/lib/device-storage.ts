import * as SecureStore from 'expo-secure-store';

import { createChunkedStorage, type KeyValueStore } from './chunked-storage';

const options: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

const keychain: KeyValueStore = {
  getItemAsync: (key) => SecureStore.getItemAsync(key, options),
  setItemAsync: (key, value) => SecureStore.setItemAsync(key, value, options),
  deleteItemAsync: (key) => SecureStore.deleteItemAsync(key, options),
};

export const deviceStorage = createChunkedStorage(keychain);
