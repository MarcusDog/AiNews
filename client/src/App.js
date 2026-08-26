import React, { useState, useCallback } from 'react';
import { HashRouter as Router, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import './index.css';

// 导入上下文
import { SocketProvider } from './contexts/SocketContext';
import { AuthProvider } from './contexts/AuthContext';
import { UserDataProvider } from './contexts/UserDataContext';

// 导入组件
import Header from './components/Header';
import NewsList from './components/NewsList';
import NewsDetail from './components/NewsDetail';
import Analytics from './pages/Analytics';
import SearchPage from './pages/SearchPage';
import GlossaryPage from './pages/GlossaryPage';
import FavoritesPage from './pages/FavoritesPage';
import SkillPage from './pages/SkillPage';
import AdminPage from './pages/AdminPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import AccountPage from './pages/AccountPage';
import ProtectedRoute from './components/ProtectedRoute';

function AppContent() {
  const [selectedCategory, setSelectedCategory] = useState('全部');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const location = useLocation();

  const handleRefresh = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  const isAuthPage = location.pathname === '/login' || location.pathname === '/register';
  const isAdminPage = location.pathname === '/admin';
  const isBarePage = isAuthPage || isAdminPage;

  return (
    <div className={`min-h-screen ${isBarePage ? 'bg-[#f7f4ed]' : 'bg-[#f1eee7]'}`}>
      {!isBarePage ? (
        <Header
          onRefresh={handleRefresh}
          selectedCategory={selectedCategory}
          setSelectedCategory={setSelectedCategory}
        />
      ) : null}

      <main className={isBarePage ? 'min-w-0' : 'min-w-0 pt-[132px] lg:pt-[88px]'}>
        <div className={isBarePage ? 'w-full' : 'w-full px-4 py-6 sm:px-6 lg:px-8 lg:py-8'}>
          <div className="w-full">
            <Routes>
              <Route
                path="/"
                element={
                  <NewsList
                    category={selectedCategory}
                    refreshTrigger={refreshTrigger}
                  />
                }
              />
              <Route path="/news/:id" element={<NewsDetail />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/settings" element={<Navigate to="/admin" replace />} />
              <Route path="/glossary" element={<GlossaryPage />} />
              <Route path="/glossary/architecture-guide" element={<Navigate to="/glossary" replace />} />
              <Route path="/health" element={<Navigate to="/admin" replace />} />
              <Route path="/favorites" element={<FavoritesPage />} />
              <Route path="/skills" element={<SkillPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/admin" element={<AdminPage />} />
              <Route
                path="/account"
                element={(
                  <ProtectedRoute>
                    <AccountPage />
                  </ProtectedRoute>
                )}
              />
            </Routes>
          </div>
        </div>
      </main>

    </div>
  );
}

function App() {
  return (
    <SocketProvider>
      <AuthProvider>
        <UserDataProvider>
          <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <AppContent />
          </Router>
        </UserDataProvider>
      </AuthProvider>
    </SocketProvider>
  );
}

export default App;
