import { createRoot } from 'react-dom/client';
import '../../src/designToken.css';
import '../../src/index.css';
import HomePage from '../../src/pages/HomePage/HomePage';
createRoot(document.getElementById('root')!).render(<HomePage />);
