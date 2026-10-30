import { StatusBar } from 'expo-status-bar';

import { AccessProvider, AccessStack, getDefaultAccessServices } from '@/features/access';
import { HorizonPreview } from '@/features/horizon';
import { FoundationShowcase } from '@/showcase/foundation-showcase';

export const unstable_settings = { anchor: 'index' };

export default function RootLayout() {
  if (__DEV__ && process.env.EXPO_PUBLIC_DESIGN_SHOWCASE === '1') {
    return process.env.EXPO_PUBLIC_HORIZON_PREVIEW === '1' ? <HorizonPreview /> : <FoundationShowcase />;
  }
  return (
    <AccessProvider services={getDefaultAccessServices()}>
      <StatusBar style="auto" />
      <AccessStack />
    </AccessProvider>
  );
}
