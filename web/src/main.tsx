import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Apply from './pages/Apply';
import Status from './pages/Status';
import Dashboard from './pages/Dashboard';
import Review from './pages/Review';
import Admin from './pages/Admin';
import Accommodation from './pages/Accommodation';

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/apply" replace />} />
        <Route path="/apply" element={<Apply />} />
        <Route path="/status/:applicationId" element={<Status />} />
        <Route path="/reviewer" element={<Dashboard />} />
        <Route path="/reviewer/:applicationId" element={<Review />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/accommodation" element={<Accommodation />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
