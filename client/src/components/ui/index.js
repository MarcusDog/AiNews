import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

/**
 * 统计卡片组件 - 展示单个指标数据
 * @param {string} title - 卡片标题
 * @param {string|number} value - 显示数值
 * @param {string} subtitle - 副标题/描述
 * @param {string} trend - 趋势方向: 'up' | 'down' | 'neutral'
 * @param {number} trendValue - 趋势数值
 * @param {string} icon - 图标组件
 * @param {string} color - 主题颜色
 */
const StatCard = ({ title, value, subtitle, trend, trendValue, icon: Icon, color = 'blue' }) => {
  const colorStyles = {
    blue: 'from-blue-500 to-blue-600 bg-blue-50 text-blue-600',
    green: 'from-green-500 to-green-600 bg-green-50 text-green-600',
    purple: 'from-purple-500 to-purple-600 bg-purple-50 text-purple-600',
    orange: 'from-orange-500 to-orange-600 bg-orange-50 text-orange-600',
    red: 'from-red-500 to-red-600 bg-red-50 text-red-600',
    yellow: 'from-yellow-500 to-yellow-600 bg-yellow-50 text-yellow-600',
  };

  const styles = colorStyles[color] || colorStyles.blue;
  const [bgGradient, bgLight, textColor] = styles.split(' ');

  const getTrendIcon = () => {
    if (trend === 'up') return <TrendingUp className="w-4 h-4" />;
    if (trend === 'down') return <TrendingDown className="w-4 h-4" />;
    return <Minus className="w-4 h-4" />;
  };

  const getTrendColor = () => {
    if (trend === 'up') return 'text-green-600';
    if (trend === 'down') return 'text-red-600';
    return 'text-gray-500';
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-lg transition-all duration-300 card-hover">
      <div className="flex items-start justify-between">
        <div className={`p-3 rounded-xl bg-gradient-to-br ${bgGradient} text-white shadow-lg`}>
          {Icon && <Icon className="w-6 h-6" />}
        </div>
        
        {trend && (
          <div className={`flex items-center space-x-1 text-sm font-medium ${getTrendColor()}`}>
            {getTrendIcon()}
            <span>{trendValue > 0 ? '+' : ''}{trendValue}%</span>
          </div>
        )}
      </div>

      <div className="mt-4">
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
        {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
      </div>
    </div>
  );
};

/**
 * 进度条组件
 * @param {number} value - 当前值 (0-100)
 * @param {string} color - 颜色主题
 * @param {string} size - 尺寸: 'sm' | 'md' | 'lg'
 */
const ProgressBar = ({ value, color = 'blue', size = 'md' }) => {
  const colors = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    purple: 'bg-purple-500',
    orange: 'bg-orange-500',
    red: 'bg-red-500',
  };

  const heights = {
    sm: 'h-1.5',
    md: 'h-2.5',
    lg: 'h-4',
  };

  const clampedValue = Math.min(Math.max(value, 0), 100);

  return (
    <div className={`w-full bg-gray-200 rounded-full overflow-hidden ${heights[size]}`}>
      <div
        className={`${colors[color]} rounded-full transition-all duration-500 ease-out`}
        style={{ width: `${clampedValue}%` }}
      />
    </div>
  );
};

/**
 * 迷你图表组件 - 展示简单趋势
 * @param {array} data - 数据数组
 * @param {string} color - 线条颜色
 */
const MiniChart = ({ data, color = '#3B82F6' }) => {
  if (!data || data.length < 2) return null;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  
  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * 100;
    const y = 100 - ((value - min) / range) * 100;
    return `${x},${y}`;
  }).join(' ');

  const isUp = data[data.length - 1] >= data[0];
  const strokeColor = isUp ? '#10B981' : '#EF4444';

  return (
    <svg className="w-24 h-12" viewBox="0 0 100 100" preserveAspectRatio="none">
      <polyline
        fill="none"
        stroke={strokeColor}
        strokeWidth="3"
        points={points}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

/**
 * 标签组件
 * @param {string} text - 标签文本
 * @param {string} variant - 样式变体
 * @param {function} onClick - 点击事件
 */
const Tag = ({ text, variant = 'default', onClick }) => {
  const variants = {
    default: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
    primary: 'bg-blue-100 text-blue-700 hover:bg-blue-200',
    success: 'bg-green-100 text-green-700 hover:bg-green-200',
    warning: 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200',
    danger: 'bg-red-100 text-red-700 hover:bg-red-200',
    purple: 'bg-purple-100 text-purple-700 hover:bg-purple-200',
    pink: 'bg-pink-100 text-pink-700 hover:bg-pink-200',
  };

  return (
    <span
      onClick={onClick}
      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium transition-colors ${
        variants[variant] || variants.default
      } ${onClick ? 'cursor-pointer' : ''}`}
    >
      {text}
    </span>
  );
};

/**
 * 实时指示器组件
 */
const LiveIndicator = ({ isLive = true }) => {
  if (!isLive) {
    return (
      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full mr-1.5" />
        离线
      </span>
    );
  }

  return (
    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
      <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1.5 animate-pulse" />
      实时
    </span>
  );
};

/**
 * 数据网格组件 - 展示键值对数据
 * @param {array} data - 数据数组 [{label, value}]
 */
const DataGrid = ({ data }) => {
  return (
    <div className="grid grid-cols-2 gap-4">
      {data.map((item, index) => (
        <div key={index} className="bg-gray-50 rounded-xl p-4 hover:bg-gray-100 transition-colors">
          <p className="text-xs text-gray-500 uppercase tracking-wider">{item.label}</p>
          <p className="text-lg font-semibold text-gray-900 mt-1">{item.value}</p>
        </div>
      ))}
    </div>
  );
};

/**
 * 时间线组件
 * @param {array} items - 时间线项目
 */
const Timeline = ({ items }) => {
  return (
    <div className="space-y-4">
      {items.map((item, index) => (
        <div key={index} className="flex items-start space-x-3">
          <div className="flex flex-col items-center">
            <div className={`w-3 h-3 rounded-full ${item.active ? 'bg-blue-500' : 'bg-gray-300'}`} />
            {index < items.length - 1 && (
              <div className="w-0.5 h-full bg-gray-200 my-1" />
            )}
          </div>
          <div className="flex-1 pb-4">
            <p className="text-sm font-medium text-gray-900">{item.title}</p>
            <p className="text-xs text-gray-500 mt-0.5">{item.time}</p>
            {item.description && (
              <p className="text-sm text-gray-600 mt-1">{item.description}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export { StatCard, ProgressBar, MiniChart, Tag, LiveIndicator, DataGrid, Timeline };
