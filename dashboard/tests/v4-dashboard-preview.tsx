import React from 'react';
import ReactDOM from 'react-dom/client';
import { DashboardPreview } from '../src/components/v4/DashboardPreview';
import { ThemeProvider } from '../src/components/v4/ThemeProvider';
import '../src/style.css';
import '../src/components/v4/v4-components.css';

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><ThemeProvider><DashboardPreview/></ThemeProvider></React.StrictMode>);
