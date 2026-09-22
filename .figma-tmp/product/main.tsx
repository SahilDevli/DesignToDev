import { createRoot } from 'react-dom/client';
import '../../src/designToken.css';
import '../../src/index.css';
import ProductPage from '../../src/pages/ProductPage/ProductPage';
createRoot(document.getElementById('root')!).render(<ProductPage />);
