import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';

import { AccessProvider, AccessStack, getDefaultAccessServices } from '@/features/access';
import { DeveloperPilotPanel, developerPilotEnabled } from '@/features/horizon';
import { PreferencesProvider, usePreferences } from '@/lib/preferences-provider';
import { useTypeface } from '@/theme/use-typeface';

export const unstable_settings = { anchor: 'index' };

function AppStatusBar() {
  return <StatusBar style={usePreferences().resolvedAppearance === 'dark' ? 'light' : 'dark'} />;
}

export default function RootLayout() {
  const typefaceReady = useTypeface();
  const pilot = developerPilotEnabled();
  if (!typefaceReady) return null;
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
