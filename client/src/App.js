import React, { useState, useCallback } from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import './index.css';

// 导入上下文
import { SocketProvider } from './contexts/SocketContext';
import { UserDataProvider } from './contexts/UserDataContext';

// 导入组件
import Header from './components/Header';
import PageTransition from './components/PageTransition';
import NewsList from './components/NewsList';
import NewsDetail from './components/NewsDetail';
import Analytics from './pages/Analytics';
import SearchPage from './pages/SearchPage';
import SettingsPage from './pages/SettingsPage';
import GlossaryPage from './pages/GlossaryPage';
import HealthPage from './pages/HealthPage';
import FavoritesPage from './pages/FavoritesPage';
import SystemStatus from './components/SystemStatus';

function AppContent() {
  const [selectedCategory, setSelectedCategory] = useState('全部');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleRefresh = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 - 包含所有功能入口 */}
      <Header
        onRefresh={handleRefresh}
        selectedCategory={selectedCategory}
        setSelectedCategory={setSelectedCategory}
      />

      {/* 主内容区域 */}
      <main className="pt-28 lg:pt-16 min-w-0">
        <div className="w-full px-4 sm:px-6 lg:px-8 py-6">
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
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/glossary" element={<GlossaryPage />} />
              <Route path="/health" element={<HealthPage />} />
              <Route path="/favorites" element={<FavoritesPage />} />
            </Routes>
          </div>
        </div>
      </main>

      {/* 系统状态指示器 */}
      <SystemStatus onRefresh={handleRefresh} />
    </div>
  );
}

function App() {
  return (
    <SocketProvider>
      <UserDataProvider>
        <Router>
          <AppContent />
        </Router>
      </UserDataProvider>
    </SocketProvider>
  );
}

export default App;
