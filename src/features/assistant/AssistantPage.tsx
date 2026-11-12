import { useSearchParams } from 'react-router-dom';
import { Page } from '../../ui/layout';
import { AssistantChat } from './AssistantChat';
import type { AssistantProvider } from './provider';

/** Ask Homebase: help with fixes, planning and questions about this home. Works offline. */
export function AssistantPage({ provider }: { provider?: AssistantProvider }) {
  const [params] = useSearchParams();
  return (
    <Page title="Assistant" subtitle="Steps for leaks, heat, power and more. Runs on this device." profile>
      <AssistantChat provider={provider} initialQuestion={params.get('q') ?? undefined} />
    </Page>
  );
}
