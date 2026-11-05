import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';

import { AccessProvider, AccessStack, getDefaultAccessServices } from '@/features/access';
import { DeveloperPilotPanel, developerPilotEnabled, HorizonPreview } from '@/features/horizon';
import { FoundationShowcase } from '@/showcase/foundation-showcase';
import { KaelMotionLab } from '@/showcase/kael-motion-lab';

export const unstable_settings = { anchor: 'index' };

export default function RootLayout() {
  const pilot = developerPilotEnabled();
  if (!pilot && __DEV__ && process.env.EXPO_PUBLIC_DESIGN_SHOWCASE === '1') {
    if (process.env.EXPO_PUBLIC_KAEL_MOTION_LAB === '1') return <KaelMotionLab />;
    return process.env.EXPO_PUBLIC_HORIZON_PREVIEW === '1' ? <HorizonPreview /> : <FoundationShowcase />;
  }
  return (
    <AccessProvider services={getDefaultAccessServices()}>
      <StatusBar style="auto" />
      <View style={{ flex: 1 }}>
        {pilot && <DeveloperPilotPanel />}
        <AccessStack />
      </View>
    </AccessProvider>
  );
}
