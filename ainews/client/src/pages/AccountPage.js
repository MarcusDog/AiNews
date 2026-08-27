import React, { useMemo, useState } from 'react';
import {
  BadgeCheck,
  KeyRound,
  LockKeyhole,
  Mail,
  ShieldCheck,
  UserRound
} from 'lucide-react';

import { useAuth } from '../contexts/AuthContext';

const initialPasswordForm = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: ''
};

const AccountPage = () => {
  const {
    user,
    isLoading,
    authError,
    clearAuthError,
    updateProfile,
    changePassword
  } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [passwordForm, setPasswordForm] = useState(initialPasswordForm);
  const [profileMessage, setProfileMessage] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [localError, setLocalError] = useState('');

  const strengthLabel = useMemo(() => {
    if (!passwordForm.newPassword) return '请输入至少 8 位的新密码';
    if (passwordForm.newPassword.length < 8) return '密码过短';
    if (passwordForm.newPassword.length < 12) return '密码强度中等';
    return '密码强度较好';
  }, [passwordForm.newPassword]);

  const handleProfileSubmit = async (event) => {
    event.preventDefault();
    setLocalError('');
    setProfileMessage('');
    clearAuthError();

    try {
      const updatedUser = await updateProfile({ displayName });
      setDisplayName(updatedUser.displayName || '');
      setProfileMessage('账户资料已更新');
    } catch (error) {
      setLocalError(error.message);
    }
  };

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();
    setLocalError('');
    setPasswordMessage('');
    clearAuthError();

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setLocalError('两次输入的新密码不一致');
      return;
    }

    try {
      await changePassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword
      });
      setPasswordMessage('密码已更新，下次登录将使用新密码');
      setPasswordForm(initialPasswordForm);
    } catch (error) {
      setLocalError(error.message);
    }
  };

  const message = localError || authError;

  return (
    <div className="mx-auto max-w-6xl space-y-8 fade-in">
      <section className="overflow-hidden border border-[#d2c9bb] bg-[#e9e2d7] px-6 py-8 text-[#292621] sm:px-8 lg:px-10">
        <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div className="space-y-5">
            <div className="inline-flex border border-[#c5b8a8] bg-[#f6f2eb] px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-[#7d4436]">
              Account Center
            </div>
            <div className="space-y-3">
              <h1 className="max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl">
                把账号体系从“能登录”推进到“能运营”。
              </h1>
              <p className="max-w-2xl text-base leading-7 text-[#655e56]">
                这里已经接上真实数据库资料、密码更新能力，以及后续 Google OAuth 的预留状态。后面继续做公开站点时，这一页就是用户中心的基础。
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <div className="border border-[#d3c9bc] bg-[#f7f3ec] p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-[#7d4436]">当前账号</div>
              <div className="mt-2 text-xl font-semibold">{user?.displayName || '未命名用户'}</div>
              <div className="mt-1 text-sm text-[#6d655c]">{user?.email}</div>
            </div>
            <div className="border border-[#d3c9bc] bg-[#f7f3ec] p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-[#7d4436]">登录方式</div>
              <div className="mt-2 text-xl font-semibold">邮箱 + 密码</div>
              <div className="mt-1 text-sm text-[#6d655c]">Google OAuth 预留中</div>
            </div>
            <div className="border border-[#d3c9bc] bg-[#f7f3ec] p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-[#7d4436]">更新节奏</div>
              <div className="mt-2 text-xl font-semibold">08:00 / 3h</div>
              <div className="mt-1 text-sm text-[#6d655c]">适合公开站点持续抓取</div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70 sm:p-8">
          <div className="mb-6 space-y-2">
            <h2 className="text-2xl font-semibold text-slate-900">账户资料</h2>
            <p className="text-sm leading-6 text-slate-600">
              现在支持直接更新昵称。邮箱仍作为主登录标识，后续 OAuth 绑定时会复用同一用户记录。
            </p>
          </div>

          <form className="space-y-5" onSubmit={handleProfileSubmit}>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">邮箱</span>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  value={user?.email || ''}
                  disabled
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-10 py-3 text-slate-500 outline-none"
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">昵称</span>
              <div className="relative">
                <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={displayName}
                  onChange={(event) => {
                    setProfileMessage('');
                    setDisplayName(event.target.value);
                  }}
                  placeholder="输入你的展示名"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-10 py-3 text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100"
                />
              </div>
            </label>

            {profileMessage ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {profileMessage}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex items-center bg-[#7d4436] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#65372d] disabled:opacity-60"
            >
              <BadgeCheck className="mr-2 h-4 w-4" />
              保存资料
            </button>
          </form>
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70 sm:p-8">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold text-slate-900">登录安全</h2>
              <p className="text-sm leading-6 text-slate-600">
                当前可直接修改密码。等 Google OAuth 接入后，这里会继续扩展到账户绑定和多登录方式管理。
              </p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-900">
              OAuth 扩展位已保留
            </div>
          </div>

          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <ShieldCheck className="mb-3 h-5 w-5 text-emerald-600" />
              <div className="text-sm font-medium text-slate-900">密码登录</div>
              <div className="mt-1 text-sm text-slate-500">已启用</div>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <LockKeyhole className="mb-3 h-5 w-5 text-sky-600" />
              <div className="text-sm font-medium text-slate-900">会话持久化</div>
              <div className="mt-1 text-sm text-slate-500">数据库会话管理</div>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <KeyRound className="mb-3 h-5 w-5 text-[#7d4436]" />
              <div className="text-sm font-medium text-slate-900">Google OAuth</div>
              <div className="mt-1 text-sm text-slate-500">后续接入</div>
            </div>
          </div>

          <form className="space-y-4" onSubmit={handlePasswordSubmit}>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">当前密码</span>
              <input
                type="password"
                value={passwordForm.currentPassword}
                onChange={(event) => {
                  setPasswordMessage('');
                  setPasswordForm((prev) => ({ ...prev, currentPassword: event.target.value }));
                }}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100"
                autoComplete="current-password"
              />
            </label>

            <div className="grid gap-4 lg:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">新密码</span>
                <input
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(event) => {
                    setPasswordMessage('');
                    setPasswordForm((prev) => ({ ...prev, newPassword: event.target.value }));
                  }}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100"
                  autoComplete="new-password"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">确认新密码</span>
                <input
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(event) => {
                    setPasswordMessage('');
                    setPasswordForm((prev) => ({ ...prev, confirmPassword: event.target.value }));
                  }}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100"
                  autoComplete="new-password"
                />
              </label>
            </div>

            <div className="text-xs text-slate-500">{strengthLabel}</div>

            {message ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {message}
              </div>
            ) : null}

            {passwordMessage ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {passwordMessage}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex items-center bg-[#7d4436] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#65372d] disabled:opacity-60"
            >
              更新密码
            </button>
          </form>
        </section>
      </div>
    </div>
  );
};

export default AccountPage;
