import { ActionButton } from './action-button';
import { BodyText } from './text';

export function DraftRecovery({ onRetry, onDiscard }: { onRetry(): void; onDiscard(): void }) {
  return (
    <>
      <BodyText>The saved draft on this device could not be read. Retry first. Discarding it deletes its retry key, so an action that already reached the server could be sent again; check the current list before discarding.</BodyText>
      <ActionButton secondary label="Retry reading saved draft" onPress={onRetry} />
      <ActionButton secondary label="Discard saved draft" onPress={onDiscard} />
    </>
  );
}
