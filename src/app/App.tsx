import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { DataProvider, useData } from '../data/DataProvider';
import { SessionProvider, useSession } from '../session/session';
import { Skeleton } from '../ui/layout';
import { ToastProvider } from '../ui/overlays';
import { AppShell } from './AppShell';
import { useReminders } from './reminders';
import { useApplyTheme } from './theme';
import { HomePage } from '../features/home/HomePage';
import { HomeActivityPage, HomeComingUpPage, HomeHealthPage, HomeSeasonPage } from '../features/home/HomeDetailPages';
import { PropertyPage } from '../features/property/PropertyPage';
import { PropertyDetailsPage } from '../features/property/PropertyDetailsPage';
import { RoomPage } from '../features/property/RoomPage';
import { InventoryPage } from '../features/property/InventoryPage';
import { ItemPage } from '../features/property/ItemPage';
import { SystemsPage } from '../features/property/SystemsPage';
import { KeysPage } from '../features/property/keys/KeysPage';
import { KeyPage } from '../features/property/keys/KeyPage';
import { TasksPage } from '../features/tasks/TasksPage';
import { TaskDetailPage } from '../features/tasks/TaskDetailPage';
import { AssistantPage } from '../features/assistant/AssistantPage';
import { RecordsPage } from '../features/records/RecordsPage';
import { RecordPage } from '../features/records/RecordPage';
import { ServiceHistoryPage } from '../features/records/ServiceHistoryPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { Onboarding } from '../features/onboarding/Onboarding';

// The key engine and its 20 MB of vision libraries load only when someone identifies a key.
const IdentifyKeyPage = lazy(() => import('../features/property/keys/IdentifyKeyPage'));

function Loading() {
  return (
    <div className="page">
      <div className="section">
        <Skeleton rows={4} label="Opening Homebase" />
      </div>
    </div>
  );
}

function StorageError({ message }: { message: string }) {
  return (
    <div className="onboarding">
      <div className="onboarding-card">
        <h1>Homebase can’t open its storage</h1>
        <p className="lead">{message}</p>
        <p className="lead">Open Homebase in a regular browser window, or check that site data isn’t blocked, then reload.</p>
        <div className="button-stack">
          <button type="button" className="button is-primary is-block" onClick={() => location.reload()}>
            Reload
          </button>
        </div>
      </div>
    </div>
  );
}

/** Sends people to onboarding until a household exists, and away from it afterwards. */
function Gate({ children }: { children: ReactNode }) {
  const session = useSession();
  const { pathname } = useLocation();
  if (!session.ready && pathname !== '/welcome') return <Navigate to="/welcome" replace />;
  if (session.ready && pathname === '/welcome') return <Navigate to="/home" replace />;
  return <>{children}</>;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function Effects() {
  const { settings } = useData();
  useApplyTheme(settings.theme);
  useReminders();
  return null;
}

export function App() {
  return (
    <DataProvider fallback={<Loading />} errorView={(message) => <StorageError message={message} />}>
      <SessionProvider>
        <ToastProvider>
          <Effects />
          <BrowserRouter>
            <ScrollToTop />
            <Gate>
              <Routes>
                <Route path="/welcome" element={<Onboarding />} />
                <Route element={<AppShell />}>
                  <Route path="/" element={<Navigate to="/home" replace />} />
                  <Route path="/home" element={<HomePage />} />
                  <Route path="/home/health" element={<HomeHealthPage />} />
                  <Route path="/home/season" element={<HomeSeasonPage />} />
                  <Route path="/home/coming-up" element={<HomeComingUpPage />} />
                  <Route path="/home/activity" element={<HomeActivityPage />} />
                  <Route path="/property" element={<PropertyPage />} />
                  <Route path="/property/details" element={<PropertyDetailsPage />} />
                  <Route path="/property/rooms/:roomId" element={<RoomPage />} />
                  <Route path="/property/systems" element={<SystemsPage />} />
                  <Route path="/property/inventory" element={<InventoryPage />} />
                  <Route path="/property/items/:itemId" element={<ItemPage />} />
                  <Route path="/property/keys" element={<KeysPage />} />
                  <Route path="/property/keys/:keyId" element={<KeyPage />} />
                  <Route
                    path="/property/identify-key"
                    element={
                      <Suspense fallback={<Loading />}>
                        <IdentifyKeyPage />
                      </Suspense>
                    }
                  />
                  <Route path="/tasks" element={<TasksPage />} />
                  <Route path="/tasks/:taskId" element={<TaskDetailPage />} />
                  <Route path="/assistant" element={<AssistantPage />} />
                  <Route path="/records" element={<RecordsPage />} />
                  <Route path="/records/service-history" element={<ServiceHistoryPage />} />
                  <Route path="/records/:recordId" element={<RecordPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="*" element={<Navigate to="/home" replace />} />
                </Route>
              </Routes>
            </Gate>
          </BrowserRouter>
        </ToastProvider>
      </SessionProvider>
    </DataProvider>
  );
}
