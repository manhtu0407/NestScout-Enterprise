import { StatusBar } from 'expo-status-bar';

import { AccessProvider, AccessStack, getDefaultAccessServices } from '@/features/access';

export const unstable_settings = { anchor: 'index' };

export default function RootLayout() {
  return (
    <AccessProvider services={getDefaultAccessServices()}>
      <StatusBar style="auto" />
      <AccessStack />
    </AccessProvider>
  );
}
