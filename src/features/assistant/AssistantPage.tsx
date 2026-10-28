import { Page } from '../../ui/layout';
import { AssistantChat } from './AssistantChat';
import type { AssistantProvider } from './provider';

/** Ask Homebase: help with fixes, planning and questions about this home. Works offline. */
export function AssistantPage({ provider }: { provider?: AssistantProvider }) {
  return (
    <Page title="Assistant" profile>
      <AssistantChat provider={provider} />
    </Page>
  );
}
