import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

export type BrowserResult = { type: 'success'; url: string } | { type: 'cancel' };

export type AppleCredential =
  | { status: 'ok'; token: string; nonce: string }
  | { status: 'cancelled' }
  | { status: 'unavailable' };

export type SocialRuntime = {
  redirectUrl(): string;
  navigatesPage: boolean;
  openBrowser(url: string, redirectUrl: string): Promise<BrowserResult>;
  appleCredential(): Promise<AppleCredential>;
  pendingCallback(): Promise<string | null>;
  clearCallback(): void;
};

const appleCancelCode = 'ERR_REQUEST_CANCELED';
const nonceBytes = 32;
const routerSettleMs = 800;
const callbackParams = ['code', 'error', 'error_code', 'error_description'] as const;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function nativeAppleCredential(): Promise<AppleCredential> {
  if (!(await AppleAuthentication.isAvailableAsync())) return { status: 'unavailable' };
  const nonce = toHex(Crypto.getRandomBytes(nonceBytes));
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
  try {
    const credential = await AppleAuthentication.signInAsync({ nonce: hashedNonce });
    return credential.identityToken ? { status: 'ok', token: credential.identityToken, nonce } : { status: 'unavailable' };
  } catch (error) {
    if ((error as { code?: string }).code === appleCancelCode) return { status: 'cancelled' };
    throw error;
  }
}

const webRuntime: SocialRuntime = {
  redirectUrl: () => `${window.location.origin}/`,
  navigatesPage: true,
  openBrowser: async () => ({ type: 'cancel' }),
  appleCredential: async () => ({ status: 'unavailable' }),
  pendingCallback: async () => {
    const params = new URLSearchParams(window.location.search);
    return callbackParams.some((name) => params.has(name)) ? window.location.href : null;
  },
  clearCallback: () => {
    const clear = () => window.history.replaceState(window.history.state, '', window.location.pathname);
    clear();
    setTimeout(clear, routerSettleMs);
  },
};

const nativeRuntime: SocialRuntime = {
  redirectUrl: () => Linking.createURL('auth/callback'),
  navigatesPage: false,
  openBrowser: async (url, redirectUrl) => {
    const result = await WebBrowser.openAuthSessionAsync(url, redirectUrl);
    return result.type === 'success' ? { type: 'success', url: result.url } : { type: 'cancel' };
  },
  appleCredential: nativeAppleCredential,
  pendingCallback: async () => {
    const url = await Linking.getInitialURL();
    const callback = Linking.createURL('auth/callback');
    return url !== null && url.startsWith(callback) ? url : null;
  },
  clearCallback: () => undefined,
};

export function createSocialRuntime(): SocialRuntime {
  return Platform.OS === 'web' ? webRuntime : nativeRuntime;
}
