import React, { useMemo, useState } from 'react';
import { ArrowRight, BadgeCheck, Eye, EyeOff, KeyRound, Mail, UserRound } from 'lucide-react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';

import AuthShell from '../components/AuthShell';
import { useAuth } from '../contexts/AuthContext';

const RegisterPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { register, isAuthenticated, isLoading, authError, clearAuthError } = useAuth();
  const [form, setForm] = useState({
    displayName: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [localError, setLocalError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const redirectTo = searchParams.get('redirect') || '/account';

  const passwordHint = useMemo(() => {
    if (!form.password) return '建议至少 8 位，便于后续公开站点上线。';
    if (form.password.length < 8) return '密码长度至少 8 位。';
    if (form.password.length < 12) return '已经满足基本强度，可以继续增强。';
    return '密码强度较好。';
  }, [form.password]);

  if (isAuthenticated) {
    return <Navigate to={redirectTo} replace />;
  }

  const handleChange = (key, value) => {
    setLocalError('');
    clearAuthError();
    setForm((prev) => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!form.email.trim() || !form.password) {
      setLocalError('请完整填写邮箱和密码');
      return;
    }

    if (form.password !== form.confirmPassword) {
      setLocalError('两次输入的密码不一致');
      return;
    }

    if (form.password.length < 8) {
      setLocalError('密码长度至少 8 位');
      return;
    }

    try {
      await register({
        displayName: form.displayName,
        email: form.email,
        password: form.password
      });
      navigate(redirectTo, { replace: true });
    } catch (error) {
      setLocalError(error.message);
    }
  };

  const errorMessage = localError || authError;

  return (
    <AuthShell
      eyebrow="Create Account"
      title="注册"
      subtitle=""
      alternateAction={(
        <Link
          to={`/login${redirectTo ? `?redirect=${encodeURIComponent(redirectTo)}` : ''}`}
          className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
        >
          去登录
        </Link>
      )}
    >
      <div className="space-y-8">
        <div className="space-y-2">
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900">创建账号</h2>
          <p className="text-sm text-slate-500">填写信息后即可注册</p>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">昵称</span>
            <div className="relative">
              <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={form.displayName}
                onChange={(event) => handleChange('displayName', event.target.value)}
                placeholder="例如：Alice"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-10 py-3 text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100"
                autoComplete="nickname"
              />
            </div>
          </label>

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
                placeholder="至少 8 位密码"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-10 py-3 pr-12 text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-700"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className={`mt-2 text-xs ${form.password.length >= 8 ? 'text-emerald-700' : 'text-slate-500'}`}>
              {passwordHint}
            </p>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">确认密码</span>
            <div className="relative">
              <BadgeCheck className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={form.confirmPassword}
                onChange={(event) => handleChange('confirmPassword', event.target.value)}
                placeholder="再次输入密码"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-10 py-3 pr-12 text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-700"
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
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
            {isLoading ? '注册中...' : '创建账号'}
            <ArrowRight className="ml-2 h-4 w-4" />
          </button>
        </form>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-600">
          已有账号？
          <Link
            to={`/login${redirectTo ? `?redirect=${encodeURIComponent(redirectTo)}` : ''}`}
            className="ml-1 font-medium text-sky-700 hover:text-sky-800"
          >
            去登录
          </Link>
          。
        </div>
      </div>
    </AuthShell>
  );
};

export default RegisterPage;
