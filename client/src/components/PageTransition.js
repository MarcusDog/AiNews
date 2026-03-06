import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

// 纯CSS实现的页面过渡动画组件
const PageTransition = ({ children }) => {
  const location = useLocation();
  const [isVisible, setIsVisible] = useState(false);
  const [displayChildren, setDisplayChildren] = useState(children);

  useEffect(() => {
    // 路由变化时，先隐藏当前页面
    setIsVisible(false);
    
    // 短暂延迟后显示新页面（实现过渡效果）
    const timer = setTimeout(() => {
      setDisplayChildren(children);
      setIsVisible(true);
    }, 150);

    return () => clearTimeout(timer);
  }, [location.pathname, children]);

  return (
    <div
      className={`w-full transition-all duration-300 ease-out ${
        isVisible 
          ? 'opacity-100 translate-y-0' 
          : 'opacity-0 translate-y-4'
      }`}
      style={{
        willChange: 'opacity, transform'
      }}
    >
      {displayChildren}
    </div>
  );
};

export default PageTransition;
