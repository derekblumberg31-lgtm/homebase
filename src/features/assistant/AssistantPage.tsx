import { useSearchParams } from 'react-router-dom';
import { Page } from '../../ui/layout';
import { AssistantChat } from './AssistantChat';
import type { AssistantProvider } from './provider';

/** Ask Homebase: help with fixes, planning and questions about this home. Works offline. */
export function AssistantPage({ provider }: { provider?: AssistantProvider }) {
  const [params] = useSearchParams();
  return (
    <Page title="Assistant" subtitle="Tell me what’s wrong. I’ll start with safety, ask a few questions, and help you turn it into a task or a record." profile>
      <AssistantChat provider={provider} initialQuestion={params.get('q') ?? undefined} />
    </Page>
  );
}
