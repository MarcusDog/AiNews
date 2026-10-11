import React, { useEffect, useState } from 'react';
import { ArrowRight, Eye, EyeOff, KeyRound, Mail, ShieldCheck } from 'lucide-react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';

import AuthShell from '../components/AuthShell';
import { useAuth } from '../contexts/AuthContext';

const LoginPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, isAuthenticated, isLoading, authError, clearAuthError } = useAuth();
  const [form, setForm] = useState({
    email: '',
    password: ''
  });
  const [localError, setLocalError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const redirectTo = searchParams.get('redirect') || '/account';

  useEffect(() => {
    setLocalError('');
  }, [form.email, form.password]);

  if (isAuthenticated) {
    return <Navigate to={redirectTo} replace />;
  }

  const handleChange = (key, value) => {
    clearAuthError();
    setForm((prev) => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!form.email.trim() || !form.password) {
      setLocalError('请输入邮箱和密码');
      return;
    }

    try {
      await login(form);
      navigate(redirectTo, { replace: true });
    } catch (error) {
      setLocalError(error.message);
    }
  };

  const errorMessage = localError || authError;

  return (
    <AuthShell
      eyebrow="Sign In"
      title="登录"
      subtitle=""
      alternateAction={(
        <Link
          to={`/register${redirectTo ? `?redirect=${encodeURIComponent(redirectTo)}` : ''}`}
          className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
        >
          去注册
        </Link>
      )}
    >
      <div className="space-y-8">
        <div className="space-y-2">
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900">欢迎回来</h2>
          <p className="text-sm text-slate-500">请输入邮箱和密码</p>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">邮箱</span>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                value={form.email}
                onChange={(event) => handleChange('email', event.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-10 py-3 text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100"
                autoComplete="email"
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">密码</span>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={(event) => handleChange('password', event.target.value)}
                placeholder="请输入密码"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-10 py-3 pr-12 text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-700"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </label>

          {errorMessage ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {errorMessage}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isLoading}
            className="inline-flex w-full items-center justify-center bg-[#7d4436] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#65372d] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <ShieldCheck className="mr-2 h-4 w-4" />
            {isLoading ? '登录中...' : '登录账号'}
            <ArrowRight className="ml-2 h-4 w-4" />
          </button>
        </form>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-600">
          没有账号？前往
          <Link
            to={`/register${redirectTo ? `?redirect=${encodeURIComponent(redirectTo)}` : ''}`}
            className="ml-1 font-medium text-sky-700 hover:text-sky-800"
          >
            注册
          </Link>
          。
        </div>
      </div>
    </AuthShell>
  );
};

export default LoginPage;
