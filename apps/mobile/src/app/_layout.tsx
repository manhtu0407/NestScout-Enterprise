import { StatusBar } from 'expo-status-bar';

import { AccessProvider, AccessStack, getDefaultAccessServices } from '@/features/access';
import { FoundationShowcase } from '@/showcase/foundation-showcase';

export const unstable_settings = { anchor: 'index' };

export default function RootLayout() {
  if (__DEV__ && process.env.EXPO_PUBLIC_DESIGN_SHOWCASE === '1') {
    return <FoundationShowcase />;
  }
  return (
    <AccessProvider services={getDefaultAccessServices()}>
      <StatusBar style="auto" />
      <AccessStack />
    </AccessProvider>
  );
}
