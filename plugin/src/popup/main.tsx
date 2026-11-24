import { createRoot } from 'react-dom/client';
import { Toolkit } from '../components/Toolkit';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { GpsrNameServiceSettingsPage } from '../components/GpsrNameServiceSettings';
import '../styles.css';

document.body.classList.add('popup-body');
const showGpsrSettings = new URLSearchParams(location.search).has('gpsr-service-settings');
createRoot(document.getElementById('root')!).render(<ErrorBoundary>
  {showGpsrSettings ? <GpsrNameServiceSettingsPage/> : <Toolkit product={null} popup/>}
</ErrorBoundary>);
