import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';

import { AccessProvider, AccessStack, getDefaultAccessServices } from '@/features/access';
import { DeveloperPilotPanel, developerPilotEnabled, HorizonPreview } from '@/features/horizon';
import { PreferencesProvider, usePreferences } from '@/lib/preferences-provider';
import { FoundationShowcase } from '@/showcase/foundation-showcase';
import { KaelMotionLab } from '@/showcase/kael-motion-lab';
import { KaelWorkflowLab } from '@/showcase/kael-workflow-lab';

export const unstable_settings = { anchor: 'index' };

function AppStatusBar() {
  return <StatusBar style={usePreferences().resolvedAppearance === 'dark' ? 'light' : 'dark'} />;
}

export default function RootLayout() {
  const pilot = developerPilotEnabled();
  if (!pilot && __DEV__ && process.env.EXPO_PUBLIC_DESIGN_SHOWCASE === '1') {
    if (process.env.EXPO_PUBLIC_KAEL_MOTION_LAB === '1') return <KaelMotionLab />;
    if (process.env.EXPO_PUBLIC_KAEL_WORKFLOW_LAB === '1') return <KaelWorkflowLab />;
    return process.env.EXPO_PUBLIC_HORIZON_PREVIEW === '1' ? <PreferencesProvider><HorizonPreview /></PreferencesProvider> : <FoundationShowcase />;
  }
  return (
    <PreferencesProvider>
      <AccessProvider services={getDefaultAccessServices()}>
        <AppStatusBar />
        <View style={{ flex: 1 }}>
          {pilot && <DeveloperPilotPanel />}
          <AccessStack />
        </View>
      </AccessProvider>
    </PreferencesProvider>
  );
}
