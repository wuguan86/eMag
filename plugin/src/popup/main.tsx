import { createRoot } from 'react-dom/client';
import { Toolkit } from '../components/Toolkit';
import { ErrorBoundary } from '../components/ErrorBoundary';
import '../styles.css';

document.body.classList.add('popup-body');
createRoot(document.getElementById('root')!).render(<ErrorBoundary>
  <Toolkit product={null} popup/>
</ErrorBoundary>);
